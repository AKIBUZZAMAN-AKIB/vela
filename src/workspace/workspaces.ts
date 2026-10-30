// Multiple named workspaces — the collection layer over the workspace's own
// "saved layout" snapshots.
//
// A workspace snapshot already carries EVERYTHING a workspace is: the grid, every
// chart's market, indicators, drawings, links, dock state. What was missing is the
// collection verbs a trader expects around it — start a NEW one without losing the
// open one, step to the next/previous one, and a name that cannot collide. This
// module holds the pure parts so they are testable without a DOM; `VelaWorkspace`
// binds them to its snapshot map.
//
// Vocabulary: a WORKSPACE is a named snapshot. The first one a user saves is their
// workspace; the tenth is their "scalping 1m" workspace. There is no separate type —
// reusing the snapshot keeps one format, one codec, one persistence path.
import type { WorkspaceState } from './persist';

/** One row of the workspace switcher. */
export interface WorkspaceProfile {
    name: string;
    /** Charts in the snapshot. */
    charts: number;
    /** Native indicators across those charts. */
    indicators: number;
    /** Epoch ms of the last write, when known. */
    savedAt?: number;
    /** True for the workspace currently open. */
    active: boolean;
    /** True when the open workspace has drifted from its snapshot. */
    dirty: boolean;
}

/** The name a fresh workspace gets when the caller does not supply one. */
export const DEFAULT_WORKSPACE_NAME = 'Workspace';

/**
 * A name no snapshot in `taken` uses: `Workspace`, then `Workspace 2`, `Workspace 3`…
 *
 * Numbering starts at 2 because the second workspace is the first one that needs a
 * number — a list showing `Workspace` + `Workspace 1` reads like an off-by-one bug.
 */
export function uniqueWorkspaceName(base: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    const stem = base.trim() || DEFAULT_WORKSPACE_NAME;
    if (!used.has(stem)) return stem;
    for (let n = 2; ; n += 1) {
        const candidate = `${stem} ${n}`;
        if (!used.has(candidate)) return candidate;
    }
}

/**
 * Step through workspace names, wrapping at both ends. `current` may name a snapshot
 * that no longer exists (a delete raced a shortcut) — that reads as "before the
 * first", so a step forward lands on the first row instead of throwing.
 *
 * Returns null only when the list is empty.
 */
export function stepWorkspace(names: readonly string[], current: string | null, delta: number): string | null {
    const first = names[0];
    const last = names[names.length - 1];
    if (first === undefined || last === undefined) return null;
    const at = current === null ? -1 : names.indexOf(current);
    if (at < 0) return delta >= 0 ? first : last;
    const next = (at + (delta % names.length) + names.length) % names.length;
    return names[next] ?? null;
}

/**
 * The document a NEW workspace starts from: the open one, reduced to what belongs to
 * the TRADER rather than to the chart they were looking at.
 *
 * Kept (preferences that follow the person): timezone, theme and the rest of the
 * renderer config, favorites, timeframe favorites, drawing defaults, the dock, and
 * the panel widths. Dropped (content of the workspace being left behind): every extra
 * chart, every indicator, every drawing, the links and the per-grid splitters.
 *
 * The single surviving chart keeps the market that was in view — a new workspace that
 * boots on a different symbol than the one on screen feels like a bug, not a reset.
 */
export function newWorkspaceDocument(from: WorkspaceState): WorkspaceState {
    const source = from.charts?.[0];
    const chart: WorkspaceState['charts'][number] = { id: 'c1' } as WorkspaceState['charts'][number];
    if (source?.symbol) chart.symbol = source.symbol;
    if (source?.provider) chart.provider = source.provider;
    if (source?.timeframe) chart.timeframe = source.timeframe;
    if (source?.priceStyle) chart.priceStyle = source.priceStyle;

    return {
        version: from.version,
        layout: '1',
        activeCellId: 'c1',
        timezone: from.timezone,
        favorites: from.favorites ? [...from.favorites] : undefined,
        timeframeFavorites: from.timeframeFavorites ? [...from.timeframeFavorites] : undefined,
        drawingTools: from.drawingTools ? structuredClone(from.drawingTools) : undefined,
        panels: from.panels ? structuredClone(from.panels) : undefined,
        charts: [chart],
    } as WorkspaceState;
}

/**
 * The switcher's rows: every snapshot, with the ACTIVE one flagged, in insertion
 * order (the snapshot map's order is the user's order — a rename rebuilds it so rows
 * never jump).
 */
export function workspaceProfiles(
    entries: Iterable<{ name: string; doc: WorkspaceState; savedAt?: number }>,
    active: string | null,
    dirty: boolean,
): WorkspaceProfile[] {
    const rows: WorkspaceProfile[] = [];
    for (const entry of entries) {
        const cells = entry.doc.charts ?? [];
        rows.push({
            name: entry.name,
            charts: cells.length,
            indicators: cells.reduce((n, c) => n + (c.indicators?.natives?.length ?? 0), 0),
            savedAt: entry.savedAt,
            active: entry.name === active,
            dirty: entry.name === active && dirty,
        });
    }
    return rows;
}

/** Snapshot names in insertion order — the order the switcher and the steps use. */
export function workspaceNames(entries: Iterable<{ name: string }>): string[] {
    return [...entries].map((e) => e.name);
}
