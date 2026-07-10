const { app, BrowserWindow, ipcMain } = require("electron");
const { join } = require("path");

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
  for (const arg of args) {
    if (arg && arg.startsWith(`${CUSTOM_PROTOCOL}://`)) {
      return arg;
    }
  }
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
  if (mainWindow && mainWindow.webContents) {
    const parsed = parseProtocolUrl(url);
    mainWindow.webContents.send("protocol-url", parsed);
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