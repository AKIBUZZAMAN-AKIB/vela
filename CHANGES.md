# What this fork adds

`vela` is built from `AKIBUZZAMAN-AKIB/crypto-world-ai` (a fork of Vela v0.8.4 by
LuxAlgo, Apache-2.0). Everything upstream is intact; this file records the three
things that were added, and how each one was verified.

---

## 1. Pine v6 order flow: `footprint.*` + `volume_row`

**Before:** calling `footprint.total_volume(volume)` failed with
`Undeclared identifier "footprint"`. Coverage of the official Pine v6 function
reference (`src/widget/pine-reference-data.json`, `kind === 'fun'`, 475 records) was
**453/475 = 95.4%**, and 17 of the 22 unmatched functions were the order-flow group —
`footprint.*` (9) and `volume_row.*` (8) — entirely absent. The product is positioned
on order flow, so this was the real gap, not a rounding error.

**After:** all nine `footprint.*` functions and all eight `volume_row` fields work.

| | |
| --- | --- |
| `footprint.total_volume` `buy_volume` `sell_volume` `delta` | bar aggregates over the volume-at-price ladder |
| `footprint.poc` `val` `vah` | point of control (busiest row midpoint) and the 70% value area |
| `footprint.rows` `get_row_by_price` | `array<volume_row>` / the row whose band contains a price |
| `volume_row` | `up_price` `down_price` `buy_volume` `sell_volume` `total_volume` `delta` `has_buy_imbalance` `has_sell_imbalance` |

The five remaining unmatched names are the generic doc spellings of constructors
(`array.new<type>`, `map.new<type,type>`, `matrix.new<type>`) which already work as
`array.new<float>(...)` etc. — coverage of the *reachable* API is therefore complete.

Design notes that matter:

- **The engine never invents volume.** The host supplies `bar.footprint`
  (`{ tickSize, rows: [{ price, buyVolume, sellVolume }] }`). A bar without it yields
  `na` and **one warning per call site**, because a silent `na` cannot be debugged
  from the script side.
- **Imbalance is diagonal**, `buy_volume >= 3 × sell_volume` of the row one tick
  below (mirrored above), and the ladder's edge rows report `false` — comparing a row
  against its own two sides would flag every thin edge row.
- The value area is the standard contiguous TPO expansion from the POC, so
  `val <= poc <= vah` always holds.

Docs: `docs/user/footprint.md`. Tests: `test/pine-footprint.test.ts` (12).

The builtins live in the vendored engine (`playground/vendor/pine-libre/index.js`,
`registerFootprint` + `"footprint"` in `KNOWN_NAMESPACES`). That file is a build
artifact of a separate MIT repo, refreshed by `scripts/sync-pine-engine.mjs`, so the
change is preserved as **`scripts/patches/footprint-builtins.patch`** and the sync
script now warns when local patches are waiting to be re-applied.

---

## 2. Multiple workspaces

**Before:** the shell had one open document plus a saved-layout list — save, save-as,
rename, duplicate, delete, open — reachable through a submenu. There was **no "new
workspace" verb at all** (`grep newWorkspace src/` returned nothing), so starting a
fresh workspace meant dismantling the current one by hand, and there was no way to
step between workspaces without opening a menu.

**After:** `src/workspace/workspaces.ts` + three verbs on `VelaWorkspace`:

```ts
ws.newWorkspace('Scalping');  // current workspace saved first, then a fresh one
ws.switchWorkspace(-1);       // step through the collection, wrapping at both ends
ws.workspaces();              // [{ name, charts, indicators, savedAt, active, dirty }]
```

Plus keybindings `mod+alt+n` (new), `alt+]` / `alt+[` (next/previous), registered on
the workspace's own keymap so hosts can rebind them.

Rules the implementation commits to:

- A workspace **is** the existing snapshot document — no new format, no second
  persistence path, no recursion (`saveLayout` already strips `savedLayouts`).
- Creating a workspace never destroys one: the open workspace is written back first.
- Switching writes back first too — a switch is navigation, not a discard.
- Names cannot collide: `Workspace`, `Workspace 2`, … (numbering from 2, reusing gaps).
- A new workspace keeps the trader's **preferences** (timezone, theme, favorites,
  drawing defaults, dock) and the **market in view**, and drops the previous
  workspace's content (extra charts, indicators, drawings, links, splitters).

Docs: `docs/user/workspaces.md`. Tests: `test/workspace-multi.test.ts` (21).

---

## 3. Local-run guide

`RUNNING-bn.md` (Bengali, the primary) and `RUNNING.md` (English): prerequisites,
install, playground, ports, build/typecheck/lint/test, Pine and order-flow usage,
workspaces, a troubleshooting table, and a map of the repo.

---

## Verification

| Check | Result |
| --- | --- |
| `npm test` (full Vitest suite) | **275 files passed, 1 skipped; 3291 tests passed, 74 skipped** (baseline before these changes: 273 files / 3258 tests — i.e. +2 files, +33 tests, no regressions) |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| Footprint arithmetic | hand-verified ladder (total 14, buy 6, sell 8, delta −2, POC 101.5, VAL 101, VAH 103, row delta −4 by price) |
| Workspaces end-to-end | driven in the live playground through `window.velaWorkspace`: create → `Workspace`, `Scalping`, collision → `Scalping 2`, `switchWorkspace(-1)` → `Scalping`, no page errors |
| Pine baseline (before/after) | 20/20 shipped sample scripts prepare and run with 0 errors and 0 warnings; 16/16 valid differential cases match independent references exactly (the 2 prior "failures" were invalid probe syntax) |

## Attribution

Apache-2.0, unchanged. `NOTICE` remains: the visible **Vela** mark/link must stay on
any chart surface.
