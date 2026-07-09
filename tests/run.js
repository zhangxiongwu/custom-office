/**
 * Custom Office 项目自测脚本
 * 验证项目配置、文件完整性、依赖安装、构建产物
 */

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    错误: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function fileExists(filePath) {
  return fs.existsSync(path.join(__dirname, "..", filePath));
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", filePath), "utf-8"));
}

console.log("Custom Office - 自测开始\n");

// ---- 1. 项目文件结构 ----
console.log("=== 1. 项目文件结构 ===");

test(".npmrc 存在", () => {
  assert(fileExists(".npmrc"), ".npmrc 文件不存在");
  const content = fs.readFileSync(path.join(__dirname, "..", ".npmrc"), "utf-8");
  assert(content.includes("npmmirror.com"), ".npmrc 未配置阿里源");
});

test("package.json 存在", () => {
  assert(fileExists("package.json"), "package.json 文件不存在");
});

test("electron-builder.yml 存在", () => {
  assert(fileExists("electron-builder.yml"), "electron-builder.yml 文件不存在");
});

test("src/main.js 存在", () => {
  assert(fileExists("src/main.js"), "src/main.js 文件不存在");
});

test("src/preload.js 存在", () => {
  assert(fileExists("src/preload.js"), "src/preload.js 文件不存在");
});

test("src/index.html 存在", () => {
  assert(fileExists("src/index.html"), "src/index.html 文件不存在");
});

// ---- 2. package.json 配置 ----
console.log("\n=== 2. package.json 配置 ===");

let pkg;
test("package.json 可解析", () => {
  pkg = readJSON("package.json");
  assert(pkg.name, "name 字段缺失");
  assert(pkg.version, "version 字段缺失");
});

test("scripts 包含 start 命令", () => {
  assert(pkg.scripts && pkg.scripts.start, "scripts.start 缺失");
  assert(pkg.scripts.start === "electron .", "start 命令应为 'electron .'");
});

test("scripts 包含 build:win 命令", () => {
  assert(pkg.scripts && pkg.scripts["build:win"], "scripts.build:win 缺失");
  assert(pkg.scripts["build:win"].includes("electron-builder"), "build:win 未使用 electron-builder");
});

test("main 字段指向 src/main.js", () => {
  assert(pkg.main === "src/main.js", `main 字段应为 'src/main.js'，当前为 '${pkg.main}'`);
});

test("engines.node >= 24.0.0", () => {
  const nodeVersion = (pkg.engines && pkg.engines.node) || "";
  assert(parseFloat(nodeVersion.replace(/[>=^\s]/g, "")) >= 24, `Node.js 版本要求 >= 24.0.0，当前为 '${nodeVersion}'`);
});

// ---- 3. Node.js 版本 ----
console.log("\n=== 3. Node.js 版本 ===");

test("Node.js 版本 >= 24", () => {
  const major = parseInt(process.version.replace("v", "").split(".")[0]);
  assert(major >= 24, `当前 Node.js 版本为 ${process.version}，需要 >= 24`);
});

// ---- 4. 构建配置 ----
console.log("\n=== 4. electron-builder 构建配置 ===");

test("输出目录为 dist", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "electron-builder.yml"), "utf-8");
  assert(content.includes("output: dist"), "output 未配置为 dist");
});

test("Windows 目标架构为 x64", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "electron-builder.yml"), "utf-8");
  assert(content.includes("arch:") && content.includes("x64"), "未配置 x64 架构");
});

test("使用 NSIS 安装包格式", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "electron-builder.yml"), "utf-8");
  assert(content.includes("target: nsis"), "未使用 NSIS 安装包格式");
});

// ---- 5. 依赖检查 ----
console.log("\n=== 5. 依赖检查 ===");

test("node_modules 目录存在", () => {
  assert(fileExists("node_modules"), "node_modules 目录不存在，请先运行 npm install");
});

test("electron 已安装", () => {
  assert(fileExists("node_modules/electron"), "electron 未安装");
});

test("electron-builder 已安装", () => {
  assert(fileExists("node_modules/electron-builder"), "electron-builder 未安装");
});

test("electron 版本符合 package.json 要求", () => {
  const electronPkg = readJSON("node_modules/electron/package.json");
  assert(electronPkg.version, "无法读取 electron 版本");
});

// ---- 6. HTML 内容检查 ----
console.log("\n=== 6. HTML 内容检查 ===");

test("index.html 包含 Hello World", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf-8");
  assert(content.includes("Hello World"), "index.html 未包含 Hello World");
});

test("index.html 引用 preload 暴露的 versions", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf-8");
  assert(content.includes("window.versions"), "index.html 未使用 window.versions");
});

// ---- 汇总 ----
console.log(`\n${"=".repeat(40)}`);
console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
console.log(`${"=".repeat(40)}`);

if (failed > 0) {
  process.exit(1);
}