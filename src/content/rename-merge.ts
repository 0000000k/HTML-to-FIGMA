import type { ConvertResult, FigmaClipboard } from "@figit/dom-to-figma";
import {
  composeClipboardHtml,
  encodeFigmaData,
  toClipboardItem,
} from "@figit/fig-kiwi";
import { layerNameFromElement } from "./classify";

type Guid = { sessionID: number; localID: number };

type AnyNode = Record<string, unknown> & {
  guid?: Guid;
  type?: string;
  name?: string;
  parentIndex?: { guid: Guid; position: string };
  transform?: { m00: number; m01: number; m02: number; m10: number; m11: number; m12: number };
  fillPaints?: unknown;
  strokePaints?: unknown;
  effects?: unknown;
};

function guidKey(guid: Guid): string {
  return `${guid.sessionID}:${guid.localID}`;
}

function remapGuid(guid: Guid, offset: number): Guid {
  return { sessionID: guid.sessionID, localID: guid.localID + offset };
}

function walkPaintBlobIndexes(value: unknown, shift: (index: number) => number) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkPaintBlobIndexes(item, shift);
    return;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.imageBlob === "number") {
    obj.imageBlob = shift(obj.imageBlob);
  }
  if (typeof obj.blobIndex === "number") {
    obj.blobIndex = shift(obj.blobIndex);
  }
  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === "object") {
      walkPaintBlobIndexes(nested, shift);
    }
  }
}

/** Apply human-readable names using convert trace paths. */
export function applyLayerNames(
  result: ConvertResult,
  root: Element,
): FigmaClipboard {
  const doc = structuredClone(result.document) as FigmaClipboard;
  if (!result.trace) return doc;

  const byGuid = new Map<string, AnyNode>();
  for (const node of doc.nodeChanges as AnyNode[]) {
    if (node.guid) byGuid.set(guidKey(node.guid), node);
  }

  for (const entry of result.trace.entries) {
    const node = byGuid.get(guidKey(entry.guid));
    if (!node) continue;
    const path = entry.domPath.replace(/::text\[\d+\]$/, "");
    try {
      const resolved =
        path === ":scope" ? root : root.querySelector(path);
      if (resolved) {
        node.name = layerNameFromElement(resolved);
      } else if (entry.tag) {
        node.name = entry.tag.toLowerCase();
      }
    } catch {
      if (entry.tag) node.name = entry.tag.toLowerCase();
    }
  }

  return doc;
}

/**
 * Merge several single-frame clipboard docs into one multi-frame canvas.
 * Each capture should be a normal figit single-frame paste document.
 */
export function mergeCaptureDocuments(
  captures: Array<{ document: FigmaClipboard; x: number; name: string }>,
): ClipboardItem {
  if (captures.length === 1) {
    const encoded = encodeFigmaData(captures[0].document);
    return toClipboardItem(composeClipboardHtml(encoded.base64));
  }

  const mergedBlobs: Array<{ bytes: number[] }> = [];
  const mergedNodes: AnyNode[] = [];
  let localIdOffset = 100;
  let blobOffset = 0;

  const documentNode: AnyNode = {
    guid: { sessionID: 0, localID: 0 },
    type: "DOCUMENT",
    name: "Document",
    children: [],
  };
  const canvasNode: AnyNode = {
    guid: { sessionID: 0, localID: 1 },
    type: "CANVAS",
    name: "Free HTML to Figma",
    parentIndex: {
      guid: { sessionID: 0, localID: 0 },
      position: "0",
    },
    backgroundColor: { r: 0.96, g: 0.95, b: 0.93, a: 1 },
    backgroundEnabled: true,
  };

  mergedNodes.push(documentNode, canvasNode);

  captures.forEach((capture, captureIndex) => {
    const nodes = capture.document.nodeChanges as AnyNode[];
    const rootFrame = nodes.find((node) => node.type === "FRAME");
    if (!rootFrame?.guid) return;

    const rootKey = guidKey(rootFrame.guid);
    const included = new Set<string>([rootKey]);

    // Include root + all descendants by parentIndex walk.
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes) {
        if (!node.guid || !node.parentIndex) continue;
        const key = guidKey(node.guid);
        const parentKey = guidKey(node.parentIndex.guid);
        if (!included.has(key) && included.has(parentKey)) {
          included.add(key);
          changed = true;
        }
      }
    }

    const offset = localIdOffset;
    localIdOffset += included.size + 10;
    const blobStart = blobOffset;
    const blobs = capture.document.blobs || [];
    mergedBlobs.push(...blobs);
    blobOffset += blobs.length;

    const shiftBlob = (index: number) => index + blobStart;

    for (const node of nodes) {
      if (!node.guid || !included.has(guidKey(node.guid))) continue;
      const clone = structuredClone(node) as AnyNode;
      clone.guid = remapGuid(node.guid, offset);

      if (guidKey(node.guid) === rootKey) {
        clone.parentIndex = {
          guid: { sessionID: 0, localID: 1 },
          position: String(captureIndex).padStart(4, "0"),
        };
        clone.name = capture.name;
        if (clone.transform) {
          clone.transform.m02 = capture.x;
          clone.transform.m12 = 0;
        } else {
          clone.transform = {
            m00: 1,
            m01: 0,
            m02: capture.x,
            m10: 0,
            m11: 1,
            m12: 0,
          };
        }
      } else if (clone.parentIndex) {
        clone.parentIndex = {
          guid: remapGuid(clone.parentIndex.guid, offset),
          position: clone.parentIndex.position,
        };
      }

      walkPaintBlobIndexes(clone, shiftBlob);
      mergedNodes.push(clone);
    }
  });

  const document: FigmaClipboard = {
    type: "NODE_CHANGES",
    sessionID: 0,
    ackID: 0,
    nodeChanges: mergedNodes as FigmaClipboard["nodeChanges"],
    blobs: mergedBlobs,
    pasteID: 777,
    pasteFileKey: "IAMA_DUMMY_FILE_KEY_AMA",
    pasteIsPartiallyOutsideEnclosingFrame: false,
    isCut: false,
    pasteEditorType: "DESIGN",
    publishedAssetGuids: [],
  };

  const encoded = encodeFigmaData(document);
  return toClipboardItem(composeClipboardHtml(encoded.base64));
}

export function clipboardFromNamedDocument(document: FigmaClipboard): ClipboardItem {
  const encoded = encodeFigmaData(document);
  return toClipboardItem(composeClipboardHtml(encoded.base64));
}
