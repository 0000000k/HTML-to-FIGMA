import type { Classify, ElementKind } from "@figit/dom-to-figma";

const NOISE_CLASS_RE =
  /^(hover:|focus:|active:|group-hover:|peer-|sm:|md:|lg:|xl:|2xl:|dark:|motion-|aria-|data-)/;

const USEFUL_TOKEN_RE =
  /^(btn|button|card|hero|nav|navbar|footer|header|sidebar|modal|dialog|badge|chip|avatar|logo|title|subtitle|heading|section|container|wrapper|grid|stack|row|col|form|input|label|link|menu|item|list|table|icon|image|img|banner|cta|feature|pricing|testimonial)/i;

const TAILWIND_HINT_RE =
  /^(flex|grid|inline-flex|items-|justify-|gap-|p[xytblr]?-|m[xytblr]?-|w-|h-|min-|max-|rounded|shadow|text-|bg-|border|font-|leading-|tracking-|opacity-|z-|overflow-|relative|absolute|fixed|sticky)/;

export function looksLikeTailwind(element: Element): boolean {
  const classes = getClassList(element);
  if (classes.length < 2) return false;
  let hits = 0;
  for (const name of classes) {
    if (TAILWIND_HINT_RE.test(name)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

function getClassList(element: Element): string[] {
  if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
    return [];
  }
  return Array.from(element.classList);
}

export function layerNameFromElement(element: Element): string {
  if (element instanceof HTMLElement && element.id) {
    return `#${element.id}`;
  }

  const tag = element.tagName.toLowerCase();
  const classes = getClassList(element)
    .filter((name) => !NOISE_CLASS_RE.test(name))
    .filter((name) => USEFUL_TOKEN_RE.test(name) || !TAILWIND_HINT_RE.test(name))
    .slice(0, 3);

  const useful = classes.filter((name) => USEFUL_TOKEN_RE.test(name));
  const picked = useful.length ? useful : classes.slice(0, 2);

  let name = picked.length ? `${tag}.${picked.join(".")}` : tag;
  if (looksLikeTailwind(element) && useful.length) {
    name = `TW · ${useful[0]}`;
  } else if (looksLikeTailwind(element) && element instanceof HTMLElement) {
    const role = element.getAttribute("role");
    if (role) name = `TW · ${role}`;
  }

  if (element instanceof HTMLImageElement) {
    const alt = element.alt?.trim();
    if (alt) name = `img · ${alt.slice(0, 40)}`;
  }

  return name.slice(0, 64);
}

/** Keep default kind mapping; naming is applied post-convert via trace. */
export const html2figmaClassify: Classify = (
  _element: Element,
  defaultKind: ElementKind,
) => defaultKind;
