/* cohesion.js — Mike's house style behavioral layer.
 * ES module. Import: <script type="module" src="/sketches/shared/cohesion.js"></script>
 * Also attaches a `cohesion` global for non-module pages.
 *
 * Provides:
 *   web components  <mike-footer> <about-modal> <openrouter-key>
 *   AI runtime      getOpenRouterKey / setOpenRouterKey / clearOpenRouterKey /
 *                   requireOpenRouterKey / openrouterChat
 *   helpers         isBackground()
 * Conventions handled automatically on load: ?api-key ingest+strip, ?background chrome-hiding.
 */

const PORTFOLIO_URL = "https://quasarbright.github.io/portfolio/";
const KEY_STORAGE = "quasarbright:openrouter-key";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/* ------------------------------------------------------------------ *
 * load-time conventions
 * ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search);

export function isBackground() { return params.has("background"); }

// ?api-key=… : store it, then strip from the URL (keep other params) so it
// doesn't linger in the address bar / history when sharing pre-keyed links.
(function ingestApiKey() {
  const k = params.get("api-key");
  if (!k) return;
  setOpenRouterKey(k);
  params.delete("api-key");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
})();

// ?background : mark the document so chrome (footer, panels) can hide itself.
if (isBackground()) document.documentElement.setAttribute("data-background", "");

/* ------------------------------------------------------------------ *
 * OpenRouter key storage (shared across all quasarbright.github.io projects)
 * ------------------------------------------------------------------ */

export function getOpenRouterKey() { return localStorage.getItem(KEY_STORAGE) || null; }
export function setOpenRouterKey(k) {
  if (k) localStorage.setItem(KEY_STORAGE, k.trim());
  document.dispatchEvent(new CustomEvent("openrouter-key-change", { detail: { key: getOpenRouterKey() } }));
}
export function clearOpenRouterKey() {
  localStorage.removeItem(KEY_STORAGE);
  document.dispatchEvent(new CustomEvent("openrouter-key-change", { detail: { key: null } }));
}

// Resolve once a key exists; if missing, pop a modal asking for it.
// First-time visitors are prompted once on their first project, then never again site-wide.
export function requireOpenRouterKey() {
  return new Promise((resolve) => {
    const existing = getOpenRouterKey();
    if (existing) return resolve(existing);
    let done = false;
    const { el, close } = openModal(`
      <h2 class="title" style="font-size:1.2rem;margin-bottom:12px">OpenRouter API key</h2>
      <openrouter-key></openrouter-key>
      <div class="btn-row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn btn-primary" data-save>Save</button>
      </div>`, {
      className: "cohesion-keymodal",
      onClose: () => { if (!done) { done = true; resolve(getOpenRouterKey()); } },
    });
    el.querySelector("[data-save]").addEventListener("click", () => {
      const key = getOpenRouterKey();
      if (!key) return;
      done = true; close(); resolve(key);
    });
  });
}

/* ------------------------------------------------------------------ *
 * openrouterChat — the shared request wrapper.
 *   await openrouterChat({ model, messages })                  -> { content, raw }
 *   await openrouterChat({ model, messages, onToken: t=>… })   -> streams, returns final { content }
 * Injects auth + attribution headers, recovers from a bad key (401 -> reprompt -> retry once).
 * `model` and all other params stay caller-controlled (model is per-project).
 * ------------------------------------------------------------------ */

export async function openrouterChat(opts, _retried = false) {
  const { model, messages, onToken, signal, ...rest } = opts;
  const key = await requireOpenRouterKey();
  if (!key) throw new Error("An OpenRouter API key is required.");
  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "HTTP-Referer": PORTFOLIO_URL,          // OpenRouter attribution
      "X-Title": document.title || "quasarbright",
    },
    body: JSON.stringify({ model, messages, stream: !!onToken, ...rest }),
  });

  if (res.status === 401) {
    clearOpenRouterKey();                      // bad/expired key
    if (_retried) throw new Error("OpenRouter rejected the API key.");
    return openrouterChat(opts, true);         // reprompt + retry once
  }
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  if (!onToken) {
    const raw = await res.json();
    return { content: raw.choices?.[0]?.message?.content ?? "", raw };
  }

  // streaming (SSE)
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let content = "", buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const m = line.trim();
      if (!m.startsWith("data:")) continue;
      const data = m.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const tok = JSON.parse(data).choices?.[0]?.delta?.content;
        if (tok) { content += tok; onToken(tok, content); }
      } catch { /* keep-alive / partial frame */ }
    }
  }
  return { content };
}

/* ------------------------------------------------------------------ *
 * openModal — shared modal shell. Every modal gets an X (top-right),
 * Esc-to-close, and backdrop-click-to-close.
 *   const { el, close } = openModal(html, { className, onClose });
 * `el` is the content container (query it to wire buttons / render math).
 * ------------------------------------------------------------------ */
export function openModal(html, { className = "", onClose } = {}) {
  const back = document.createElement("div");
  back.className = "cohesion-modal-backdrop";
  back.innerHTML =
    `<div class="panel cohesion-modal ${className}">` +
      `<button class="cohesion-modal-close" aria-label="Close" title="Close">&times;</button>` +
      `<div class="cohesion-modal-content">${html}</div>` +
    `</div>`;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    back.remove();
    document.removeEventListener("keydown", onKey);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  back.querySelector(".cohesion-modal-close").addEventListener("click", close);
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(back);
  return { el: back.querySelector(".cohesion-modal-content"), backdrop: back, close };
}

/* ------------------------------------------------------------------ *
 * web components
 * ------------------------------------------------------------------ */

// <control-panel title="Controls" floating collapsed>  slotted children = the controls
//   floating   → fixed top-right, semitransparent + blurred (for over a canvas)
//   collapsed  → start collapsed
// Header click toggles collapse. Hidden under ?background.
class ControlPanel extends HTMLElement {
  connectedCallback() {
    if (this._init) return; this._init = true;
    if (isBackground()) { this.remove(); return; }
    const title = this.getAttribute("title") || "Controls";
    const body = document.createElement("div");
    body.className = "panel-body";
    while (this.firstChild) body.appendChild(this.firstChild);
    const header = document.createElement("div");
    header.className = "panel-header";
    header.innerHTML = `<span class="panel-title"></span><span class="panel-toggle">&#9662;</span>`;
    header.querySelector(".panel-title").textContent = title;
    this.classList.add("control-panel");
    if (this.hasAttribute("floating")) this.classList.add("floating");
    this.append(header, body);
    header.addEventListener("click", () => this.toggleAttribute("collapsed"));
  }
}

// <mike-footer>            normal footer at the bottom of content
// <mike-footer overlay>    subtle bottom-pinned overlay for fullscreen/canvas pages
// Hidden automatically under ?background.
class MikeFooter extends HTMLElement {
  connectedCallback() {
    if (isBackground()) { this.remove(); return; }
    const overlay = this.hasAttribute("overlay");
    this.innerHTML =
      `Made with <span style="color:var(--danger)">&hearts;</span> by ` +
      `<a href="${PORTFOLIO_URL}">Mike Delmonaco</a>`;
    Object.assign(this.style, {
      display: "block", textAlign: "center", color: "var(--muted)",
      fontSize: ".85rem", padding: "16px",
    });
    if (overlay) Object.assign(this.style, {
      position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "4",
      pointerEvents: "none", padding: "8px", opacity: ".7",
    });
    // keep the link clickable even when the overlay ignores pointer events
    const a = this.querySelector("a");
    if (overlay && a) a.style.pointerEvents = "auto";
  }
}

// <about-modal label="about">   slotted children = the about content (prose + math)
// Renders a trigger button; opens a dimmed dialog. KaTeX is loaded lazily for $…$ math.
class AboutModal extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute("label") || "about";
    const content = this.innerHTML;
    this.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "btn"; btn.textContent = label;
    btn.addEventListener("click", () => this._open(content));
    this.appendChild(btn);
    if (isBackground()) btn.style.display = "none";
  }
  _open(content) {
    const { el } = openModal(content, { className: "cohesion-about" });
    renderMath(el);
  }
}

// <openrouter-key>   the standard shared key field (password + helper + Remove)
class OpenRouterKey extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <label class="muted" style="display:block;margin-bottom:6px">OpenRouter API key</label>
      <input type="password" autocomplete="off" placeholder="sk-or-…" />
      <p class="muted" style="font-size:.8rem;margin:.5em 0">
        Stored only in your browser — never sent anywhere except OpenRouter.
        Create one at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>.
      </p>
      <button class="btn btn-danger" type="button" data-remove>Remove</button>`;
    const input = this.querySelector("input");
    const remove = this.querySelector("[data-remove]");
    const sync = () => {
      const k = getOpenRouterKey();
      input.value = k || "";
      remove.style.display = k ? "" : "none";
    };
    input.addEventListener("change", () => setOpenRouterKey(input.value));
    input.addEventListener("blur", () => setOpenRouterKey(input.value));
    remove.addEventListener("click", () => { clearOpenRouterKey(); sync(); });
    document.addEventListener("openrouter-key-change", sync);
    sync();
  }
}

customElements.define("mike-footer", MikeFooter);
customElements.define("about-modal", AboutModal);
customElements.define("openrouter-key", OpenRouterKey);
customElements.define("control-panel", ControlPanel);

/* ------------------------------------------------------------------ *
 * KaTeX lazy-loader (for about-modal math)
 * ------------------------------------------------------------------ */
let katexPromise = null;
function loadKatex() {
  if (katexPromise) return katexPromise;
  katexPromise = new Promise((resolve) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css";
    document.head.appendChild(css);
    const s1 = document.createElement("script");
    s1.src = "https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js";
      s2.onload = resolve;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });
  return katexPromise;
}
function renderMath(el) {
  if (!el || !/[\$\\]/.test(el.textContent)) return; // no math, skip
  loadKatex().then(() => window.renderMathInElement?.(el, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false },
      { left: "\\[", right: "\\]", display: true },
    ],
    throwOnError: false,
  }));
}

/* ------------------------------------------------------------------ *
 * modal styling (injected so projects don't have to copy it)
 * ------------------------------------------------------------------ */
const style = document.createElement("style");
style.textContent = `
  .cohesion-modal-backdrop {
    position: fixed; inset: 0; z-index: 50; display: grid; place-items: center;
    background: rgba(6,7,12,.7); padding: 20px;
  }
  .cohesion-modal {
    position: relative; max-height: 85vh; overflow: auto;
    box-shadow: var(--shadow); padding-right: 40px;
  }
  .cohesion-modal-close {
    position: absolute; top: 8px; right: 10px; z-index: 1;
    background: none; border: none; cursor: pointer;
    color: var(--muted); font-size: 1.5rem; line-height: 1; padding: 4px 8px;
    border-radius: var(--radius-sm);
  }
  .cohesion-modal-close:hover { color: var(--text); background: var(--panel-2); }
  .cohesion-about { max-width: 720px; }
  .cohesion-about .section-label { margin-top: 1.25em; }
`;
document.head.appendChild(style);

/* ------------------------------------------------------------------ *
 * non-module convenience global
 * ------------------------------------------------------------------ */
const cohesion = {
  isBackground, openModal, getOpenRouterKey, setOpenRouterKey, clearOpenRouterKey,
  requireOpenRouterKey, openrouterChat,
};
if (typeof window !== "undefined") window.cohesion = cohesion;
export default cohesion;
