import type {
  CaptureMode,
  CaptureRequest,
  CaptureResponse,
  CaptureSettings,
  ViewportPresetId,
} from "../shared/messages";
import { GITHUB_REPO_URL } from "../shared/brand";
import {
  DEFAULT_SETTINGS,
  VIEWPORT_PRESETS,
  loadSettings,
  saveSettings,
} from "../shared/settings";

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const capturePageBtn = document.getElementById(
  "capture-page",
) as HTMLButtonElement;
const captureMultiBtn = document.getElementById(
  "capture-multi",
) as HTMLButtonElement;
const selectElementBtn = document.getElementById(
  "select-element",
) as HTMLButtonElement;
const chipsEl = document.getElementById("viewport-chips") as HTMLDivElement;
const customWidthWrap = document.querySelector(
  ".custom-width",
) as HTMLLabelElement;
const customWidthInput = document.getElementById(
  "custom-width",
) as HTMLInputElement;
const layoutAutoBtn = document.getElementById("layout-auto") as HTMLButtonElement;
const layoutAbsoluteBtn = document.getElementById(
  "layout-absolute",
) as HTMLButtonElement;
const githubLink = document.getElementById("github-link") as HTMLAnchorElement | null;
const footerRepo = document.querySelector(
  ".footer-repo",
) as HTMLAnchorElement | null;

function wireRepoLinks() {
  for (const el of [githubLink, footerRepo]) {
    if (!el) continue;
    el.href = GITHUB_REPO_URL;
  }
}

let settings: CaptureSettings = { ...DEFAULT_SETTINGS };

function setStatus(message: string, kind: "idle" | "ok" | "error" = "idle") {
  statusEl.textContent = message;
  statusEl.classList.toggle("ok", kind === "ok");
  statusEl.classList.toggle("error", kind === "error");
}

function setBusy(busy: boolean) {
  capturePageBtn.disabled = busy;
  captureMultiBtn.disabled = busy;
  selectElementBtn.disabled = busy;
}

function renderLayout() {
  layoutAutoBtn.classList.toggle("active", settings.layout === "auto");
  layoutAbsoluteBtn.classList.toggle("active", settings.layout === "absolute");
}

function renderChips() {
  chipsEl.innerHTML = "";
  for (const preset of VIEWPORT_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent =
      preset.width == null && preset.id !== "custom"
        ? preset.label
        : preset.id === "custom"
          ? "Custom"
          : `${preset.label} ${preset.width}`;
    btn.classList.toggle("active", settings.viewportPresets.includes(preset.id));
    btn.addEventListener("click", () => {
      const id = preset.id as ViewportPresetId;
      const exists = settings.viewportPresets.includes(id);
      if (exists) {
        if (settings.viewportPresets.length === 1) return;
        settings.viewportPresets = settings.viewportPresets.filter((v) => v !== id);
      } else {
        settings.viewportPresets = [...settings.viewportPresets, id];
      }
      renderChips();
      void persist();
    });
    chipsEl.append(btn);
  }
  customWidthWrap.classList.toggle(
    "hidden",
    !settings.viewportPresets.includes("custom"),
  );
  customWidthInput.value = String(settings.customWidth);
}

async function persist() {
  await saveSettings(settings);
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("about:")
  ) {
    throw new Error("Open a normal webpage first (http/https/localhost).");
  }
  return tab.id;
}

async function ensureContentScript(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

async function requestCapture(mode: CaptureMode) {
  setBusy(true);
  const labels: Record<CaptureMode, string> = {
    page: "Capturing this window… watch the progress bar on the page.",
    element: "Click an element on the page, then paste in Figma when done.",
    multi: "Capturing viewports… watch the progress bar on the page.",
  };
  setStatus(labels[mode]);

  try {
    await persist();
    const tabId = await getActiveTabId();
    await ensureContentScript(tabId);

    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "HTML2FIGMA_CAPTURE",
      mode,
      settings,
    } satisfies CaptureRequest)) as CaptureResponse | undefined;

    if (!response?.ok) {
      throw new Error(response?.message || "Capture failed.");
    }

    setStatus(response.message, "ok");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    setStatus(message, "error");
  } finally {
    setBusy(false);
  }
}

layoutAutoBtn.addEventListener("click", () => {
  settings.layout = "auto";
  renderLayout();
  void persist();
});

layoutAbsoluteBtn.addEventListener("click", () => {
  settings.layout = "absolute";
  renderLayout();
  void persist();
});

customWidthInput.addEventListener("change", () => {
  const value = Number(customWidthInput.value);
  settings.customWidth = Number.isFinite(value)
    ? Math.min(3840, Math.max(320, Math.round(value)))
    : DEFAULT_SETTINGS.customWidth;
  customWidthInput.value = String(settings.customWidth);
  void persist();
});

capturePageBtn.addEventListener("click", () => {
  void requestCapture("page");
});

captureMultiBtn.addEventListener("click", () => {
  void requestCapture("multi");
});

selectElementBtn.addEventListener("click", () => {
  void requestCapture("element");
});

void (async () => {
  wireRepoLinks();
  settings = await loadSettings();
  renderChips();
  renderLayout();
})();
