import { APP_NAME, GITHUB_REPO_URL } from "../shared/brand";

const HOST_ID = "html2figma-hud-host";

export type HudProgress = {
  stage: string;
  message: string;
  percent: number;
  current?: number;
  total?: number;
};

type HudController = {
  show: () => void;
  hide: () => void;
  setProgress: (progress: HudProgress) => void;
  setDone: (message: string) => void;
  setError: (message: string) => void;
  onCancel: (handler: () => void) => void;
};

function ensureHost(): { host: HTMLElement; shadow: ShadowRoot } {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    Object.assign(host.style, {
      all: "initial",
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
    });
    document.documentElement.append(host);
  }

  const shadow =
    host.shadowRoot ?? host.attachShadow({ mode: "open" });
  return { host, shadow };
}

export function createHud(): HudController {
  const { host, shadow } = ensureHost();
  let cancelHandler: (() => void) | null = null;

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .card {
        width: 300px;
        font-family: "Avenir Next", "Segoe UI", system-ui, sans-serif;
        background: #1c1917;
        color: #fafaf9;
        border-radius: 14px;
        box-shadow: 0 18px 40px rgba(0,0,0,.35);
        padding: 14px;
        display: none;
        gap: 10px;
      }
      .card.visible { display: grid; }
      .title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .message {
        font-size: 12px;
        line-height: 1.4;
        color: #d6d3d1;
        min-height: 32px;
      }
      .bar {
        height: 8px;
        border-radius: 999px;
        background: #44403c;
        overflow: hidden;
      }
      .fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #0f766e, #2dd4bf);
        transition: width .2s ease;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #a8a29e;
      }
      .actions { display: flex; gap: 8px; }
      button {
        appearance: none;
        border: 0;
        border-radius: 9px;
        padding: 8px 10px;
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
      }
      .cancel { background: #44403c; color: #fafaf9; flex: 1; }
      .cancel:hover { background: #57534e; }
      .card.ok .fill { background: #22c55e; }
      .card.error .fill { background: #ef4444; }
      .card.ok .cancel, .card.error .cancel { display: none; }
      .repo {
        color: #5eead4;
        font-size: 11px;
        font-weight: 650;
        text-decoration: none;
      }
      .repo:hover { text-decoration: underline; }
    </style>
    <div class="card" part="card">
      <div class="title">${APP_NAME}</div>
      <div class="message">Starting…</div>
      <div class="bar"><div class="fill"></div></div>
      <div class="meta">
        <span class="stage">prepare</span>
        <span class="pct">0%</span>
      </div>
      <div class="actions">
        <button class="cancel" type="button">Cancel</button>
      </div>
      <a
        class="repo"
        href="${GITHUB_REPO_URL}"
        target="_blank"
        rel="noopener noreferrer"
      >Open source · github.com/dynCode/HTML-to-FIGMA</a>
    </div>
  `;

  const card = shadow.querySelector(".card") as HTMLElement;
  const messageEl = shadow.querySelector(".message") as HTMLElement;
  const fillEl = shadow.querySelector(".fill") as HTMLElement;
  const stageEl = shadow.querySelector(".stage") as HTMLElement;
  const pctEl = shadow.querySelector(".pct") as HTMLElement;
  const cancelBtn = shadow.querySelector(".cancel") as HTMLButtonElement;

  cancelBtn.addEventListener("click", () => {
    cancelHandler?.();
  });

  return {
    show() {
      card.classList.add("visible");
      card.classList.remove("ok", "error");
      cancelBtn.style.display = "";
    },
    hide() {
      card.classList.remove("visible");
      host.remove();
    },
    setProgress(progress) {
      card.classList.add("visible");
      card.classList.remove("ok", "error");
      messageEl.textContent = progress.message;
      stageEl.textContent = progress.stage;
      const pct = Math.max(0, Math.min(100, Math.round(progress.percent)));
      fillEl.style.width = `${pct}%`;
      pctEl.textContent =
        progress.total && progress.current != null
          ? `${progress.current}/${progress.total} · ${pct}%`
          : `${pct}%`;
    },
    setDone(message) {
      card.classList.add("visible", "ok");
      card.classList.remove("error");
      messageEl.textContent = message;
      stageEl.textContent = "done";
      fillEl.style.width = "100%";
      pctEl.textContent = "100%";
      window.setTimeout(() => {
        card.classList.remove("visible");
      }, 5000);
    },
    setError(message) {
      card.classList.add("visible", "error");
      card.classList.remove("ok");
      messageEl.textContent = message;
      stageEl.textContent = "error";
      fillEl.style.width = "100%";
      pctEl.textContent = "failed";
    },
    onCancel(handler) {
      cancelHandler = handler;
    },
  };
}
