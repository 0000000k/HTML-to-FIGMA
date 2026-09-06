/**
 * Safe wrapper around colorjs.io for @figit/dom-to-figma.
 * Figit calls `new Color(cssColor)` with values getComputedStyle can return as
 * empty/invalid ("" , unresolved, exotic keywords). colorjs throws
 * "Empty color reference" and figit then skips the entire DOM node.
 */
// Import the real build by path so esbuild's `colorjs.io` alias cannot recurse.
// @ts-expect-error colorjs dist has no dedicated module declaration for this path
import RealColor from "../../node_modules/colorjs.io/dist/color.js";

function isEmptyColor(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function createColor(...args: unknown[]) {
  const [color, ...rest] = args;
  if (isEmptyColor(color)) {
    return new RealColor("transparent");
  }
  try {
    return new (RealColor as unknown as new (...a: unknown[]) => unknown)(
      color,
      ...rest,
    );
  } catch {
    try {
      return new RealColor("transparent");
    } catch {
      return new RealColor("rgba(0, 0, 0, 0)");
    }
  }
}

const SafeColor = new Proxy(RealColor as object, {
  construct(_target, args) {
    return createColor(...(args as unknown[]));
  },
  apply(_target, _thisArg, args) {
    return createColor(...(args as unknown[]));
  },
}) as typeof RealColor;

export default SafeColor;
