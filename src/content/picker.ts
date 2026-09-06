const OVERLAY_ID = "html2figma-select-overlay";

export function removePickerOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(`${OVERLAY_ID}-highlight`)?.remove();
  document.getElementById(`${OVERLAY_ID}-hint`)?.remove();
}

export function pickElement(signal?: AbortSignal): Promise<HTMLElement> {
  removePickerOverlay();

  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      cursor: "crosshair",
      background: "transparent",
    });

    const highlight = document.createElement("div");
    highlight.id = `${OVERLAY_ID}-highlight`;
    Object.assign(highlight.style, {
      position: "fixed",
      pointerEvents: "none",
      border: "2px solid #0f766e",
      background: "rgba(15, 118, 110, 0.12)",
      zIndex: "2147483647",
      display: "none",
    });

    const hint = document.createElement("div");
    hint.id = `${OVERLAY_ID}-hint`;
    hint.textContent = "Click an element · Esc to cancel";
    Object.assign(hint.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      background: "#1c1917",
      color: "#fafaf9",
      padding: "8px 12px",
      borderRadius: "999px",
      font: "600 12px/1.2 system-ui, sans-serif",
      pointerEvents: "none",
      boxShadow: "0 8px 24px rgba(0,0,0,.25)",
    });

    let current: HTMLElement | null = null;

    const cleanup = () => {
      overlay.remove();
      highlight.remove();
      hint.remove();
      window.removeEventListener("keydown", onKeyDown, true);
      signal?.removeEventListener("abort", onAbort);
    };

    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onAbort = () => {
      fail(new DOMException("Capture cancelled", "AbortError"));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        fail(new Error("Selection cancelled."));
      }
    };

    overlay.addEventListener("mousemove", (event) => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      if (!(el instanceof HTMLElement) || el === overlay || el === highlight) {
        return;
      }
      if (el.closest(`#${OVERLAY_ID}, #html2figma-hud-host`)) return;
      current = el;
      const rect = el.getBoundingClientRect();
      highlight.style.display = "block";
      highlight.style.left = `${rect.left}px`;
      highlight.style.top = `${rect.top}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
    });

    overlay.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = current;
      cleanup();
      if (!target) {
        reject(new Error("No element selected."));
        return;
      }
      resolve(target);
    });

    signal?.addEventListener("abort", onAbort, { once: true });
    window.addEventListener("keydown", onKeyDown, true);
    document.documentElement.append(overlay, highlight, hint);
  });
}
