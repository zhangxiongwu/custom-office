const { contextBridge } = require("electron");
const { value } = require("./myModule");

contextBridge.exposeInMainWorld("versions", {
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
});

contextBridge.exposeInMainWorld("myModule", {
  value,
});