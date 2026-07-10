/**
 * Custom Office 构建脚本
 * 通过 NODE_OPTIONS 将 rename-retry hook 注入 electron-builder 子进程
 * 解决 Windows Defender 锁定 .tmp 目录导致 EPERM 的问题
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// 清理 dist 目录
const distPath = path.join(__dirname, "..", "dist");
if (fs.existsSync(distPath)) {
  try {
    fs.rmSync(distPath, { recursive: true, force: true });
    console.log("[build] dist directory cleaned.");
  } catch (e) {
    console.error("[build] Failed to clean dist:", e.message);
    process.exit(1);
  }
}

// 杀掉残留进程
try { execSync('taskkill /F /IM "Electron.exe" 2>nul', { stdio: "ignore" }); } catch {}
try { execSync('taskkill /F /IM "Custom Office.exe" 2>nul', { stdio: "ignore" }); } catch {}

// 先执行 electron-vite build 构建渲染进程
console.log("[build] Running electron-vite build...\n");
try {
  execSync("npx electron-vite build", { stdio: "inherit" });
  console.log("\n[build] electron-vite build SUCCESS.");
} catch (e) {
  console.error(`\n[build] electron-vite build FAILED with error code ${e.status || 1}`);
  process.exit(e.status || 1);
}

// 构建 hook 脚本的绝对路径，通过 NODE_OPTIONS 注入子进程
// 注意：在 Windows 下，execSync 经 cmd.exe 会将反斜杠吃掉的引号内容，所以不引号包裹
// 路径中无空格即安全
const hookPath = path.join(__dirname, "rename-retry.js");
const preload = `--require ${hookPath}`;
const nodeOptions = process.env.NODE_OPTIONS
  ? `${process.env.NODE_OPTIONS} ${preload}`
  : preload;

// 执行构建
console.log("[build] Starting electron-builder...\n");
try {
  execSync("npx electron-builder --win --config electron-builder.yml", {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  });
  console.log("\n[build] Build SUCCESS! Check dist/ folder.");
} catch (e) {
  console.error(`\n[build] Build FAILED with error code ${e.status || 1}`);
  process.exit(e.status || 1);
}