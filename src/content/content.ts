import { runCapture, cancelActiveCapture } from "./capture";
import type {
  CaptureMode,
  CaptureRequest,
  CaptureResponse,
  CaptureSettings,
} from "../shared/messages";
import { DEFAULT_SETTINGS } from "../shared/settings";

const MARKER = "__html2figma_content_ready__";

declare global {
  interface Window {
    [MARKER]?: boolean;
  }
}

function isCaptureRequest(message: unknown): message is CaptureRequest {
  return (
    !!message &&
    typeof message === "object" &&
    (message as CaptureRequest).type === "HTML2FIGMA_CAPTURE"
  );
}

if (!window[MARKER]) {
  window[MARKER] = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "HTML2FIGMA_CANCEL") {
      cancelActiveCapture();
      sendResponse({ ok: true });
      return false;
    }

    if (!isCaptureRequest(message)) {
      return false;
    }

    const mode = message.mode as CaptureMode;
    const settings: CaptureSettings = {
      ...DEFAULT_SETTINGS,
      ...message.settings,
    };

    // Element / multi can outlive the popup — ack immediately.
    if (mode === "element" || mode === "multi") {
      sendResponse({
        ok: true,
        message:
          mode === "element"
            ? "Click an element on the page. Watch the HUD for progress."
            : "Capturing selected viewports. Watch the HUD for progress.",
      } satisfies CaptureResponse);
      void runCapture(mode, settings);
      return false;
    }

    void runCapture("page", settings).then((response) => sendResponse(response));
    return true;
  });
}
