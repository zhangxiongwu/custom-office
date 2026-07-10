import { useEffect, useState, useRef } from "react";
import type { OnlyOfficeManager } from "@/components/onlyoffice-web-comp";

function App() {
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState("test.xlsx");
  const hasOpened = useRef(false);

  // 启动时自动以只读模式打开 test.xlsx
  useEffect(() => {
    if (hasOpened.current) return;
    hasOpened.current = true;

    const openTestFile = async () => {
      try {
        const filePath = "d:\\work\\sie\\front\\biz\\custom-office\\test.xlsx";
        const result = await window.fileSystem?.readLocalFile(filePath);
        if (!result?.success || !result.data) {
          console.error("[App] Failed to read test.xlsx:", result?.error);
          setLoading(false);
          return;
        }

        const binaryStr = atob(result.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const file = new File([bytes], "test.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const {
          OnlyOfficeManager,
          ONLYOFFICE_ID,
          ONLYOFFICE_CONTAINER_CONFIG,
          FILE_TYPE,
          OFFICE_THEME,
          registerOnlyOfficeStaticResource,
        } = await import("@/components/onlyoffice-web-comp");

        const isDev = !window.location.href.startsWith("file://");
        registerOnlyOfficeStaticResource({
          cdnOrigin: isDev
            ? window.location.origin + "/packages"
            : window.location.href
                .replace("/out/renderer/index.html", "")
              + "/src/components/onlyoffice-web-comp/public/packages",
        });

        const manager = await OnlyOfficeManager.createWithFile(
          {
            containerId: ONLYOFFICE_ID,
            fileType: FILE_TYPE.XLSX,
            defaultFileName: "test.xlsx",
            readOnly: true,
            theme: OFFICE_THEME.WHITE,
          },
          file,
        );

        manager.onLoadingChange((data) => {
          setLoading(data.loading);
        });

        setLoading(false);
        setFileName("test.xlsx");
        console.log("[App] test.xlsx opened in read-only mode");
      } catch (err) {
        console.error("[App] Failed to open test.xlsx:", err);
        setLoading(false);
      }
    };
    openTestFile();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="onlyoffice-container editor-container">
        <div id="iframe-office-id" className="editor-iframe" />
        {loading && (
          <div className="loading-overlay">
            <span>加载中...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;