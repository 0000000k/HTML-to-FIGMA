import type { Classify, ElementKind } from "@figit/dom-to-figma";

const TAILWIND_HINT_RE =
  /^(flex|grid|inline-flex|items-|justify-|gap-|p[xytblr]?-|m[xytblr]?-|w-|h-|min-|max-|rounded|shadow|text-|bg-|border|font-|leading|tracking|opacity-|z-|overflow-|relative|absolute|fixed|sticky)/;

export function looksLikeTailwind(element: Element): boolean {
  const classes = Array.from(element.classList);
  let count = 0;
  for (const className of classes) {
    if (TAILWIND_HINT_RE.test(className) && ++count >= 2) return true;
  }
  return false;
}

function cleanText(value: string | null | undefined, max = 54): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Prefer labels a user could actually recognize in the interface. */
function accessibleLabel(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() || "")
      .filter(Boolean)
      .join(" ");
    if (label) return cleanText(label);
  }
  return cleanText(
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.getAttribute("alt") ||
    element.getAttribute("placeholder"),
  );
}

function directText(element: Element): string {
  return cleanText(
    Array.from(element.childNodes)
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent || "")
      .join(" "),
  );
}

function shortText(element: Element): string {
  const value = (element.textContent || "").replace(/\s+/g, " ").trim();
  // Don't name a whole section after all its concatenated content.
  return value.length <= 65 ? cleanText(value) : "";
}

function titleWithin(element: Element): string {
  const candidate = element.querySelector(
    "h1, h2, h3, h4, h5, h6, [class*='title'], [class*='Title'], [class*='name'], [class*='Name'], strong, b",
  );
  const value = candidate?.textContent?.replace(/\s+/g, " ").trim() || "";
  if (value && value.length <= 70) return cleanText(value);
  return "";
}

function hasClassHint(element: Element, expression: RegExp): boolean {
  // Match meaningful prefixes in CSS module names, but never copy hashes
  // or generated suffixes into the final Figma layer names.
  return Array.from(element.classList).some((name) => expression.test(name));
}

function named(type: string, label: string): string {
  return label ? `${type} / ${label}` : type;
}

/**
 * Human-readable semantics rather than #id, div.class, or CSS module hashes.
 * This names layers; it does not claim to create real Figma components.
 */
export function layerNameFromElement(element: Element): string {
  const override = cleanText(element.getAttribute("data-figma-name"));
  if (override) return override;

  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() || "";
  const a11y = accessibleLabel(element);
  const own = directText(element);
  const label = a11y || own || shortText(element);

  if (tag === "body" || tag === "html") {
    return named("Page", cleanText(document.title.split(/[|·]/)[0], 42));
  }
  if (tag === "aside" || hasClassHint(element, /sidebar|side-nav/i)) {
    return named("Sidebar", a11y);
  }
  if (tag === "main" || role === "main") return "Main content";
  if (tag === "header" || role === "banner") return named("Header", a11y);
  if (tag === "footer" || role === "contentinfo") return "Footer";
  if (tag === "nav" || role === "navigation") return named("Navigation", a11y);

  if (/^h[1-6]$/.test(tag) || role === "heading") {
    return named("Heading", label);
  }
  if (role === "dialog" || role === "alertdialog" || tag === "dialog") {
    return named("Dialog", a11y || titleWithin(element));
  }
  if (role === "tab") return named("Tab", label);
  if (role === "tablist") return named("Tabs", a11y);
  if (role === "tabpanel") return named("Tab panel", a11y);
  if (role === "menu") return named("Menu", a11y);
  if (role === "menuitem") return named("Menu item", label);
  if (role === "alert" || role === "status") return named("Notification", label);
  if (role === "switch") return named("Switch", label);
  if (role === "checkbox") return named("Checkbox", label);

  if (tag === "button" || role === "button" ||
      (tag === "input" && /^(button|submit|reset)$/.test(element.getAttribute("type") || ""))) {
    return named("Button", label || cleanText(element.getAttribute("value")));
  }
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const type = element.getAttribute("type");
    if (type === "checkbox" || type === "radio") {
      return named(type === "radio" ? "Radio" : "Checkbox", a11y);
    }
    return named("Input", a11y || cleanText(element.getAttribute("name")));
  }
  if (tag === "label") return named("Label", label);
  if (tag === "img" || tag === "picture") {
    return named("Image", a11y);
  }
  if (tag === "svg") return named("Icon", a11y);
  if (tag === "p" || tag === "small" || tag === "blockquote") {
    return named("Text", label);
  }

  const cardLike =
    hasClassHint(element, /card|tile|gridlist[_-]*item|startprocesspanel|workflowitem|templateitem/i) ||
    role === "article";
  const cardLabel = titleWithin(element) || a11y || shortText(element);
  if (cardLike && !hasClassHint(element, /cardicon|iconcard/i)) {
    return named("Card", cardLabel);
  }

  if (tag === "a") {
    if (element.closest("nav, aside, [role='navigation']")) {
      return named("Nav item", label || titleWithin(element));
    }
    return named("Link", label || titleWithin(element));
  }
  if (tag === "section" || role === "region") {
    return named("Section", a11y || titleWithin(element));
  }
  if (tag === "form") return named("Form", a11y);
  if (tag === "ul" || tag === "ol" || role === "list") return named("List", a11y);
  if (tag === "li" || role === "listitem") {
    return named("List item", titleWithin(element) || label);
  }
  if (role === "grid" || hasClassHint(element, /gridlist|grid[-_]?container/i)) {
    return named("Grid", a11y);
  }
  if (tag === "table" || role === "table") return named("Table", a11y);
  if (tag === "tr" || role === "row") return "Table row";
  if (tag === "td" || tag === "th" || role === "cell") return named("Table cell", label);

  if (hasClassHint(element, /badge|chip|pill/i)) return named("Badge", label);
  if (hasClassHint(element, /avatar/i)) return named("Avatar", a11y);
  if (hasClassHint(element, /logo/i)) return named("Logo", a11y);
  if (hasClassHint(element, /icon/i)) return named("Icon", a11y);
  if (hasClassHint(element, /divider|separator/i) || tag === "hr") return "Divider";
  if (hasClassHint(element, /stack|flex[-_]?column/i)) return "Stack";
  if (hasClassHint(element, /row|flex[-_]?row/i)) return "Row";
  if (hasClassHint(element, /grid/i)) return "Grid";
  if (hasClassHint(element, /container|wrapper|content|layout/i)) return "Container";

  return tag === "span" ? named("Text", own || shortText(element)) : "Group";
}

/** Preserve figit's native element classification for layout fidelity. */
export const html2figmaClassify: Classify = (
  _element: Element,
  defaultKind: ElementKind,
) => defaultKind;
