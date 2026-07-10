const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { value, showNumber } = require("./myModule");

const CUSTOM_PROTOCOL = "customOffice";

let mainWindow;

// 启动时获取命令行参数中可能带的协议 URL
let startupProtocolUrl = null;

// 获取单实例锁
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine, _workingDirectory) => {
    // 第二个实例启动时，检查命令行中是否包含协议 URL
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

// 从命令行参数中提取自定义协议 URL
function getProtocolUrlFromArgs(args) {
  for (const arg of args) {
    if (arg && arg.startsWith(`${CUSTOM_PROTOCOL}://`)) {
      return arg;
    }
  }
  return null;
}

// 解析协议 URL
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
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: "Custom Office",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 页面加载完成后，如果有启动时传入的协议 URL，发送给渲染进程
  mainWindow.webContents.on("did-finish-load", () => {
    if (startupProtocolUrl) {
      sendProtocolUrlToRenderer(startupProtocolUrl);
      startupProtocolUrl = null;
    }
  });
}

// 发送协议 URL 到渲染进程
function sendProtocolUrlToRenderer(url) {
  if (mainWindow && mainWindow.webContents) {
    const parsed = parseProtocolUrl(url);
    mainWindow.webContents.send("protocol-url", parsed);
  }
}

app.whenReady().then(() => {
  console.log("模块值:", value);
  showNumber();

  // 注册自定义协议（仅在打包后的应用中生效，开发模式需手动注册）
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL);
  }

  // 检查启动命令行中是否包含协议 URL
  startupProtocolUrl = getProtocolUrlFromArgs(process.argv);

  createWindow();
});

// 处理 macOS 的 open-url 事件
app.on("open-url", (_event, url) => {
  sendProtocolUrlToRenderer(url);
});

// 监听渲染进程主动请求协议 URL
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