# Free HTML to Figma

Open-source Chrome extension that captures the page in your browser window and pastes it into Figma as editable layers.

**Repo:** [github.com/dynCode/HTML-to-FIGMA](https://github.com/dynCode/HTML-to-FIGMA)

**Free. Local. No account. No upload. No paid Figma plugin.**

If you can see it in Chrome (public sites, localhost, or logged-in apps), you can capture it.

## Why this exists

Commercial HTML to Figma tools are useful but often behind paywalls. This project is a free, transparent alternative you can inspect, fork, and improve.

- Runs entirely on your machine
- Copies a Figma clipboard payload locally
- Paste into any Figma file with the normal paste shortcut
- MIT licensed

## How it works

1. Open a webpage in Chrome.
2. Click **Free HTML to Figma** and capture the page or an element.
3. The extension copies a Figma-ready design to your clipboard.
4. Open Figma and paste with `Cmd+V` (Mac) or `Ctrl+V` (Windows / Linux).

You do **not** install a Figma Community plugin. Paste is enough.

## Features

- Full page capture
- Element picker
- Multi-viewport capture (mobile, tablet, laptop, desktop, custom)
- Auto Layout or Absolute positioning
- Image loading via a local CORS-friendly extension proxy
- Icon fonts, SVG sprites, and CSS mask icons (rasterized when needed)
- Tailwind / flex / grid friendly layout mapping
- On-page progress UI with cancel
- Keyboard shortcuts

## Requirements

- Google Chrome or another Chromium browser
- Node.js 18+ (to build from source)
- A Figma file you can paste into (browser or desktop app)

## Install from source

```bash
git clone https://github.com/dynCode/HTML-to-FIGMA.git
cd HTML-to-FIGMA
npm install
npm run build
```

Then load the extension in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder from this repo
5. Pin **Free HTML to Figma** from the extensions menu

After you change code:

```bash
npm run build
```

Then click **Reload** on the extension card in `chrome://extensions`.

## Usage

1. Open any normal page (`https://`, `http://`, or localhost). Chrome internal pages like `chrome://` cannot be captured.
2. Click the extension icon.
3. (Optional) Choose viewport chips and layout mode:
   - **Auto Layout**: best for flex, grid, and many Tailwind UIs
   - **Absolute**: safer when Auto Layout looks wrong
4. Choose an action:
   - **Capture page**: whole page at the selected viewport
   - **Select element**: click one region on the page
   - **Multi-viewport paste**: capture several widths into one paste
5. Wait for the on-page progress bar to finish.
6. Switch to Figma and paste (`Cmd+V` / `Ctrl+V`).

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+F` | Capture full page |
| `Alt+Shift+E` | Select one element |

## Project structure

```text
public/          Extension manifest, popup HTML/CSS, icons
src/
  background/    Shortcuts, image proxy, window resize
  content/       Capture, prepare DOM, icons, HUD
  popup/         Extension popup UI
  shared/        Settings and message types
  shims/         Compatibility helpers
dist/            Built extension (load this in Chrome)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Typecheck and build `dist/` |
| `npm run dev` | Rebuild `dist/` on file changes |
| `npm run typecheck` | TypeScript check only |

## Privacy

- Capture runs in your browser.
- Nothing is uploaded to a project server (there is none).
- Cross-origin images may be fetched through the extension background script so CORS does not block them. Those requests go from your machine to the image host, not through a third-party conversion API.

## Limitations

HTML to Figma is hard. Expect good results on many marketing sites and app UIs, with gaps on edge cases:

- Canvas, WebGL, and complex filters may not convert cleanly
- Some exotic CSS may be approximated
- Icon fonts and CSS masks are often rasterized (image layers, not vectors)
- Very large pages can be slow to capture
- Figma paste quality also depends on fonts available in Figma

Contributions that improve fidelity are welcome at [github.com/dynCode/HTML-to-FIGMA](https://github.com/dynCode/HTML-to-FIGMA).

## Contributing

This is an open-source project. PRs and issues help a lot.

Ideas that are especially useful:

- Better image and icon fidelity
- Stacking / z-index correctness
- Layout mapping for stubborn pages
- Docs and examples
- Packaging / release automation

Suggested flow:

1. Fork [dynCode/HTML-to-FIGMA](https://github.com/dynCode/HTML-to-FIGMA)
2. Create a branch
3. Run `npm run build` and test with **Load unpacked**
4. Open a pull request with a short description of what changed and how you tested it

Report bugs: [Issues](https://github.com/dynCode/HTML-to-FIGMA/issues)

## Tech notes

- Manifest V3 Chrome extension
- DOM to Figma conversion powered by [`@figit/dom-to-figma`](https://github.com/figitdesign/web-to-figma) (MIT)
- Clipboard encoding via [`@figit/fig-kiwi`](https://github.com/figitdesign/web-to-figma) (MIT)

## License

MIT for this repository.

Converter dependencies are also MIT. This project is not affiliated with or endorsed by Figma.
