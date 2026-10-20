/**
 * Temporarily exclude compact floating launchers (chat, help, accessibility)
 * from page captures. Fixed navigation and full-screen overlays stay intact.
 *
 * Do not remove nodes: these are often managed by third-party React widgets
 * and deleting them can break the host page. Restore styles in finally.
 */
export function hideFloatingWidgets(root: HTMLElement): () => void {
  const hidden: Array<{
    element: HTMLElement;
    display: string;
    priority: string;
  }> = [];
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];

  for (const element of elements) {
    if (element.closest("#html2figma-hud-host")) continue;

    const style = getComputedStyle(element);
    if (
      style.position !== "fixed" ||
      style.display === "none" ||
      style.visibility !== "visible" ||
      style.opacity === "0"
    ) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    // Focus on small launchers, not fixed headers, navigation or dialogs.
    if (
      rect.width < 24 ||
      rect.height < 24 ||
      rect.width > 180 ||
      rect.height > 180
    ) {
      continue;
    }

    const nearBottom =
      rect.bottom >= viewportHeight - 84 &&
      rect.bottom <= viewportHeight + 32;
    const nearRight =
      rect.right >= viewportWidth - 84 &&
      rect.right <= viewportWidth + 32;
    const nearLeft = rect.left >= -32 && rect.left <= 84;
    if (!nearBottom || (!nearRight && !nearLeft)) continue;

    const name = [
      element.id,
      element.className,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ].join(" ");
    const namedLauncher = /chat|support|help|messenger|intercom|zendesk|launcher|accessibility/i.test(name);
    const interactive =
      element.matches('button, a, iframe, [role="button"]') ||
      element.querySelector('button, a, iframe, [role="button"]') !== null;
    if (!namedLauncher && !interactive) continue;

    hidden.push({
      element,
      display: element.style.getPropertyValue("display"),
      priority: element.style.getPropertyPriority("display"),
    });
    element.style.setProperty("display", "none", "important");
  }

  return () => {
    for (const { element, display, priority } of hidden.reverse()) {
      if (display) {
        element.style.setProperty("display", display, priority);
      } else {
        element.style.removeProperty("display");
      }
    }
  };
}
