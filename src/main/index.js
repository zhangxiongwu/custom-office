const { app, BrowserWindow, ipcMain, protocol } = require("electron");
const { join } = require("path");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

// 必须在 app.ready 之前注册，使 file:// 协议在 iframe、worker 等所有上下文中可用
protocol.registerSchemesAsPrivileged([
  {
    scheme: "file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// myModule - 内联（electron-vite externalize 不会打包非 node_modules）
const myModuleValue = 123;
function showNumber() {
  console.log(myModuleValue);
  return myModuleValue;
}

const CUSTOM_PROTOCOL = "customOffice";

let mainWindow;
let startupProtocolUrl = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine, _workingDirectory) => {
    const protocolUrl = getProtocolUrlFromArgs(commandLine);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (protocolUrl) {
      sendProtocolUrlToRenderer(protocolUrl);
    }
  });
}

function getProtocolUrlFromArgs(args) {
  console.log("[Main] getProtocolUrlFromArgs, CUSTOM_PROTOCOL:", CUSTOM_PROTOCOL);
  for (const arg of args) {
    console.log("[Main] checking arg:", arg);
    if (arg && arg.toLowerCase().startsWith(`${CUSTOM_PROTOCOL.toLowerCase()}://`)) {
      console.log("[Main] matched protocol URL:", arg);
      return arg;
    }
  }
  console.log("[Main] no protocol URL found in args");
  return null;
}

function parseProtocolUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      params: Object.fromEntries(parsed.searchParams.entries()),
      raw: url,
    };
  } catch (e) {
    return { raw: url, error: e.message };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Custom Office",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: join(__dirname, "../preload/index.js"),
    },
  });

  // electron-vite 开发模式加载 dev server，生产模式加载文件
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (startupProtocolUrl) {
      sendProtocolUrlToRenderer(startupProtocolUrl);
      startupProtocolUrl = null;
    }
  });
}

function sendProtocolUrlToRenderer(url) {
  console.log("[Main] sendProtocolUrlToRenderer called, url:", url);
  if (mainWindow && mainWindow.webContents) {
    const parsed = parseProtocolUrl(url);
    console.log("[Main] parsed protocol data:", JSON.stringify(parsed));
    mainWindow.webContents.send("protocol-url", parsed);
  } else {
    console.log("[Main] no window to send to, mainWindow:", !!mainWindow);
  }
}

app.whenReady().then(() => {
  console.log("模块值:", myModuleValue);
  showNumber();

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [
        join(__dirname, "../..", process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL);
  }

  startupProtocolUrl = getProtocolUrlFromArgs(process.argv);
  createWindow();
});

app.on("open-url", (_event, url) => {
  sendProtocolUrlToRenderer(url);
});

ipcMain.handle("get-startup-protocol-url", () => {
  const url = startupProtocolUrl;
  startupProtocolUrl = null;
  return url ? parseProtocolUrl(url) : null;
});

ipcMain.handle("read-local-file", async (_event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer.toString("base64") };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on("start-download", (_event, { url, fileName }) => {
  console.log("[Main] start-download received, url:", url, "fileName:", fileName);

  const appPath = app.getAppPath();
  const projectRoot = appPath.endsWith(".asar") ? path.dirname(appPath) : appPath;
  const tmpDir = join(projectRoot, "tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
    console.log("[Main] created tmp dir:", tmpDir);
  }
  const destPath = join(tmpDir, fileName);

  const sendProgress = (received, total) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("download-progress", { received, total });
    }
  };

  const sendComplete = (result) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("download-complete", result);
    }
  };

  const doDownload = (downloadUrl) => {
    const proto = downloadUrl.startsWith("https") ? https : http;
    console.log("[Main] starting HTTP GET:", downloadUrl);

    const req = proto.get(downloadUrl, (response) => {
      console.log("[Main] response status:", response.statusCode, "headers:", JSON.stringify(response.headers));

      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location;
        console.log("[Main] following redirect to:", redirectUrl);
        doDownload(redirectUrl);
        return;
      }

      const total = parseInt(response.headers["content-length"] || "0", 10);
      console.log("[Main] content-length:", total);
      let received = 0;
      const chunks = [];

      response.on("data", (chunk) => {
        chunks.push(chunk);
        received += chunk.length;
        sendProgress(received, total);
      });

      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(destPath, buffer);
        console.log("[Main] download complete, size:", buffer.length, "saved to:", destPath);
        sendComplete({
          success: true,
          filePath: destPath,
          data: buffer.toString("base64"),
          size: buffer.length,
        });
      });

      response.on("error", (err) => {
        console.error("[Main] download response error:", err);
        sendComplete({ success: false, error: err.message });
      });
    });

    req.on("error", (err) => {
      console.error("[Main] download request error:", err);
      sendComplete({ success: false, error: err.message });
    });
  };

  doDownload(url);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});