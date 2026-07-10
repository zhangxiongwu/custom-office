# custom-office

Electron 渲染进程控制台（DevTools Console）快捷键
Windows / Linux
Ctrl + Shift + I（标准，切换开发者工具）
F12（等效，很多场景可用）
macOS
Cmd + Option + I（标准）
F12（部分环境支持）


在当前工程 src/components (若没有对应路径则自己建对应目录) 目录下执行以下命令获取 onlyoffice-web-comp 组件：

git clone https://github.com/electroluxcode/onlyoffice-web-comp.git
cd src/components/onlyoffice-web-comp
npm i pnpm -g
pnpm i

src/components/onlyoffice-web-comp 目录下需要手动修改
    src/components/onlyoffice-web-comp/const/index.ts   
        if (/^https?:\/\//i.test(path)) {
        改为：
        if (/^(https?|file|custom-office-pkg):\/\//i.test(path)) {
    types/global.d.ts
        interface Window {
        里面追加
        fileSystem?: {
            readLocalFile: (filePath: string) => Promise<{
            success: boolean;
            data?: string;
            error?: string;
            }>;
        };

npm i

npm start

构建运行
build.bat


{"fileType": "xlsx", "file": "http://192.168.1.9:8000/测试.xlsx"}

测试唤醒协议：
customOffice://open?json=%7B%22file%22%3A%20%22http%3A%2F%2F192.168.1.9%3A8000%2F%E6%B5%8B%E8%AF%95.xlsx%22%7D

流程：
唤醒协议
下载http文件到tmp
tmp建http服务
打开http服务
通过http文件链接预览文件
关闭http服务
