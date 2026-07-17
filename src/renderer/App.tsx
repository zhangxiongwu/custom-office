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
  const [appVersion, setAppVersion] = useState("");
  const [downloadProgress, setDownloadProgress] = useState<{
    received: number;
    total: number;
  } | null>(null);
  const hasOpened = useRef(false);
  const managerRef = useRef<OnlyOfficeManager | null>(null);
  const isDev = !window.location.href.startsWith("file://");

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return " ";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const registerStaticResource = async () => {
    const mod = await getOnlyOfficeManager();
    mod.registerOnlyOfficeStaticResource({
      cdnOrigin: isDev
        ? window.location.origin + "/packages"
        : window.location.href.replace(/index\.html$/, "packages"),
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
    });

    // 兜底：如果 onLoadingChange 没有触发，延迟关闭 loading
    setTimeout(() => {
      setLoading(false);
    }, 500);

    console.log(`[App] ${displayName} opened in read-only mode`);
  };

  useEffect(() => {
    fetch("./build-info.json")
      .then((response) => response.json())
      .then((info: { version?: string }) => setAppVersion(info.version || ""))
      .catch(() => setAppVersion(""));
  }, []);

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
      const fileTypeFromPayload: string = payload.fileType || payload.file_type; // 支持 fileType 或者 file_type
      const fileNameFromPayload: string = payload.fileName || payload.file_name; // 协议中指定的显示文件名
      const decryptionServiceUrl: string | undefined = payload.decode; // 获取 decode 字段
      console.log("[App] decryptionServiceUrl:", decryptionServiceUrl);
      
      if (!fileUrl) {
        console.warn("[App] protocol payload missing 'file' field");
        return;
      }

      console.log("[App] file URL:", fileUrl);
      console.log("[App] fileType from payload:", fileTypeFromPayload);

      // 重置进度
      setDownloadProgress({ received: 0, total: 0 });
      setLoadingText("下载文件中...");
      setLoading(true);

      // 监听下载进度
      const removeProgress = window.fileSystem?.onDownloadProgress?.((progress) => {
        console.log(`[App] download progress: ${progress.received} / ${progress.total}`);
        setDownloadProgress(progress);
        setLoadingText(`下载文件中 (${fileNameFromPayload})`);
      });

      // 监听下载完成
      let removeComplete: (() => void) | undefined;
      removeComplete = window.fileSystem?.onDownloadComplete?.(async (result) => {
        console.log("[App] ===== download-complete =====");
        console.log("[App] result.success:", result.success);
        console.log("[App] result.error:", result.error);
        console.log("[App] result.fileName:", result.fileName);
        console.log("[App] result.size:", result.size);
        console.log("[App] result.data(length):", result.data?.length);

        // 清理当前下载的监听，防止下次下载再次触发旧回调
        if (removeProgress) removeProgress();
        if (removeComplete) removeComplete();

        setDownloadProgress(null);
        setLoadingText("加载中...");

        if (!result.success || !result.data) {
          console.error("[App] download failed:", result.error);
          setLoading(false);
          return;
        }

        // 优先用协议传的 fileName，其次用 fileType，再用主进程从响应头获取，最后 fallback
        let remoteFileName: string;
        if (fileNameFromPayload) {
          // 协议明确指定了显示文件名，直接使用
          remoteFileName = fileNameFromPayload;
        } else if (fileTypeFromPayload) {
          if (/\.(xlsx?|docx?|pptx?)$/i.test(fileTypeFromPayload)) {
            remoteFileName = fileTypeFromPayload;
          } else {
            remoteFileName = "download." + fileTypeFromPayload.toLowerCase();
          }
        } else {
          remoteFileName = result.fileName || "download.xlsx";
        }

        if (!/\.(xlsx?|docx?|pptx?)$/i.test(remoteFileName)) {
          remoteFileName = remoteFileName + ".xlsx";
        }

        console.log("[App] remoteFileName:", remoteFileName);

        const mimeType = getFileTypeFromName(remoteFileName).mimeType;
        console.log("[App] mimeType:", mimeType);

        let fileBase64 = result.data;

        if (decryptionServiceUrl) {
          console.log("[App] decryptionServiceUrl provided:", decryptionServiceUrl);
          console.log("[App] checking file encryption status...");

          try {
            console.log("[App] ===== checkFileIsEncrypted REQUEST =====");
             console.log("[App]   url:", decryptionServiceUrl);
             console.log("[App]   methodName: checkFileIsEncryptionRest");
             console.log("[App]   headers: { 'method~name': 'checkFileIsEncryptionRest', 'Content-Type': 'application/octet-stream' }");
             console.log("[App]   fileData(base64) length:", result.data.length);
             console.log("[App]   fileSize:", result.size);
             const checkResult = await window.fileSystem?.checkFileIsEncrypted?.(result.data, decryptionServiceUrl);
             console.log("[App] ===== checkFileIsEncrypted RESPONSE =====");
             console.log("[App]   returnFlag:", checkResult?.isEncrypted ? "1(encrypted)" : "0(not encrypted)");
             console.log("[App]   full result:", JSON.stringify(checkResult));

            if (checkResult?.success && checkResult.isEncrypted) {
              console.log("[App] file IS encrypted, starting decryption...");
               setLoadingText("解密文件中...");

               console.log("[App] ===== decryptFile REQUEST =====");
               console.log("[App]   url:", decryptionServiceUrl);
               console.log("[App]   methodName: fileDecryptionRest");
               console.log("[App]   headers: { 'method~name': 'fileDecryptionRest', 'data~fileOffset': '0', 'data~counSize': '" + result.size + "' }");
               console.log("[App]   fileData(base64) length:", result.data.length);
               console.log("[App]   fileSize(counSize):", result.size);
               const decryptResult = await window.fileSystem?.decryptFile?.(result.data, result.size, decryptionServiceUrl);
               console.log("[App] ===== decryptFile RESPONSE =====");
               console.log("[App]   success:", decryptResult?.success);
               console.log("[App]   error:", decryptResult?.error);
               console.log("[App]   decrypted data(base64) length:", decryptResult?.data?.length);

              if (decryptResult?.success) {
                console.log("[App] file decrypted successfully, replacing fileBase64");
                fileBase64 = decryptResult.data;
              } else {
                console.error("[App] decrypt FAILED, will use original encrypted data");
              }
            } else if (checkResult?.success && !checkResult.isEncrypted) {
              console.log("[App] file is NOT encrypted, using original flow");
            } else {
              console.log("[App] checkFileIsEncrypted failed, checkResult:", JSON.stringify(checkResult));
            }
          } catch (err) {
            console.error("[App] encryption check/decryption error:", err);
          }
        } else {
          console.log("[App] no decryptionServiceUrl, skipping encryption check");
        }

        console.log("[App] creating File from base64, final data length:", fileBase64.length);
        const file = base64ToFile(fileBase64, remoteFileName, mimeType);
        console.log("[App] File created, name:", remoteFileName, "size:", file.size);

        await registerStaticResource();
        console.log("[App] static resource registered");

        setLoadingText("打开文件预览...");
        console.log("[App] opening file in OnlyOffice manager...");
        await openFileWithManager(file, remoteFileName);
        console.log("[App] ===== download-complete END =====");
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

    let startupHandled = false;

    window.customProtocol?.onProtocolUrl((data) => {
      console.log("[App] onProtocolUrl callback fired with data:", data);
      startupHandled = true;
      handleProtocolUrl(data);
    });

    // 获取启动时的协议 URL（冷启动时通过命令行传入）
    window.customProtocol?.getStartupProtocolUrl().then((data) => {
      console.log("[App] getStartupProtocolUrl returned:", data);
      if (data && !data.error && !startupHandled) {
        startupHandled = true;
        console.log("[App] handling startup protocol URL");
        handleProtocolUrl(data);
      } else {
        console.log("[App] no startup protocol URL or already handled");
      }
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="onlyoffice-container editor-container">
        <div id="iframe-office-id" className="editor-iframe" />
         {appVersion && (
          <div
            style={{
              position: "absolute",
              right: 5,
              bottom: 0,
              zIndex: 10,
              color: "#999",
              fontSize: 8,
              pointerEvents: "none",
            }}
          >
            版本 {appVersion}
          </div>
        )}
        {loading && (
          <div className="loading-overlay">
            {downloadProgress ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: 12 }}>{loadingText}</div>
                <div style={{ fontSize: 13, color: "#999" }}>
                  {formatSize(downloadProgress.received)}
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
            <div>请在浏览器点击预览文件按钮，触发客户端打开文件...</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;