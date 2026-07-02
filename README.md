# sketches

Small web sketches by [Mike Delmonaco](https://quasarbright.github.io/portfolio/), and the shared
design system that keeps his projects cohesive.

- **`shared/cohesion.css` + `shared/cohesion.js`** — the house style ("Refined Escher"): design
  tokens, the attribution footer, an about-modal (with KaTeX), collapsible/floating control panels,
  modals, an upload dropzone, and a shared OpenRouter runtime. Imported by projects here (relative) and
  by standalone repos (absolute URL `https://quasarbright.github.io/sketches/shared/cohesion.js`).
- **`index.html`** — kitchen-sink styleguide. **`sim.html`** — fullscreen-canvas demo.
  **`cymatics/`** — a themed project showing per-project identity on top of the shared components.

Pure static (`.nojekyll`) → fast Pages deploys. Live at
<https://quasarbright.github.io/sketches/>.
