const { contextBridge, ipcRenderer } = require("electron");
const { value } = require("./myModule");

contextBridge.exposeInMainWorld("versions", {
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
});

contextBridge.exposeInMainWorld("myModule", {
  value,
});

// 暴露协议 URL 相关的 API
contextBridge.exposeInMainWorld("customProtocol", {
  // 监听主进程发来的协议 URL
  onProtocolUrl: (callback) => {
    ipcRenderer.on("protocol-url", (_event, data) => {
      callback(data);
    });
  },
  // 主动获取启动时的协议 URL
  getStartupProtocolUrl: () => ipcRenderer.invoke("get-startup-protocol-url"),
});