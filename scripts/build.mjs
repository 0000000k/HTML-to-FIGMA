import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { figitGlyphSafePlugin } from "./figit-glyph-safe-plugin.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  format: "iife",
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info",
  alias: {
    // Figit/colorjs throws on empty CSS colors and skips whole DOM nodes.
    "colorjs.io": resolve(root, "src/shims/colorjs-safe.ts"),
  },
  plugins: [figitGlyphSafePlugin()],
};

async function prepareDist() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  cpSync(resolve(root, "public"), dist, { recursive: true });
}

async function build() {
  await prepareDist();

  const contexts = await Promise.all([
    esbuild.context({
      ...shared,
      entryPoints: [resolve(root, "src/content/content.ts")],
      outfile: resolve(dist, "content.js"),
      platform: "browser",
    }),
    esbuild.context({
      ...shared,
      entryPoints: [resolve(root, "src/background/service-worker.ts")],
      outfile: resolve(dist, "background.js"),
      platform: "browser",
    }),
    esbuild.context({
      ...shared,
      entryPoints: [resolve(root, "src/popup/main.ts")],
      outfile: resolve(dist, "popup.js"),
      platform: "browser",
    }),
  ]);

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("Watching for changes…");
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    console.log("Build complete → dist/");
  }
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
