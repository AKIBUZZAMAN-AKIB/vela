# Running Vela locally

The complete local-run guide. A Bengali version is in [RUNNING-bn.md](RUNNING-bn.md).

## Requirements

- **Node.js 20 LTS or newer** (`node -v`), npm 10+
- **Git**
- A modern browser with WebGL2 (Chrome, Edge, Firefox, Safari 16+)

## Install

```bash
git clone https://github.com/<your-username>/vela.git
cd vela
npm install          # runs `prepare` → builds dist/
```

`npm install` runs `tools/build-package.mjs` for you, so `dist/` exists after install. There is no separate first build.

## Run the app

```bash
npm run playground
# ➜ http://localhost:5190/
```

| Page | What it is |
| --- | --- |
| `/workspace.html` | The full app: multi-chart grid, topbar, indicators, drawings |
| `/` | Landing page with every demo |
| `/offline.html` | Runs with no network access |

Port 5190 is fixed (`strictPort`). If it is taken: `npx vite --port 5191`.

## Build, typecheck, lint, test

```bash
npm run build        # ESM + .d.ts into dist/
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # full Vitest suite (~5 min)
npm run test:browser # Playwright suites (npx playwright install chromium first)
```

Focused runs:

```bash
npx vitest run test/pine-footprint.test.ts    # the order-flow builtins
npx vitest run test/workspace-multi.test.ts   # multiple workspaces
```

## Use it in your own app

```ts
import { VelaWorkspace } from '@luxalgo/vela/workspace';

const ws = new VelaWorkspace('#chart', {
    layout: '4',
    symbol: 'BTCUSDT',
    timeframe: '60',
    persist: true,
});
```

See `docs/user/` — `api-reference.md`, `workspace.md`, `options.md`, `data-providers.md`.

## Pine Script

The repo vendors an MIT-licensed reference engine at `playground/vendor/pine-libre/`
and 20 sample v6 scripts in `playground/pine-scripts.ts`.

### Order flow (`footprint.*`)

The nine `footprint.*` builtins and the eight `volume_row` fields are implemented
(`docs/user/footprint.md`). The engine never invents volume — the host puts it on
the bar:

```ts
const bars = raw.map((b) => ({
    ...b,
    footprint: { tickSize: 1, rows: [{ price: 100, buyVolume: 3, sellVolume: 1 }] },
}));
```

Without `bar.footprint` every call is `na` plus one warning.

```pine
//@version=6
indicator("Footprint delta", overlay=false)
plot(footprint.delta(volume), "Delta", style = plot.style_columns)
```

## Multiple workspaces

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl/⌘</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> | New workspace |
| <kbd>Alt</kbd>+<kbd>]</kbd> / <kbd>Alt</kbd>+<kbd>[</kbd> | Next / previous workspace |

```ts
ws.newWorkspace('Scalping');   // -> 'Scalping', then 'Scalping 2', never a collision
ws.workspaces();               // [{ name, charts, indicators, savedAt, active, dirty }]
ws.switchWorkspace(1);
```

`docs/user/workspaces.md` has the inheritance rules and where the collection persists.
The playground exposes the shell for poking at it: `window.velaWorkspace`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Empty chart, `api.binance.com` CORS errors | Network/adblocker blocks the exchange API; try another network, or use `/offline.html`. |
| `EADDRINUSE: 5190` | `npx vite --port 5191` |
| `Undeclared identifier "footprint"` | The vendored engine was re-synced: `git apply scripts/patches/footprint-builtins.patch` |
| Missing `dist/` | `npm run build` |
| `structuredClone is not defined` | Node < 17; upgrade to Node 20 LTS |
| Type errors inside `@types/chai` | You ran `tsc` on a single file; use `npm run typecheck` |
| No indicators in the playground | The Pine engine addon is not imported; check `playground/vendor/pine-libre` |

## Layout of the repo

```
src/workspace/       multi-chart shell (VelaWorkspace, layouts, persist, sync, workspaces)
src/core/            chart core, indicators, volume profile
src/renderers/       WebGL2 + Canvas2D renderers
src/data/providers/  binance / coinbase / hyperliquid
src/widget/          topbar, side panel, object tree, Pine reference data
playground/          demos + the vendored Pine engine
scripts/             build, sync-pine-engine, patches/
test/                Vitest + browser suites
docs/                user and architecture docs
```

## Attribution

Apache-2.0. `NOTICE` is binding: keep the visible **Vela** mark/link on any chart surface.
