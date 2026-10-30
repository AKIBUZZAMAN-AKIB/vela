# Multiple workspaces

A **workspace** in Vela is a named document: the grid, every chart in it, its market,
its indicators and drawings, its links and its dock. Vela keeps a *collection* of them,
so the same browser can hold a swing workspace on the 4h and a scalping workspace on
the 1m without either one overwriting the other.

Everything below rides the workspace's own snapshot format — a workspace is not a new
type, it is the same document the shell already saves, with a name and a collection
around it.

## From the API

```ts
const ws = new VelaWorkspace('#chart', { layout: '4' });

ws.newWorkspace();            // -> "Workspace"   (a fresh one, current one saved first)
ws.newWorkspace('Scalping');  // -> "Scalping"
ws.newWorkspace('Scalping');  // -> "Scalping 2" — a name never collides
ws.workspaces();              // -> [{ name, charts, indicators, savedAt, active, dirty }, …]
ws.switchWorkspace(-1);       // -> the previous workspace (wraps at both ends)
ws.switchWorkspace(1);        // -> the next one
```

The existing single-workspace verbs keep working unchanged — `saveLayout`,
`openLayout`, `duplicateLayout`, `renameLayout`, `deleteLayout`, `saveActiveLayout` —
because a workspace *is* a saved layout. `newWorkspace` / `switchWorkspace` are the
collection layer on top.

## From the keyboard

| Chord | Action |
| --- | --- |
| <kbd>Ctrl/⌘</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd> | Start a new workspace |
| <kbd>Alt</kbd> + <kbd>]</kbd> | Next workspace |
| <kbd>Alt</kbd> + <kbd>[</kbd> | Previous workspace |

All three are ordinary keymap bindings (`workspace.new`, `workspace.next`,
`workspace.previous`), so a host can rebind or remove them through the same
`ws.keymap` every other shortcut uses, and they appear in the shortcuts help panel
under **Layout**.

## What a new workspace inherits

Creating a workspace never destroys one: if something is open, it is written back
first. The new workspace is then a fresh document that keeps what belongs to *the
trader* and drops what belongs to *the workspace being left*.

| Kept | Dropped |
| --- | --- |
| Timezone, theme and the rest of the renderer prefs | Every extra chart (the grid collapses to one) |
| Favorites and timeframe favorites | Every indicator |
| Drawing-tool defaults and the magnet setting | Every drawing |
| The dock and its panel widths | Viewport/symbol/crosshair links |
| The market that was in view (symbol, provider, timeframe, price style) | Per-grid splitter sizes |

Keeping the symbol is deliberate: a new workspace that boots on a different market
than the one on screen reads as a bug, not as a reset.

Switching workspaces writes the open one back before leaving it — a switch is
navigation, not a discard.

## Where the collection lives

The collection is part of the document (`savedLayouts`, `layoutPrefs`, `layoutMeta`)
and persists through the same storage adapter as everything else, so a reload — or a
different tab on the same machine — opens the collection intact. Snapshots never nest
themselves: `saveLayout` strips `savedLayouts`/`layoutPrefs` from the captured
document, so a workspace cannot contain the list of workspaces (that recursion grows
geometrically and dies on `JSON.stringify`).

## Tests

- `test/workspace-multi.test.ts` — naming, stepping/wrapping, inheritance, codec
  round-trip of a fresh workspace.
- The verbs themselves are exercised end to end in the browser playground
  (`playground/workspace.ts` exposes `window.velaWorkspace`).
