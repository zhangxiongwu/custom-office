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