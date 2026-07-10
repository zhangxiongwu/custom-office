const { contextBridge, ipcRenderer } = require("electron");

const myModuleValue = 123;

contextBridge.exposeInMainWorld("versions", {
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
});

contextBridge.exposeInMainWorld("myModule", {
  value: myModuleValue,
});

contextBridge.exposeInMainWorld("customProtocol", {
  onProtocolUrl: (callback) => {
    ipcRenderer.on("protocol-url", (_event, data) => {
      callback(data);
    });
  },
  getStartupProtocolUrl: () => ipcRenderer.invoke("get-startup-protocol-url"),
});

contextBridge.exposeInMainWorld("fileSystem", {
  readLocalFile: (filePath) => ipcRenderer.invoke("read-local-file", filePath),
  startDownload: (url, fileName) =>
    ipcRenderer.send("start-download", { url, fileName }),
  onDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("download-progress", listener);
    return () => ipcRenderer.removeListener("download-progress", listener);
  },
  onDownloadComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("download-complete", listener);
    return () => ipcRenderer.removeListener("download-complete", listener);
  },
});