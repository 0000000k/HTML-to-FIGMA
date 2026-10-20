import type { CaptureSettings, ViewportPresetId } from "./messages";

export const VIEWPORT_PRESETS: Array<{
  id: ViewportPresetId;
  label: string;
  width: number | null;
}> = [
  { id: "current", label: "Current", width: null },
  { id: "390", label: "Mobile", width: 390 },
  { id: "768", label: "Tablet", width: 768 },
  { id: "1280", label: "Laptop", width: 1280 },
  { id: "1440", label: "Desktop", width: 1440 },
  { id: "custom", label: "Custom", width: null },
];

export const DEFAULT_SETTINGS: CaptureSettings = {
  layout: "auto",
  viewportPresets: ["current"],
  customWidth: 1200,
  imageConcurrency: 8,
  excludeFloatingWidgets: false,
};

export async function loadSettings(): Promise<CaptureSettings> {
  const stored = await chrome.storage.sync.get("settings");
  const raw = stored.settings as Partial<CaptureSettings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    viewportPresets: raw?.viewportPresets?.length
      ? raw.viewportPresets
      : DEFAULT_SETTINGS.viewportPresets,
  };
}

export async function saveSettings(settings: CaptureSettings): Promise<void> {
  await chrome.storage.sync.set({ settings });
}

export function resolveViewportWidths(settings: CaptureSettings): Array<{
  id: string;
  label: string;
  width: number | null;
}> {
  const widths: Array<{ id: string; label: string; width: number | null }> = [];

  for (const id of settings.viewportPresets) {
    if (id === "custom") {
      widths.push({
        id: "custom",
        label: `Custom · ${settings.customWidth}`,
        width: settings.customWidth,
      });
      continue;
    }
    const preset = VIEWPORT_PRESETS.find((item) => item.id === id);
    if (!preset) continue;
    widths.push({
      id: preset.id,
      label:
        preset.width == null
          ? "Current"
          : `${preset.label} · ${preset.width}`,
      width: preset.width,
    });
  }

  if (widths.length === 0) {
    widths.push({ id: "current", label: "Current", width: null });
  }

  return widths;
}
