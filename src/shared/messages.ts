import type { ConverterLayout } from "@figit/dom-to-figma";

export type CaptureMode = "page" | "element" | "multi";

export type ViewportPresetId =
  | "current"
  | "390"
  | "768"
  | "1280"
  | "1440"
  | "custom";

export type CaptureSettings = {
  layout: ConverterLayout;
  viewportPresets: ViewportPresetId[];
  customWidth: number;
  imageConcurrency: number;
  excludeFloatingWidgets: boolean;
  simplifyLayers: boolean;
};

export type CaptureRequest = {
  type: "HTML2FIGMA_CAPTURE";
  mode: CaptureMode;
  settings: CaptureSettings;
};

export type CaptureResponse = {
  ok: boolean;
  message: string;
};

export type FetchBytesRequest = {
  type: "HTML2FIGMA_FETCH_BYTES";
  url: string;
};

export type FetchBytesResponse = {
  ok: boolean;
  base64?: string;
  mimeType?: string;
  error?: string;
};

export type ResizeWindowRequest = {
  type: "HTML2FIGMA_RESIZE_WINDOW";
  width: number | null;
};

export type ResizeWindowResponse = {
  ok: boolean;
  previousWidth?: number;
  error?: string;
};

export type ProgressPayload = {
  type: "HTML2FIGMA_PROGRESS";
  stage: "prepare" | "assets" | "convert" | "clipboard" | "done" | "error";
  message: string;
  current?: number;
  total?: number;
  percent: number;
};

export type CancelRequest = {
  type: "HTML2FIGMA_CANCEL";
};

export type ExtensionMessage =
  | CaptureRequest
  | FetchBytesRequest
  | ResizeWindowRequest
  | ProgressPayload
  | CancelRequest;
