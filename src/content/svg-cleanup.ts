/**
 * Keep non-rendered SVG definitions out of Figma captures.
 *
 * Browsers do not draw <symbol>, <title>, <desc>, and shape definitions
 * inside <defs> directly. The converter may accidentally treat them as
 * visible geometry (often producing huge SVG glyphs or duplicate logos).
 *
 * Call only after materializeIconAssets(): it expands same-document <use>
 * references and rasterizes unsupported SVGs first.
 *
 * We temporarily detach only SVG-only metadata/definitions, and invisible
 * SVG roots. Visible SVGs and their gradients, masks and filters remain.
 * The original DOM is restored in a finally block after capture.
 */
export function detachNonRenderedSvg(root: HTMLElement): () => void {
  const detached: Array<{
    node: Element;
    parent: Node;
    nextSibling: Node | null;
  }> = [];

  function detach(node: Element) {
    const parent = node.parentNode;
    if (!parent || !node.isConnected) return;
    detached.push({ node, parent, nextSibling: node.nextSibling });
    parent.removeChild(node);
  }

  // SVG metadata and definition shapes are not directly painted.
  // <use href="#id"> has already been expanded earlier in preparation.
  const definitionSelectors = [
    "svg symbol",
    "svg title",
    "svg desc",
    "svg defs > g",
    "svg defs > path",
    "svg defs > rect",
    "svg defs > circle",
    "svg defs > ellipse",
    "svg defs > line",
    "svg defs > polyline",
    "svg defs > polygon",
    "svg defs > text",
  ].join(", ");
  for (const node of Array.from(root.querySelectorAll(definitionSelectors))) {
    detach(node);
  }

  // The page can keep whole icon sprites and branding assets as zero-size,
  // display:none, or offscreen SVGs. These are not visible in Chrome, but
  // could still be serialized into the imported Figma layers.
  for (const svg of Array.from(root.querySelectorAll<SVGSVGElement>("svg"))) {
    if (!svg.isConnected) continue;

    const box = svg.getBoundingClientRect();
    let invisible = box.width <= 1 || box.height <= 1;
    if (box.right < -256 || box.bottom < -256) invisible = true;

    for (let ancestor: Element | null = svg; ancestor; ancestor = ancestor.parentElement) {
      const computed = getComputedStyle(ancestor);
      if (
        computed.display === "none" ||
        computed.visibility === "hidden" ||
        computed.visibility === "collapse" ||
        Number(computed.opacity) === 0
      ) {
        invisible = true;
        break;
      }
      if (ancestor === root) break;
    }

    if (invisible) detach(svg);
  }

  return () => {
    // Reverse detach order so siblings regain their original order.
    for (const { node, parent, nextSibling } of detached.reverse()) {
      if (nextSibling && nextSibling.parentNode === parent) {
        parent.insertBefore(node, nextSibling);
      } else {
        parent.appendChild(node);
      }
    }
  };
}
