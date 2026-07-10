import { useEffect, useState, useRef, useCallback } from "react";
import {
  OnlyOfficeManager,
  ONLYOFFICE_ID,
  ONLYOFFICE_CONTAINER_CONFIG,
  FILE_TYPE,
  OFFICE_THEME,
  registerOnlyOfficeStaticResource,
} from "@/components/onlyoffice-web-comp";

function App() {
  const [manager, setManager] = useState<OnlyOfficeManager | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("未打开文档");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 注册 SDK 资源路径（必须在创建编辑器之前调用）
  useEffect(() => {
    const isDev = !window.location.href.startsWith("file://");
    if (isDev) {
      // 开发模式：publicDir 指向 public/，packages 在 /packages/
      registerOnlyOfficeStaticResource({ cdnOrigin: window.location.origin + "/packages" });
      console.log("[OnlyOffice] Dev mode, packages:", window.location.origin + "/packages");
    } else {
      // 生产模式：使用 file:// 绝对路径，x2t worker 中的 resolveSiteUrl 已支持 file:// 协议
      const packagesDir = window.location.href
        .replace("/out/renderer/index.html", "")
        + "/src/components/onlyoffice-web-comp/public/packages";
      registerOnlyOfficeStaticResource({ cdnOrigin: packagesDir });
      console.log("[OnlyOffice] Prod mode, packages:", packagesDir);
    }
  }, []);

  const createEditor = useCallback(
    async (fileType: string, defaultFileName: string, file?: File) => {
      setLoading(true);
      try {
        if (manager) {
          manager.destroy();
        }

        const options = {
          containerId: ONLYOFFICE_ID,
          fileType: fileType as typeof FILE_TYPE[keyof typeof FILE_TYPE],
          defaultFileName,
          readOnly: isReadOnly,
          theme: isDark ? OFFICE_THEME.DARK : OFFICE_THEME.WHITE,
        };

        let newManager: OnlyOfficeManager;
        if (file) {
          newManager = await OnlyOfficeManager.createWithFile(options, file);
        } else {
          newManager = await OnlyOfficeManager.create(options);
        }

        newManager.onLoadingChange((data) => {
          setLoading(data.loading);
        });

        setManager(newManager);
        setFileName(file ? file.name : defaultFileName);
        console.log("[OnlyOffice] Editor created:", defaultFileName);
      } catch (err) {
        console.error("[OnlyOffice] Failed to create editor:", err);
      } finally {
        setLoading(false);
      }
    },
    [manager, isReadOnly, isDark]
  );

  // 启动时自动打开 test.xlsx
  useEffect(() => {
    const openTestFile = async () => {
      try {
        const filePath = "d:\\work\\sie\\front\\biz\\custom-office\\test.xlsx";
        const result = await window.fileSystem?.readLocalFile(filePath);
        if (result?.success && result.data) {
          const binaryStr = atob(result.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const file = new File([bytes], "test.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          await createEditor(FILE_TYPE.XLSX, "test.xlsx", file);
        }
      } catch (err) {
        console.error("[App] Failed to open test.xlsx:", err);
      }
    };
    openTestFile();
    // cleanup on unmount
    return () => {
      manager?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewDocx = () => createEditor(FILE_TYPE.DOCX, "New_Document.docx");
  const handleNewXlsx = () => createEditor(FILE_TYPE.XLSX, "New_Spreadsheet.xlsx");
  const handleNewPptx = () => createEditor(FILE_TYPE.PPTX, "New_Presentation.pptx");

  const handleOpenFile = () => {
    if (!manager) {
      alert("请先新建一个文档，再打开文件。");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !manager) return;

    setLoading(true);
    try {
      await manager.openFile(file, isReadOnly);
      setFileName(file.name);
    } catch (err) {
      console.error("[OnlyOffice] Failed to open file:", err);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleDownload = async () => {
    if (!manager) {
      alert("请先新建或打开一个文档。");
      return;
    }
    setLoading(true);
    try {
      await manager.downloadExport();
    } catch (err) {
      console.error("[OnlyOffice] Download failed:", err);
      alert("导出失败: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReadOnly = async () => {
    if (!manager) return;
    await manager.toggleReadOnly();
    setIsReadOnly(manager.getReadOnly());
  };

  const handleToggleTheme = async () => {
    if (!manager) return;
    const nextDark = !isDark;
    await manager.setTheme(nextDark ? OFFICE_THEME.DARK : OFFICE_THEME.WHITE);
    setIsDark(nextDark);
  };

  const handleToggleLang = async () => {
    if (!manager) return;
    await manager.toggleLanguage();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Toolbar */}
      <div className="toolbar">
        <h2>Custom Office</h2>

        <button className="primary" onClick={handleNewDocx}>
          新建 Word
        </button>
        <button onClick={handleNewXlsx}>新建 Excel</button>
        <button onClick={handleNewPptx}>新建 PPT</button>

        <span className="divider" />

        <div className="file-input-wrapper">
          <button onClick={handleOpenFile}>打开文件</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.xlsx,.pptx,.doc,.xls,.ppt,.odt,.ods,.odp,.pdf,.csv,.txt,.rtf"
            onChange={handleFileChange}
          />
        </div>

        <button onClick={handleDownload}>下载导出</button>

        <span className="divider" />

        <button onClick={handleToggleReadOnly}>
          {isReadOnly ? "切换编辑" : "切换只读"}
        </button>
        <button onClick={handleToggleTheme}>
          {isDark ? "浅色主题" : "深色主题"}
        </button>
        <button onClick={handleToggleLang}>中/英</button>

        <span className="divider" />

        <span className="status-item">
          <span className={`status-dot ${loading ? "loading" : ""}`} />
          <span>{loading ? "加载中..." : fileName}</span>
        </span>
      </div>

      {/* Editor Container */}
      <div
        className={`${ONLYOFFICE_CONTAINER_CONFIG.PARENT_CLASS_NAME} editor-container`}
      >
        <div id={ONLYOFFICE_ID} className="editor-iframe" />
        {loading && (
          <div className="loading-overlay">
            <span>加载中...</span>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span>{fileName}</span>
        <span>{isReadOnly ? "只读" : "编辑"}</span>
        <span>{isDark ? "深色" : "浅色"}</span>
      </div>
    </div>
  );
}

export default App;