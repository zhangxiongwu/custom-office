const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const CHUNK_SIZE = 1024 * 1024; // 1MB，与 src/main/index.js 一致
const DECRYPTION_SERVICE_URL = "TODO 需要加解密链接url";

const INPUT_FILE = path.join(__dirname, "e.xlsx");
const OUTPUT_FILE = path.join(__dirname, "d.xlsx");

function createChunkedInputStream(data, chunkSize) {
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    const end = Math.min(data.length, i + chunkSize);
    chunks.push(data.slice(i, end));
  }
  return chunks;
}

/**
 * 与 src/main/index.js 中 sendRequestToDecryptionService 相同的请求协议
 * （独立 Node 脚本用不了 Electron net，改用 http/https）
 */
function sendRequestToDecryptionService(methodName, fileData, extraHeaders = {}, decryptionServiceUrl) {
  const headers = {
    "method~name": methodName,
    "Content-Type": "application/octet-stream",
    "Transfer-Encoding": "chunked",
    ...extraHeaders,
  };

  console.log("[Decryption] ===== REQUEST =====");
  console.log("[Decryption] URL:", decryptionServiceUrl);
  console.log("[Decryption] methodName:", methodName);
  console.log("[Decryption] headers:", JSON.stringify(headers));
  console.log("[Decryption] fileData length:", fileData.length);

  return new Promise((resolve, reject) => {
    const url = new URL(decryptionServiceUrl);
    const transport = url.protocol === "https:" ? https : http;
    const chunks = createChunkedInputStream(fileData, CHUNK_SIZE);

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers,
      },
      (res) => {
        console.log("[Decryption] ===== RESPONSE =====");
        console.log("[Decryption] statusCode:", res.statusCode);
        console.log("[Decryption] headers:", JSON.stringify(res.headers));

        const headerValue = (name) => {
          const value = res.headers[name] ?? res.headers[name.toLowerCase()];
          return Array.isArray(value) ? value[0] : value;
        };

        const responseChunks = [];
        res.on("data", (chunk) => {
          responseChunks.push(chunk);
        });
        res.on("end", () => {
          const returnFlag = headerValue("data~returnflag");
          const result = {
            success: returnFlag === "0",
            returnFlag,
            data: Buffer.concat(responseChunks),
          };
          console.log("[Decryption] returnFlag:", result.returnFlag);
          console.log("[Decryption] response data length:", result.data.length);
          console.log("[Decryption] ===== END =====");
          resolve(result);
        });
      }
    );

    req.on("error", (err) => {
      console.error("[Decryption] request error:", err);
      reject(err);
    });

    let currentChunkIndex = 0;
    function sendNextChunk() {
      if (currentChunkIndex < chunks.length) {
        const chunk = chunks[currentChunkIndex];
        req.write(chunk);
        currentChunkIndex++;
        setImmediate(sendNextChunk);
      } else {
        req.end();
      }
    }

    sendNextChunk();
  });
}

async function checkFileIsEncrypted(fileData, decryptionServiceUrl) {
  const result = await sendRequestToDecryptionService(
    "checkFileIsEncryptionRest",
    fileData,
    {},
    decryptionServiceUrl
  );
  // 与 index.js 一致：returnFlag === '1' 表示已加密
  return result.returnFlag === "1";
}

async function decryptFile(fileData, fileSize, decryptionServiceUrl) {
  const result = await sendRequestToDecryptionService(
    "fileDecryptionRest",
    fileData,
    {
      "data~fileOffset": "0",
      "data~counSize": fileSize.toString(),
    },
    decryptionServiceUrl
  );
  if (!result.success) {
    throw new Error(`File decryption failed, return flag: ${result.returnFlag}`);
  }
  return result.data;
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`输入文件不存在: ${INPUT_FILE}`);
  }

  const fileData = fs.readFileSync(INPUT_FILE);
  console.log("[testDecode] 读取输入文件:", INPUT_FILE, "size:", fileData.length);

  console.log("[testDecode] 检查文件是否加密...");
  const isEncrypted = await checkFileIsEncrypted(fileData, DECRYPTION_SERVICE_URL);
  console.log("[testDecode] isEncrypted:", isEncrypted);

  let outputData = fileData;
  if (isEncrypted) {
    console.log("[testDecode] 文件已加密，开始解密...");
    outputData = await decryptFile(fileData, fileData.length, DECRYPTION_SERVICE_URL);
    console.log("[testDecode] 解密完成, size:", outputData.length);
  } else {
    console.log("[testDecode] 文件未加密，直接写出原文件");
  }

  fs.writeFileSync(OUTPUT_FILE, outputData);
  console.log("[testDecode] 已写出:", OUTPUT_FILE, "size:", outputData.length);
}

main().catch((err) => {
  console.error("[testDecode] 失败:", err);
  process.exit(1);
});
