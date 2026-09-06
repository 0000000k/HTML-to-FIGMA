import type { ImageFile, ImageLoader, ImageRequest } from "@figit/dom-to-figma";
import type { FetchBytesResponse } from "../shared/messages";

const TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function emptyImage(): ImageFile {
  return {
    bytes: base64ToArrayBuffer(TRANSPARENT_PNG_BASE64),
    mimeType: "image/png",
  };
}

function resolveSrc(request: ImageRequest): string {
  const fromElement =
    request.element.currentSrc ||
    request.element.getAttribute("src") ||
    request.src ||
    "";
  const raw = fromElement || request.src;
  if (!raw) return "";
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  try {
    return new URL(raw, location.href).href;
  } catch {
    return raw;
  }
}

async function fetchDataOrBlob(src: string): Promise<ImageFile | null> {
  if (!src.startsWith("data:") && !src.startsWith("blob:")) return null;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return {
      bytes: await blob.arrayBuffer(),
      mimeType: blob.type || "image/png",
    };
  } catch {
    return null;
  }
}

async function fetchDirect(src: string): Promise<ImageFile | null> {
  try {
    const response = await fetch(src, { credentials: "include", mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const mimeType = blob.type || guessMime(src);
    return {
      bytes: await blob.arrayBuffer(),
      mimeType,
    };
  } catch {
    return null;
  }
}

async function fetchViaBackground(src: string): Promise<ImageFile | null> {
  if (src.startsWith("data:") || src.startsWith("blob:")) return null;
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "HTML2FIGMA_FETCH_BYTES",
      url: src,
    })) as FetchBytesResponse | undefined;

    if (!response?.ok || !response.base64) {
      if (response?.error) {
        console.warn("[HTML2FIGMA] proxy miss:", src, response.error);
      }
      return null;
    }
    return {
      bytes: base64ToArrayBuffer(response.base64),
      mimeType: response.mimeType || guessMime(src) || "image/png",
    };
  } catch (error) {
    console.warn("[HTML2FIGMA] proxy error:", src, error);
    return null;
  }
}

function guessMime(src: string): string {
  const path = src.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".avif")) return "image/avif";
  return "image/png";
}

async function fetchFromElement(
  element: HTMLImageElement,
): Promise<ImageFile | null> {
  try {
    if (!element.complete) {
      await new Promise<void>((resolve) => {
        element.addEventListener("load", () => resolve(), { once: true });
        element.addEventListener("error", () => resolve(), { once: true });
        window.setTimeout(() => resolve(), 1500);
      });
    }
    if (!element.naturalWidth || !element.naturalHeight) return null;

    // Same-origin or CORS-enabled images only; tainted canvas throws.
    const canvas = document.createElement("canvas");
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(element, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/png");
    });
    if (!blob) return null;
    return {
      bytes: await blob.arrayBuffer(),
      mimeType: "image/png",
    };
  } catch {
    return null;
  }
}

export type ImageLoaderHooks = {
  onStart?: (totalHint: number) => void;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

/**
 * Multi-strategy image loader:
 * 1) data/blob URLs
 * 2) extension background proxy (bypasses page CORS) — preferred for http(s)
 * 3) page fetch (same-origin / CORS)
 * 4) canvas draw from the live <img>
 * 5) transparent 1×1 PNG fallback (keeps capture alive)
 */
export function createExtensionImageLoader(
  hooks: ImageLoaderHooks = {},
): ImageLoader {
  let done = 0;
  let total = 0;

  return async (request: ImageRequest): Promise<ImageFile> => {
    if (hooks.signal?.aborted) {
      throw new DOMException("Capture cancelled", "AbortError");
    }

    total += 1;
    hooks.onStart?.(total);

    const src = resolveSrc(request);
    // Keep figit's element.src in sync (cache key uses element.src).
    if (src && request.element.src !== src) {
      try {
        request.element.src = src;
      } catch {
        // ignore
      }
    }

    let file: ImageFile | null = null;
    if (src) {
      file =
        (await fetchDataOrBlob(src)) ||
        (await fetchViaBackground(src)) ||
        (await fetchDirect(src)) ||
        (await fetchFromElement(request.element));
    } else {
      file = await fetchFromElement(request.element);
    }

    if (!file) {
      console.warn("[HTML2FIGMA] image miss:", src || "(empty src)");
      file = emptyImage();
    }

    done += 1;
    hooks.onProgress?.(done, total);
    return file;
  };
}
