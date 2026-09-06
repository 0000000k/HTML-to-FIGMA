import type {
  CaptureMode,
  FetchBytesRequest,
  FetchBytesResponse,
  ResizeWindowRequest,
  ResizeWindowResponse,
} from "../shared/messages";
import { DEFAULT_SETTINGS, loadSettings } from "../shared/settings";

const MAX_CONCURRENT_FETCHES = 8;
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

function enqueueFetch<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeFetches += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeFetches -= 1;
          const next = fetchQueue.shift();
          if (next) next();
        });
    };

    if (activeFetches < MAX_CONCURRENT_FETCHES) {
      run();
    } else {
      fetchQueue.push(run);
    }
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchBytes(url: string): Promise<FetchBytesResponse> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "force-cache",
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const headerType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) {
      return { ok: false, error: "Empty body" };
    }

    let mimeType = headerType.split(";")[0].trim();
    if (!mimeType || mimeType === "application/octet-stream") {
      const path = url.split("?")[0]?.toLowerCase() ?? "";
      if (path.endsWith(".png")) mimeType = "image/png";
      else if (path.endsWith(".jpg") || path.endsWith(".jpeg"))
        mimeType = "image/jpeg";
      else if (path.endsWith(".gif")) mimeType = "image/gif";
      else if (path.endsWith(".webp")) mimeType = "image/webp";
      else if (path.endsWith(".svg")) mimeType = "image/svg+xml";
      else if (path.endsWith(".avif")) mimeType = "image/avif";
      else mimeType = mimeType || "image/png";
    }

    return {
      ok: true,
      base64: arrayBufferToBase64(buffer),
      mimeType,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Fetch failed",
    };
  }
}

async function resizeWindow(
  width: number | null,
): Promise<ResizeWindowResponse> {
  try {
    const current = await chrome.windows.getCurrent();
    if (current.id == null) {
      return { ok: false, error: "No current window." };
    }
    const previousWidth = current.width;
    if (width == null) {
      return { ok: true, previousWidth };
    }
    await chrome.windows.update(current.id, { width });
    return { ok: true, previousWidth };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Resize failed",
    };
  }
}

async function injectAndCapture(tabId: number, mode: CaptureMode) {
  const settings = await loadSettings().catch(() => DEFAULT_SETTINGS);
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  await chrome.tabs.sendMessage(tabId, {
    type: "HTML2FIGMA_CAPTURE",
    mode,
    settings,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "HTML2FIGMA_FETCH_BYTES") {
    const req = message as FetchBytesRequest;
    void enqueueFetch(() => fetchBytes(req.url)).then((result) =>
      sendResponse(result),
    );
    return true;
  }

  if (message?.type === "HTML2FIGMA_RESIZE_WINDOW") {
    const req = message as ResizeWindowRequest;
    void resizeWindow(req.width).then((result) => sendResponse(result));
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;
  if (
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("about:")
  ) {
    return;
  }

  const mode: CaptureMode =
    command === "select-element"
      ? "element"
      : command === "capture-multi"
        ? "multi"
        : "page";

  try {
    await injectAndCapture(tab.id, mode);
  } catch (error) {
    console.error("HTML2FIGMA command failed", error);
  }
});
