import { useEffect, useState, useRef } from "react";
import type { OnlyOfficeManager } from "@/components/onlyoffice-web-comp";

let OnlyOfficeManagerModule: typeof import("@/components/onlyoffice-web-comp") | null = null;

async function getOnlyOfficeManager() {
  if (!OnlyOfficeManagerModule) {
    OnlyOfficeManagerModule = await import("@/components/onlyoffice-web-comp");
  }
  return OnlyOfficeManagerModule;
}

function arrayBufferToFile(data: ArrayBuffer, fileName: string, mimeType: string): File {
  return new File([data], fileName, { type: mimeType });
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function fetchFile(url: string, onProgress: (received: number, total: number) => void) {
  console.log("[App] ===== 文件下载请求 =====");
  console.log("[App] 请求地址:", url);
  console.log("[App] 请求参数:", { credentials: "include" });

  const response = await fetch(url, { credentials: "include" });
  console.log("[App] ===== 文件下载响应 =====");
  console.log("[App] 状态:", response.status, response.statusText);
  console.log("[App] 响应地址:", response.url);
  console.log("[App] 响应头:", Object.fromEntries(response.headers.entries()));
  if (!response.ok) {
    throw new Error(`下载文件失败，HTTP ${response.status}`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    const data = await response.arrayBuffer();
    onProgress(data.byteLength, total);
    return { data, response };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }

  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { data: data.buffer, response };
}

async function requestDecryptionService(
  methodName: string,
  fileData: ArrayBuffer,
  decryptionServiceUrl: string,
  extraHeaders: Record<string, string> = {},
) {
  const requestHeaders = {
    "method~name": methodName,
    "Content-Type": "application/octet-stream",
    ...extraHeaders,
  };
  console.log("[App] ===== 解密服务请求 =====");
  console.log("[App] 请求地址:", decryptionServiceUrl);
  console.log("[App] 请求方法: POST");
  console.log("[App] 请求头:", requestHeaders);
  console.log("[App] 请求体大小:", fileData.byteLength);

  const response = await fetch(decryptionServiceUrl, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders,
    body: fileData,
  });
  const responseData = await response.arrayBuffer();
  const returnFlag = response.headers.get("data~returnflag");
  console.log("[App] ===== 解密服务响应 =====");
  console.log("[App] 状态:", response.status, response.statusText);
  console.log("[App] 响应地址:", response.url);
  console.log("[App] 响应头:", Object.fromEntries(response.headers.entries()));
  console.log("[App] 返回标识:", returnFlag);
  console.log("[App] 响应体大小:", responseData.byteLength);
  return { success: response.ok && returnFlag === "0", returnFlag, data: responseData };
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

        const file = arrayBufferToFile(
          base64ToArrayBuffer(result.data),
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

      setDownloadProgress({ received: 0, total: 0 });
      setLoadingText("下载文件中...");
      setLoading(true);

      const { data: downloadedData } = await fetchFile(fileUrl, (received, total) => {
        setDownloadProgress({ received, total });
        setLoadingText(`下载文件中 (${fileNameFromPayload || decodeURIComponent(new URL(fileUrl).pathname).split("/").pop() || "download.xlsx"})`);
      });
      setDownloadProgress(null);

      let remoteFileName = fileNameFromPayload;
      if (!remoteFileName && fileTypeFromPayload) {
        remoteFileName = /\.(xlsx?|docx?|pptx?)$/i.test(fileTypeFromPayload)
          ? fileTypeFromPayload
          : `download.${fileTypeFromPayload.toLowerCase()}`;
      }
      if (!remoteFileName) {
        remoteFileName = decodeURIComponent(new URL(fileUrl).pathname).split("/").pop() || "download.xlsx";
      }
      if (!/\.(xlsx?|docx?|pptx?)$/i.test(remoteFileName)) {
        remoteFileName += ".xlsx";
      }

      let fileData = downloadedData;
      if (decryptionServiceUrl) {
        try {
          const checkResult = await requestDecryptionService(
            "checkFileIsEncryptionRest",
            fileData,
            decryptionServiceUrl,
          );
          if (checkResult.returnFlag === "1") {
            setLoadingText("解密文件中...");
            const decryptResult = await requestDecryptionService(
              "fileDecryptionRest",
              fileData,
              decryptionServiceUrl,
              { "data~fileOffset": "0", "data~counSize": String(fileData.byteLength) },
            );
            if (decryptResult.success) {
              fileData = decryptResult.data;
            } else {
              console.error("[App] 文件解密失败，使用原文件预览，返回标识：", decryptResult.returnFlag);
            }
          } else if (!checkResult.success) {
            console.error("[App] 文件加密状态检查失败，使用原文件预览，返回标识：", checkResult.returnFlag);
          }
        } catch (error) {
          console.error("[App] 解密服务请求异常，认为文件无需解密并使用原文件预览：", error);
        }
      }

      const mimeType = getFileTypeFromName(remoteFileName).mimeType;
      const file = arrayBufferToFile(fileData, remoteFileName, mimeType);
      await registerStaticResource();
      setLoadingText("打开文件预览...");
      await openFileWithManager(file, remoteFileName);
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
            请在浏览器点击预览文件按钮，触发客户端打开文件...
          </div>
        )}
      </div>
    </div>
  );
}

export default App;