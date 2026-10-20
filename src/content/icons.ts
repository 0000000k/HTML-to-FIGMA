/**
 * Materialize icon fonts, SVG sprites, and CSS masks into real <img> nodes.
 * Figit cannot paint ::before glyphs, <use href="#sprite">, or mask-image.
 */

async function wait(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

function absolutize(url: string): string {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

function extractUrls(value: string): string[] {
  if (!value || value === "none") return [];
  const urls: string[] = [];
  const re = /url\(\s*(['"]?)([^"')]+)\1\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const raw = match[2]?.trim();
    if (raw) urls.push(raw);
  }
  return urls;
}

const ICON_FONT_RE =
  /icon|fontawesome|font-awesome|fa-|material|symbols|glyph|phosphor|lucide|bootstrap-icons|feather|ionicons|remixicon|tabler|heroicons|octicons|svg-inline/i;

function looksLikeIconFont(fontFamily: string): boolean {
  return ICON_FONT_RE.test(fontFamily);
}

function hasPrivateUseChars(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // Private Use Areas commonly used by icon fonts
    if (
      (code >= 0xe000 && code <= 0xf8ff) ||
      (code >= 0xf0000 && code <= 0xffffd)
    ) {
      return true;
    }
  }
  return false;
}

function parseCssContent(content: string): string {
  if (!content || content === "none" || content === "normal") return "";
  // "\f007" or '★' or "foo"
  const quoted = /^(['"])(.*)\1$/.exec(content);
  let raw = quoted ? quoted[2] : content;
  raw = raw.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
  return raw;
}

function replaceWithImg(
  el: Element,
  dataUrl: string,
  rect: DOMRect,
  label = "Icon",
) {
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = label;
  img.decoding = "sync";
  img.loading = "eager";
  img.dataset.html2figmaIcon = "1";
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  img.width = w;
  img.height = h;
  img.setAttribute(
    "style",
    [
      `width:${w}px`,
      `height:${h}px`,
      "display:inline-block",
      "object-fit:contain",
      "vertical-align:middle",
      "margin:0",
      "padding:0",
      "border:0",
      "max-width:none",
    ].join(";"),
  );
  el.replaceWith(img);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
  return img;
}

async function rasterizeSvgMarkup(
  svgMarkup: string,
  width: number,
  height: number,
  color?: string,
): Promise<string | null> {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const scale = 2;
  let markup = svgMarkup.trim();
  if (!markup.includes("xmlns=")) {
    markup = markup.replace(
      /<svg\b/i,
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
  }
  // Replace inherited currentColor only. Never force a root fill: doing
  // so paints paths that intentionally use fill=none or a distinct color.
  if (color) markup = markup.replaceAll("currentColor", color);

  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) {
      const res = await fetch(url);
      return await res.text();
    }
    // Prefer extension proxy for cross-origin SVGs.
    try {
      const proxied = (await chrome.runtime.sendMessage({
        type: "HTML2FIGMA_FETCH_BYTES",
        url: absolutize(url),
      })) as { ok?: boolean; base64?: string; mimeType?: string } | undefined;
      if (proxied?.ok && proxied.base64) {
        return atob(proxied.base64);
      }
    } catch {
      // fall through
    }
    const response = await fetch(absolutize(url), { credentials: "include" });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Preserve the symbol viewBox while expanding same-document SVG sprites.
 * A bare <g> drops the original viewBox and distorts the icon's geometry.
 */
export function expandSvgUseReferences(root: HTMLElement) {
  const uses = Array.from(root.querySelectorAll("use"));
  for (const use of uses) {
    const href =
      use.getAttribute("href") || use.getAttribute("xlink:href") || "";
    if (!href.startsWith("#")) continue;
    const target = document.getElementById(href.slice(1));
    if (!target || !target.closest("svg")) continue;

    const isSymbol = target.tagName.toLowerCase() === "symbol";
    const replacement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      isSymbol ? "svg" : "g",
    );

    if (isSymbol) {
      for (const attr of ["viewBox", "preserveAspectRatio"]) {
        const value = target.getAttribute(attr);
        if (value) replacement.setAttribute(attr, value);
      }
      // The referenced symbol's viewBox must scale inside the use viewport.
      replacement.setAttribute("width", use.getAttribute("width") || "100%");
      replacement.setAttribute("height", use.getAttribute("height") || "100%");
      if (use.hasAttribute("x")) replacement.setAttribute("x", use.getAttribute("x")!);
      if (use.hasAttribute("y")) replacement.setAttribute("y", use.getAttribute("y")!);
    } else {
      const x = Number.parseFloat(use.getAttribute("x") || "0") || 0;
      const y = Number.parseFloat(use.getAttribute("y") || "0") || 0;
      if (x || y) replacement.setAttribute("transform", `translate(${x} ${y})`);
    }

    for (const child of Array.from(target.childNodes)) {
      replacement.appendChild(child.cloneNode(true));
    }
    for (const attr of Array.from(use.attributes)) {
      if (["href", "xlink:href", "x", "y", "width", "height"].includes(attr.name)) {
        continue;
      }
      replacement.setAttribute(attr.name, attr.value);
    }
    use.replaceWith(replacement);
  }
}

/** Inline live computed SVG painting styles before serializing to a Blob.
 * Otherwise icons styled with external CSS lose their strokes and fills.
 */
function cloneWithSvgPaintStyles(svg: SVGElement): SVGElement {
  const clone = svg.cloneNode(true) as SVGElement;
  const sourceElements: Element[] = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const cloneElements: Element[] = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const paintProps = [
    "color", "fill", "fill-opacity", "fill-rule", "stroke",
    "stroke-width", "stroke-opacity", "stroke-linecap",
    "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
    "stroke-dashoffset", "opacity", "visibility", "display",
    "paint-order", "vector-effect",
  ];
  sourceElements.forEach((source, i) => {
    const counterpart = cloneElements[i];
    if (!(counterpart instanceof SVGElement)) return;
    const computed = getComputedStyle(source);
    for (const prop of paintProps) {
      const value = computed.getPropertyValue(prop);
      if (value) counterpart.style.setProperty(prop, value);
    }
  });
  return clone;
}

function isComplexSvg(svg: SVGElement): boolean {
  return Boolean(
    svg.querySelector(
      "use, mask, clipPath, filter, foreignObject, image, pattern",
    ),
  );
}

/** Rasterize SVGs that figit cannot vectorize cleanly. */
export async function rasterizeComplexSvgs(
  root: HTMLElement,
  signal?: AbortSignal,
) {
  const svgs = Array.from(root.querySelectorAll("svg"));
  for (const svg of svgs) {
    if (signal?.aborted) throw new DOMException("Capture cancelled", "AbortError");
    if (!(svg instanceof SVGElement)) continue;
    if (svg.dataset.html2figmaIcon === "1") continue;

    const rect = svg.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    // Always rasterize tiny icons; also complex ones.
    const tiny = rect.width <= 96 && rect.height <= 96;
    if (!tiny && !isComplexSvg(svg)) continue;

    try {
      const clone = cloneWithSvgPaintStyles(svg);
      if (!clone.getAttribute("xmlns")) {
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }
      const cs = getComputedStyle(svg);
      const color = cs.color || "#000";
      // Paint attributes are baked per path, preserving fill=none and
      // multicolor artwork rather than overwriting everything with one fill.
      clone.setAttribute("color", color);
      if (!clone.getAttribute("width")) {
        clone.setAttribute("width", String(Math.ceil(rect.width)));
      }
      if (!clone.getAttribute("height")) {
        clone.setAttribute("height", String(Math.ceil(rect.height)));
      }

      const dataUrl = await rasterizeSvgMarkup(
        new XMLSerializer().serializeToString(clone),
        rect.width,
        rect.height,
        color,
      );
      if (!dataUrl) continue;
      replaceWithImg(svg, dataUrl, rect, "SVG icon");
    } catch {
      // ignore
    }
  }
}

/** Materialize CSS mask-image / -webkit-mask-image icons as tinted PNGs. */
export async function materializeCssMasks(
  root: HTMLElement,
  signal?: AbortSignal,
) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("*"));
  for (const el of elements) {
    if (signal?.aborted) throw new DOMException("Capture cancelled", "AbortError");
    if (el.dataset.html2figmaIcon === "1") continue;
    if (el.closest("#html2figma-hud-host")) continue;

    const cs = getComputedStyle(el);
    const mask =
      cs.getPropertyValue("mask-image") ||
      cs.getPropertyValue("-webkit-mask-image") ||
      // Safari/Chromium prefixed accessors
      (cs as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage ||
      "";
    if (!mask || mask === "none") continue;

    const urls = extractUrls(mask);
    if (urls.length === 0) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    const color = cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      cs.backgroundColor !== "transparent"
      ? cs.backgroundColor
      : cs.color || "#000";
    const url = urls[0];
    try {
      const markup = url.startsWith("data:") || url.includes(".svg")
        ? await fetchText(url) : null;
      // Draw the mask's alpha first, then tint with the CSS background color.
      // A mask SVG's own fill is not the visible icon color.
      const rawMask = markup?.includes("<svg")
        ? await rasterizeSvgMarkup(markup, rect.width, rect.height)
        : null;
      const image = await loadImage(
        rawMask || (url.startsWith("data:") ? url : absolutize(url)),
      );
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(rect.width * scale);
      canvas.height = Math.ceil(rect.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      if (!dataUrl) continue;
      replaceWithImg(el, dataUrl, rect, "Mask icon");
    } catch {
      // ignore
    }
  }
}

function rasterizeGlyphToDataUrl(
  text: string,
  cs: CSSStyleDeclaration,
  width: number,
  height: number,
): string | null {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = cs.color || "#000";
  ctx.font = cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
  return canvas.toDataURL("image/png");
}

/** Turn icon-font nodes (and ::before/::after glyphs) into images. */
export async function materializeIconFonts(
  root: HTMLElement,
  signal?: AbortSignal,
) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("*"));

  for (const el of elements) {
    if (signal?.aborted) throw new DOMException("Capture cancelled", "AbortError");
    if (el.dataset.html2figmaIcon === "1") continue;
    if (el.closest("#html2figma-hud-host")) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.width > 128 || rect.height > 128) {
      // Icon fonts are almost always small; skip large text blocks.
      // Still allow slightly larger icon buttons up to 128.
    }
    if (rect.width < 1 || rect.height < 1) continue;
    if (rect.width > 160 || rect.height > 160) continue;

    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;

    const before = getComputedStyle(el, "::before");
    const after = getComputedStyle(el, "::after");
    const beforeText = parseCssContent(before.content);
    const afterText = parseCssContent(after.content);
    const ownText = (el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE
      ? el.textContent?.trim()
      : "") || "";

    const candidates: Array<{ text: string; style: CSSStyleDeclaration }> = [];
    if (
      beforeText &&
      (looksLikeIconFont(before.fontFamily) || hasPrivateUseChars(beforeText))
    ) {
      candidates.push({ text: beforeText, style: before });
    }
    if (
      afterText &&
      (looksLikeIconFont(after.fontFamily) || hasPrivateUseChars(afterText))
    ) {
      candidates.push({ text: afterText, style: after });
    }
    if (
      ownText &&
      ownText.length <= 4 &&
      (looksLikeIconFont(cs.fontFamily) || hasPrivateUseChars(ownText))
    ) {
      candidates.push({ text: ownText, style: cs });
    }

    if (candidates.length === 0) continue;

    // Prefer the first glyph candidate.
    const { text, style } = candidates[0];
    const dataUrl = rasterizeGlyphToDataUrl(text, style, rect.width, rect.height);
    if (!dataUrl) continue;
    replaceWithImg(el, dataUrl, rect, `Icon ${text}`);
  }

  await wait(0);
}

/**
 * Include data: SVG / mask URLs that backgrounds previously skipped.
 * Call after expandSvgUseReferences.
 */
export async function materializeIconAssets(
  root: HTMLElement,
  signal?: AbortSignal,
) {
  expandSvgUseReferences(root);
  await materializeCssMasks(root, signal);
  await materializeIconFonts(root, signal);
  await rasterizeComplexSvgs(root, signal);
}
