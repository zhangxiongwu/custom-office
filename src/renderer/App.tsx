import { useEffect, useState, useRef } from "react";
import type { OnlyOfficeManager } from "@/components/onlyoffice-web-comp";

let OnlyOfficeManagerModule: typeof import("@/components/onlyoffice-web-comp") | null = null;

async function getOnlyOfficeManager() {
  if (!OnlyOfficeManagerModule) {
    OnlyOfficeManagerModule = await import("@/components/onlyoffice-web-comp");
  }
  return OnlyOfficeManagerModule;
}

function base64ToFile(base64: string, fileName: string, mimeType: string): File {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

function getFileTypeFromName(fileName: string): { fileType: number; mimeType: string } {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const MIME_TYPES: Record<string, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
  };
  const FILE_TYPES: Record<string, number> = {
    xlsx: 1,
    xls: 1,
    docx: 2,
    doc: 2,
    pptx: 3,
    ppt: 3,
  };
  return {
    fileType: FILE_TYPES[ext || ""] || 1,
    mimeType: MIME_TYPES[ext || ""] || "",
  };
}

function App() {
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("加载中...");
  const [fileName, setFileName] = useState("test.xlsx");
  const [fileOpened, setFileOpened] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    received: number;
    total: number;
  } | null>(null);
  const httpPortRef = useRef<number>(0);
  const hasOpened = useRef(false);
  const managerRef = useRef<OnlyOfficeManager | null>(null);
  const isDev = !window.location.href.startsWith("file://");

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "?";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const registerStaticResource = async () => {
    const mod = await getOnlyOfficeManager();
    mod.registerOnlyOfficeStaticResource({
      cdnOrigin: isDev
        ? window.location.origin + "/packages"
        : window.location.href.replace("/out/renderer/index.html", "")
        + "/src/components/onlyoffice-web-comp/public/packages",
    });
  };

  const openFileWithManager = async (
    file: File,
    displayName: string,
  ) => {
    setLoading(true);
    setFileName(displayName);
    setFileOpened(true);

    const mod = await getOnlyOfficeManager();
    const { fileType } = getFileTypeFromName(displayName);

    // 销毁旧的 manager
    if (managerRef.current) {
      managerRef.current.destroy();
      managerRef.current = null;
    }

    const manager = await mod.OnlyOfficeManager.createWithFile(
      {
        containerId: mod.ONLYOFFICE_ID,
        fileType,
        defaultFileName: displayName,
        readOnly: true,
        theme: mod.OFFICE_THEME.WHITE,
      },
      file,
    );

    managerRef.current = manager;
    manager.onLoadingChange((data) => {
      setLoading(data.loading);
      // 加载完成后关闭 HTTP 服务
      if (!data.loading && httpPortRef.current) {
        window.fileSystem?.stopHttpServer?.();
        httpPortRef.current = 0;
      }
    });

    // 兜底：如果 onLoadingChange 没有触发，延迟关闭 loading
    setTimeout(() => {
      setLoading(false);
    }, 500);

    console.log(`[App] ${displayName} opened in read-only mode`);
  };

  // 启动时自动以只读模式打开 test.xlsx
  useEffect(() => {
    if (hasOpened.current) return;
    hasOpened.current = true;

    const openTestFile = async () => {
      try {
        const filePath = "d:\\work\\sie\\front\\biz\\custom-office\\test.xlsx";
        const result = await window.fileSystem?.readLocalFile(filePath);
        if (!result?.success || !result.data) {
          console.warn("[App] test.xlsx not found, waiting for protocol open...");
          setLoading(false);
          return;
        }

        const file = base64ToFile(
          result.data,
          "test.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );

        await registerStaticResource();
        await openFileWithManager(file, "test.xlsx");
      } catch (err) {
        console.error("[App] Failed to open test.xlsx:", err);
        setLoading(false);
      }
    };
    openTestFile();
  }, []);

  // 处理协议 URL：解析 json 参数 -> 下载文件 -> 预览
  const handleProtocolUrl = async (data: {
    hostname: string;
    pathname: string;
    params: Record<string, string>;
    raw: string;
  }) => {
    console.log("[App] ===== handleProtocolUrl called =====");
    console.log("[App] raw data:", JSON.stringify(data));

    const action = data.hostname || data.pathname?.replace(/^\/+/, "");
    console.log("[App] action:", action);

    if (action !== "open") {
      console.log("[App] unknown action, ignored:", action);
      return;
    }

    const jsonStr = data.params.json;
    console.log("[App] raw json param:", jsonStr);

    if (!jsonStr) {
      console.warn("[App] protocol open action missing 'json' param");
      return;
    }

    try {
      const decoded = decodeURIComponent(jsonStr);
      console.log("[App] decoded json:", decoded);

      const payload = JSON.parse(decoded);
      console.log("[App] parsed payload:", JSON.stringify(payload));

      const fileUrl: string = payload.file;
      if (!fileUrl) {
        console.warn("[App] protocol payload missing 'file' field");
        return;
      }

      console.log("[App] file URL:", fileUrl);

      // 重置进度
      setDownloadProgress({ received: 0, total: 0 });
      setLoadingText("下载文件中...");
      setLoading(true);

      // 监听下载进度
      const removeProgress = window.fileSystem?.onDownloadProgress?.((progress) => {
        console.log(`[App] download progress: ${progress.received} / ${progress.total}`);
        setDownloadProgress(progress);
        const pct = progress.total > 0
          ? Math.round((progress.received / progress.total) * 100)
          : 0;
        setLoadingText(`下载文件中 ${pct}% (${formatSize(progress.received)})`);
      });

      // 监听下载完成
      window.fileSystem?.onDownloadComplete?.(async (result) => {
        console.log("[App] download-complete result:", result);
        console.log("[App] download-complete result.success:", result.success);
        console.log("[App] download-complete result.error:", result.error);
        console.log("[App] download-complete result.filePath:", result.filePath);
        console.log("[App] download-complete result.data length:", result.data?.length);

        // 清理监听
        if (removeProgress) removeProgress();

        setDownloadProgress(null);
        setLoadingText("加载中...");

        if (!result.success || !result.data) {
          console.error("[App] download failed:", result.error);
          setLoading(false);
          return;
        }

        const [hostnamePart] = new URL(fileUrl).pathname.split("/").filter(Boolean);
        const remoteFileName = result.filePath
          ? decodeURIComponent(result.filePath).split(/[/\\]/).pop() || "download.xlsx"
          : "download.xlsx";

        console.log("[App] remoteFileName:", remoteFileName);

        // 启动 HTTP 服务
        setLoadingText("启动 HTTP 服务...");
        const httpResult = await window.fileSystem?.startHttpServer?.(result.filePath);
        if (httpResult?.success) {
          httpPortRef.current = httpResult.port;
          console.log("[App] HTTP server started on port:", httpResult.port, "url:", httpResult.url);
        }

        // 用 http URL fetch → 转 File → OnlyOffice 预览
        const mimeType = getFileTypeFromName(remoteFileName).mimeType;
        const fetchUrl = httpResult?.success
          ? `${httpResult.url}?t=${Date.now()}`
          : null;

        if (fetchUrl) {
          console.log("[App] fetching file from HTTP:", fetchUrl);
          // TODO 在这里做判断解密逻辑
          const resp = await fetch(fetchUrl);
          const blob = await resp.blob();
          const file = new File([blob], remoteFileName, { type: mimeType });

          await registerStaticResource();
          setLoadingText("打开文件预览...");
          await openFileWithManager(file, remoteFileName);
          await window.fileSystem?.stopHttpServer?.();
        } else {
          setLoading(false);
        }
      });

      // 开始下载
      const urlObj = new URL(fileUrl);
      const remoteFileName =
        decodeURIComponent(urlObj.pathname).split("/").pop() || "download.xlsx";
      console.log("[App] starting download, url:", fileUrl, "fileName:", remoteFileName);
      window.fileSystem?.startDownload?.(fileUrl, remoteFileName);
    } catch (err) {
      console.error("[App] handleProtocolUrl error:", err);
      setLoading(false);
    }
  };

  // 监听协议 URL
  useEffect(() => {
    console.log("[App] setting up protocol listener...");
    console.log("[App] window.customProtocol:", !!window.customProtocol);
    console.log("[App] window.fileSystem:", !!window.fileSystem);

    window.customProtocol?.onProtocolUrl((data) => {
      console.log("[App] onProtocolUrl callback fired with data:", data);
      handleProtocolUrl(data);
    });

    // 获取启动时的协议 URL（冷启动时通过命令行传入）
    window.customProtocol?.getStartupProtocolUrl().then((data) => {
      console.log("[App] getStartupProtocolUrl returned:", data);
      if (data && !data.error) {
        console.log("[App] handling startup protocol URL");
        handleProtocolUrl(data);
      } else {
        console.log("[App] no startup protocol URL");
      }
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="onlyoffice-container editor-container">
        <div id="iframe-office-id" className="editor-iframe" />
        {loading && (
          <div className="loading-overlay">
            {downloadProgress ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: 12 }}>{loadingText}</div>
                <div style={{
                  width: 300,
                  height: 8,
                  background: "#e0e0e0",
                  borderRadius: 4,
                  overflow: "hidden",
                  margin: "0 auto",
                }}>
                  <div style={{
                    width: downloadProgress.total > 0
                      ? `${Math.round((downloadProgress.received / downloadProgress.total) * 100)}%`
                      : "10%",
                    height: "100%",
                    background: "#1890ff",
                    borderRadius: 4,
                    transition: "width 0.2s",
                  }} />
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: "#999" }}>
                  {formatSize(downloadProgress.received)}
                  {downloadProgress.total > 0 ? ` / ${formatSize(downloadProgress.total)}` : ""}
                </div>
              </div>
            ) : (
              <span>{loadingText}</span>
            )}
          </div>
        )}
        {!loading && !fileOpened && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#999",
            fontSize: 16,
          }}>
            等待通过浏览器点击预览文件按钮，触发客户端打开文件...
          </div>
        )}
      </div>
    </div>
  );
}

export default App;