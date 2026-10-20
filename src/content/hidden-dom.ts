/**
 * Remove non-rendered UI from the conversion tree temporarily.
 *
 * React apps often keep closed dialogs, toast hosts and chat portals
 * mounted in document.body. Some DOM-to-Figma serializers include their
 * layers even when the browser paints nothing.
 *
 * This operates on the live DOM only while capture runs. Every detached
 * subtree is restored afterwards, in its original sibling position.
 */
export function detachHiddenDom(root: HTMLElement): () => void {
  const detached: Array<{
    element: Element;
    parent: Node;
    nextSibling: Node | null;
  }> = [];

  const portalName = /modal|dialog|intercom|chat.?panel|notification|toast|cookie.?banner|popover/i;

  for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (!element.isConnected || !root.contains(element)) continue;
    if (
      element.matches("script, style, link, template") ||
      element.closest("#html2figma-hud-host")
    ) {
      continue;
    }

    const cs = getComputedStyle(element);
    const hiddenByStyle =
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      cs.visibility === "collapse" ||
      cs.contentVisibility === "hidden" ||
      Number(cs.opacity) <= 0;

    // A zero-sized portal can have a deliberately positioned visible child.
    // Only remove it if nothing in its subtree appears to be rendered.
    let emptyPortal = false;
    if (!hiddenByStyle && portalName.test(element.id)) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) {
        const visibleChild = Array.from(element.querySelectorAll<HTMLElement>("*"))
          .some((child) => {
            const childStyle = getComputedStyle(child);
            if (
              childStyle.display === "none" ||
              childStyle.visibility !== "visible" ||
              Number(childStyle.opacity) <= 0
            ) return false;
            const bounds = child.getBoundingClientRect();
            return bounds.width > 1 && bounds.height > 1;
          });
        emptyPortal = !visibleChild;
      }
    }

    if (!hiddenByStyle && !emptyPortal) continue;

    const parent = element.parentNode;
    if (!parent) continue;
    detached.push({ element, parent, nextSibling: element.nextSibling });
    parent.removeChild(element);
  }

  return () => {
    for (const { element, parent, nextSibling } of detached.reverse()) {
      if (nextSibling?.parentNode === parent) {
        parent.insertBefore(element, nextSibling);
      } else {
        parent.appendChild(element);
      }
    }
  };
}
