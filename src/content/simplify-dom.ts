/**
 * Safely flatten only visually inert, single-child HTML wrappers.
 *
 * This is opt-in: removing layout-bearing wrappers would damage Figma
 * auto-layout. Each candidate is verified against its browser geometry
 * and computed child styles after the removal. Failed candidates are
 * restored immediately. All accepted changes are restored after capture.
 */
export function simplifyNeutralWrappers(root: HTMLElement): () => void {
  const changes: Array<{
    wrapper: HTMLElement;
    child: HTMLElement;
    parent: Node;
    nextSibling: Node | null;
  }> = [];
  const targets = Array.from(root.querySelectorAll<HTMLElement>("div, span")).reverse();

  const snapshot = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    return [
      style.display, style.position, style.width, style.height,
      style.color, style.fontFamily, style.fontSize, style.fontWeight,
      style.lineHeight, style.letterSpacing, style.backgroundColor,
      style.backgroundImage, style.padding, style.margin,
      style.border, style.borderRadius, style.transform,
      style.visibility, style.opacity, style.textAlign,
    ].join("|");
  };

  const near = (a: DOMRect, b: DOMRect) =>
    Math.abs(a.x - b.x) < 0.75 &&
    Math.abs(a.y - b.y) < 0.75 &&
    Math.abs(a.width - b.width) < 0.75 &&
    Math.abs(a.height - b.height) < 0.75;

  for (const wrapper of targets) {
    if (!wrapper.isConnected || !root.contains(wrapper)) continue;
    if (wrapper.id || wrapper.hasAttribute("role") ||
        wrapper.hasAttribute("aria-label") ||
        wrapper.hasAttribute("data-testid") ||
        wrapper.hasAttribute("data-figma-name") ||
        wrapper.hasAttribute("tabindex")) continue;
    if (wrapper.closest("#html2figma-hud-host")) continue;
    if (wrapper.children.length !== 1 ||
        !(wrapper.firstElementChild instanceof HTMLElement)) continue;
    if (Array.from(wrapper.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    )) continue;

    const child = wrapper.firstElementChild as HTMLElement;
    const parent = wrapper.parentElement;
    if (!parent || parent === root && wrapper === root) continue;
    const cs = getComputedStyle(wrapper);
    const parentStyle = getComputedStyle(parent);

    // Preserve anything that establishes a Figma layout boundary,
    // affects painting, or participates in a flex/grid parent.
    if (cs.display !== "block" ||
        ["flex", "inline-flex", "grid", "inline-grid"].includes(parentStyle.display) ||
        cs.position !== "static" || cs.transform !== "none" ||
        cs.opacity !== "1" || cs.visibility !== "visible" ||
        cs.backgroundImage !== "none" || cs.boxShadow !== "none" ||
        cs.filter !== "none" || cs.overflowX !== "visible" ||
        cs.overflowY !== "visible" || cs.isolation !== "auto" ||
        cs.padding !== "0px" || cs.margin !== "0px" ||
        cs.borderTopWidth !== "0px" || cs.borderRightWidth !== "0px" ||
        cs.borderBottomWidth !== "0px" || cs.borderLeftWidth !== "0px") continue;

    // Alpha=0 means the wrapper has no paint of its own.
    const bg = cs.backgroundColor;
    if (bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") continue;
    const wrapperRect = wrapper.getBoundingClientRect();
    const before = child.getBoundingClientRect();
    if (!near(wrapperRect, before)) continue;
    const childStyle = snapshot(child);
    const nextSibling = wrapper.nextSibling;

    parent.replaceChild(child, wrapper);
    const after = child.getBoundingClientRect();
    if (!near(before, after) || snapshot(child) !== childStyle) {
      parent.replaceChild(wrapper, child);
      wrapper.appendChild(child);
      continue;
    }
    changes.push({ wrapper, child, parent, nextSibling });
  }

  return () => {
    for (const { wrapper, child, parent, nextSibling } of changes.reverse()) {
      if (child.parentNode) child.parentNode.removeChild(child);
      wrapper.appendChild(child);
      if (nextSibling?.parentNode === parent) {
        parent.insertBefore(wrapper, nextSibling);
      } else {
        parent.appendChild(wrapper);
      }
    }
  };
}
