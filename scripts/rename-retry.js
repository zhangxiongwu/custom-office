/**
 * 全局 monkey-patch fs.promises.rename
 * 对 .tmp 目录的 EPERM 错误进行重试（解决 Windows Defender 锁文件问题）
 * 通过 NODE_OPTIONS="--require scripts/rename-retry.js" 注入
 */
const fs = require("fs");

const origRename = fs.promises.rename;
fs.promises.rename = async function (oldPath, newPath) {
  if (
    typeof oldPath === "string" &&
    oldPath.endsWith(".tmp") &&
    typeof newPath === "string" &&
    !newPath.endsWith(".tmp")
  ) {
    for (let i = 0; ; i++) {
      try {
        return await origRename(oldPath, newPath);
      } catch (e) {
        if (e.code === "EPERM" && i < 10) {
          console.log(`[rename-retry] EPERM on "${oldPath}", retrying (${i + 1}/10)...`);
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
          continue;
        }
        throw e;
      }
    }
  }
  return origRename(oldPath, newPath);
};