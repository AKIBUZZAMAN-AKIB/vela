// Multiple workspaces (src/workspace/workspaces.ts): the collection verbs around the
// workspace's own saved snapshots — unique naming, stepping, and the document a NEW
// workspace starts from. DOM-free; the VelaWorkspace bindings (newWorkspace /
// switchWorkspace) ride these helpers.
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_WORKSPACE_NAME,
    newWorkspaceDocument,
    stepWorkspace,
    uniqueWorkspaceName,
    workspaceNames,
    workspaceProfiles,
} from '../src/workspace/workspaces';
import { decodeState, encodeState, type WorkspaceState } from '../src/workspace/persist';

const doc: WorkspaceState = {
    version: 1,
    layout: '4',
    activeCellId: 'c2',
    timezone: 'Asia/Dhaka',
    favorites: ['trendline', 'hline'],
    timeframeFavorites: ['15', '60'],
    drawingTools: { defaults: { trendline: { style: { lineColor: '#ff8800' } } }, magnet: 'weak' },
    panels: { open: 'objects', widths: { objects: 320 } },
    trackSizes: { '4': { cols: [1.4, 0.6], rows: [1, 1] } },
    sync: { viewport: true, crosshair: true },
    charts: [
        {
            id: 'c1',
            symbol: 'BTCUSDT',
            provider: 'binance',
            timeframe: '60',
            priceStyle: 'candles',
            indicators: { natives: ['volume', 'ema'] },
            drawings: { version: 1, items: [{ type: 'trendline' }] },
        },
        { id: 'c2', symbol: 'ETHUSDT', timeframe: '15', indicators: { natives: ['rsi'] } },
        { id: 'c3', symbol: 'SOLUSDT', timeframe: '240' },
    ],
} as WorkspaceState;

describe('uniqueWorkspaceName', () => {
    it('uses the bare stem while it is free', () => {
        expect(uniqueWorkspaceName('Workspace', [])).toBe('Workspace');
        expect(uniqueWorkspaceName('Scalping', ['Swing'])).toBe('Scalping');
    });

    it('numbers from 2, because the second workspace is the first that needs a number', () => {
        expect(uniqueWorkspaceName('Workspace', ['Workspace'])).toBe('Workspace 2');
        expect(uniqueWorkspaceName('Workspace', ['Workspace', 'Workspace 2'])).toBe('Workspace 3');
    });

    it('skips over a hole rather than climbing past it', () => {
        // "Workspace 3" is taken but "Workspace 2" is free: reuse the gap.
        expect(uniqueWorkspaceName('Workspace', ['Workspace', 'Workspace 3'])).toBe('Workspace 2');
    });

    it('falls back to the default stem for a blank or whitespace name', () => {
        expect(uniqueWorkspaceName('   ', [])).toBe(DEFAULT_WORKSPACE_NAME);
        expect(uniqueWorkspaceName('', ['Workspace'])).toBe('Workspace 2');
    });

    it('never returns a name already in the collection', () => {
        const taken = ['Workspace', 'Workspace 2', 'Workspace 3', 'Workspace 4'];
        const fresh = uniqueWorkspaceName('Workspace', taken);
        expect(taken).not.toContain(fresh);
        expect(fresh).toBe('Workspace 5');
    });
});

describe('stepWorkspace', () => {
    const names = ['A', 'B', 'C'];

    it('returns null with nothing to switch to', () => {
        expect(stepWorkspace([], 'A', 1)).toBeNull();
        expect(stepWorkspace([], null, -1)).toBeNull();
    });

    it('steps forward and backward', () => {
        expect(stepWorkspace(names, 'A', 1)).toBe('B');
        expect(stepWorkspace(names, 'B', -1)).toBe('A');
    });

    it('wraps at both ends', () => {
        expect(stepWorkspace(names, 'C', 1)).toBe('A');
        expect(stepWorkspace(names, 'A', -1)).toBe('C');
    });

    it('treats an unknown current name as before-the-first, in both directions', () => {
        expect(stepWorkspace(names, 'gone', 1)).toBe('A');
        expect(stepWorkspace(names, 'gone', -1)).toBe('C');
        expect(stepWorkspace(names, null, 1)).toBe('A');
    });

    it('normalizes a delta larger than the list', () => {
        expect(stepWorkspace(names, 'A', 7)).toBe('B'); // 7 % 3 = 1
        expect(stepWorkspace(names, 'A', -7)).toBe('C'); // -7 % 3 = -1
    });

    it('is its own inverse for a single step on a multi-row list', () => {
        for (const name of names) {
            const next = stepWorkspace(names, name, 1);
            expect(stepWorkspace(names, next, -1)).toBe(name);
        }
    });
});

describe('newWorkspaceDocument', () => {
    const fresh = newWorkspaceDocument(doc);

    it('keeps one chart, on the market that was in view', () => {
        expect(fresh.charts).toHaveLength(1);
        expect(fresh.charts[0]?.symbol).toBe('BTCUSDT');
        expect(fresh.charts[0]?.provider).toBe('binance');
        expect(fresh.charts[0]?.timeframe).toBe('60');
        expect(fresh.charts[0]?.priceStyle).toBe('candles');
    });

    it('drops the content of the workspace being left behind', () => {
        const chart = fresh.charts[0]!;
        expect(chart.indicators).toBeUndefined();
        expect(chart.drawings).toBeUndefined();
        expect(fresh.trackSizes).toBeUndefined();
        expect(fresh.sync).toBeUndefined();
    });

    it('collapses the grid onto a single cell', () => {
        expect(fresh.layout).toBe('1');
        expect(fresh.activeCellId).toBe('c1');
        expect(fresh.charts[0]?.id).toBe('c1');
    });

    it('carries the trader preferences over', () => {
        expect(fresh.timezone).toBe('Asia/Dhaka');
        expect(fresh.favorites).toEqual(['trendline', 'hline']);
        expect(fresh.timeframeFavorites).toEqual(['15', '60']);
        expect(fresh.drawingTools?.magnet).toBe('weak');
        expect(fresh.panels?.widths).toEqual({ objects: 320 });
    });

    it('does not alias the source document', () => {
        fresh.favorites?.push('rectangle');
        expect(doc.favorites).toEqual(['trendline', 'hline']);
        fresh.drawingTools!.magnet = 'strong';
        expect(doc.drawingTools?.magnet).toBe('weak');
    });

    it('produces a document the codec accepts (a new workspace must survive a reload)', () => {
        const round = decodeState(encodeState(fresh));
        expect(round).not.toBeNull();
        expect(round?.layout).toBe('1');
        expect(round?.charts[0]?.symbol).toBe('BTCUSDT');
    });

    it('tolerates a source with no charts at all', () => {
        const empty = newWorkspaceDocument({ version: 1, layout: '4', charts: [] } as WorkspaceState);
        expect(empty.charts).toHaveLength(1);
        expect(empty.charts[0]?.symbol).toBeUndefined();
        expect(empty.layout).toBe('1');
    });
});

describe('workspaceProfiles', () => {
    const entries = [
        { name: 'Swing', doc, savedAt: 1000 },
        { name: 'Scalp', doc: { ...doc, charts: [doc.charts[0]!] }, savedAt: 2000 },
    ];

    it('lists every workspace in insertion order with its counts', () => {
        const rows = workspaceProfiles(entries, 'Swing', false);
        expect(rows.map((r) => r.name)).toEqual(['Swing', 'Scalp']);
        expect(rows[0]).toMatchObject({ charts: 3, indicators: 3, savedAt: 1000, active: true, dirty: false });
        expect(rows[1]).toMatchObject({ charts: 1, indicators: 2, savedAt: 2000, active: false, dirty: false });
    });

    it('marks only the ACTIVE row dirty, and only when the open document has drifted', () => {
        const drifted = workspaceProfiles(entries, 'Swing', true);
        expect(drifted[0]?.dirty).toBe(true);
        expect(drifted[1]?.dirty).toBe(false);
        // Nothing open => nothing can be dirty, whatever the flag says.
        const none = workspaceProfiles(entries, null, true);
        expect(none.every((r) => !r.dirty && !r.active)).toBe(true);
    });

    it('exposes the names the step function walks', () => {
        expect(workspaceNames(entries)).toEqual(['Swing', 'Scalp']);
        expect(stepWorkspace(workspaceNames(entries), 'Swing', 1)).toBe('Scalp');
    });
});
