import { describe, expect, it } from 'vitest';
import type { OHLCV } from '../src/core/model/ohlcv';
import type { IndicatorModel } from '../src/core/model/indicator';
import { PineEngine } from '../playground/vendor/pine-libre/index.js';

/**
 * The Pine v6 order-flow builtins (`footprint.*`, `volume_row` fields).
 *
 * The engine has no market data of its own: the HOST puts volume-at-price on the
 * bar it feeds in (`bar.footprint`). These tests pin both halves of that contract —
 * the arithmetic the script sees, and the `na` + warning a script gets when the
 * host supplies nothing.
 *
 * The ladder used throughout is small enough to verify by hand:
 *
 *     price  buy  sell
 *     100.0    3     1     total 4
 *     101.0    1     5     total 6   <- POC
 *     102.0    2     2     total 4
 *                          total 14, buy 6, sell 8, delta -2
 */

const T0 = 1_700_002_800_000;
const HOUR = 3_600_000;

const LADDER = [
    { price: 102.0, buyVolume: 2, sellVolume: 2 },
    { price: 100.0, buyVolume: 3, sellVolume: 1 },
    { price: 101.0, buyVolume: 1, sellVolume: 5 },
];

function bars(n = 20, withFootprint = true): OHLCV[] {
    return Array.from({ length: n }, (_, i) => ({
        time: T0 + i * HOUR,
        open: 100,
        high: 103,
        low: 99,
        close: 101,
        volume: 14,
        ...(withFootprint ? { footprint: { tickSize: 1, rows: LADDER } } : {}),
    })) as OHLCV[];
}

interface Run {
    last: Record<string, number | null>;
    errors: string[];
    warnings: string[];
    markers: number;
}

/** Run a script over the ladder bars and return the last value of every plot. */
async function run(body: string, withFootprint = true): Promise<Run> {
    const engine = new PineEngine();
    const source = `//@version=6\nindicator("fp", overlay=false)\n${body}\n`;
    const prepared = await engine.prepare(source, 'fp-1');
    const out: Run = { last: {}, errors: [], warnings: [], markers: 0 };
    let model: IndicatorModel | null = null;

    engine.execute(
        {
            prepared,
            market: { symbol: 'BTCUSDT', timeframe: '60', symbolInfo: { ticker: 'BTCUSDT', mintick: 1 } },
            bars: bars(20, withFootprint),
            inputs: {},
            mode: 'static',
            historyState: 'complete',
        },
        {
            onModel: (m: IndicatorModel) => {
                model = m;
            },
            onError: (e: Error) => out.errors.push(e.message),
            onWarning: (w: { message?: string }) => out.warnings.push(w?.message ?? String(w)),
        },
    );
    await new Promise((r) => setTimeout(r, 80));

    const series = (model as IndicatorModel | null)?.series ?? [];
    for (const s of series) {
        if (s.kind === 'line') out.last[s.title] = s.points?.[s.points.length - 1]?.value ?? null;
        if (s.kind === 'markers') out.markers += 1;
    }
    return out;
}

describe('footprint builtins: bar aggregates', () => {
    it('sums the rows into total, buy and sell volume', async () => {
        const r = await run(
            [
                'plot(footprint.total_volume(volume), title="total")',
                'plot(footprint.buy_volume(volume), title="buy")',
                'plot(footprint.sell_volume(volume), title="sell")',
            ].join('\n'),
        );
        expect(r.errors).toEqual([]);
        expect(r.last.total).toBe(14);
        expect(r.last.buy).toBe(6);
        expect(r.last.sell).toBe(8);
    });

    it('reports delta as buy minus sell (negative when sellers dominate)', async () => {
        const r = await run('plot(footprint.delta(volume), title="delta")');
        expect(r.last.delta).toBe(-2);
    });

    it('puts the POC at the midpoint of the busiest row', async () => {
        const r = await run('plot(footprint.poc(volume), title="poc")');
        // 101.0 is the busiest row (6 of 14) and the row spans one tick.
        expect(r.last.poc).toBe(101.5);
    });

    it('expands a 70% value area outward from the POC', async () => {
        const r = await run(
            ['plot(footprint.val(volume), title="val")', 'plot(footprint.vah(volume), title="vah")'].join('\n'),
        );
        // 70% of 14 = 9.8. The POC row (6) plus one neighbour (4) clears it, and the
        // tie between the two neighbours resolves upward.
        expect(r.last.val).toBe(101);
        expect(r.last.vah).toBe(103);
    });
});

describe('footprint builtins: rows and volume_row fields', () => {
    it('sorts rows by price regardless of the order the host supplied', async () => {
        const r = await run('rows = footprint.rows(volume)\nplot(array.size(rows), title="n")\nplot(array.get(rows, 0).down_price, title="first")');
        expect(r.last.n).toBe(3);
        // LADDER arrives 102, 100, 101; row 0 must be the 100 print.
        expect(r.last.first).toBe(100);
    });

    it('exposes every volume_row field through member access', async () => {
        const r = await run(
            [
                'rows = footprint.rows(volume)',
                'row = array.get(rows, 0)',
                'plot(row.buy_volume, title="buy")',
                'plot(row.sell_volume, title="sell")',
                'plot(row.total_volume, title="total")',
                'plot(row.delta, title="delta")',
                'plot(row.up_price, title="up")',
                'plot(row.down_price, title="down")',
            ].join('\n'),
        );
        expect(r.errors).toEqual([]);
        // Row 0 is the 100.0 print: 3 buy, 1 sell.
        expect(r.last.buy).toBe(3);
        expect(r.last.sell).toBe(1);
        expect(r.last.total).toBe(4);
        expect(r.last.delta).toBe(2);
        expect(r.last.up).toBe(101);
        expect(r.last.down).toBe(100);
    });

    it('flags an imbalance against the diagonal neighbour, not the row itself', async () => {
        // Row 1 (101) sells 5 against row 2 (102) buying 2: 5 >= 3 * 2 is false.
        const sellSide = await run(
            'rows = footprint.rows(volume)\nplot(array.get(rows, 1).has_sell_imbalance ? 1 : 0, title="x")',
        );
        expect(sellSide.last.x).toBe(0);
        // Row 0 (100) is the ladder's bottom row: no row below it, so no imbalance
        // can be established even though it buys 3 against its own 1 sell.
        const buySide = await run(
            'rows = footprint.rows(volume)\nplot(array.get(rows, 0).has_buy_imbalance ? 1 : 0, title="x")',
        );
        expect(buySide.last.x).toBe(0);
    });

    it('flags an imbalance when the diagonal genuinely dwarfs its neighbour', async () => {
        // A ladder built so row 1 buys 9 against row 0's 1 sell => 9 >= 3 is an imbalance.
        const engine = new PineEngine();
        const source = '//@version=6\nindicator("fp", overlay=false)\nrows = footprint.rows(volume)\nplot(array.get(rows, 1).has_buy_imbalance ? 1 : 0, title="x")\n';
        const prepared = await engine.prepare(source, 'fp-2');
        const ladder = [
            { price: 100, buyVolume: 1, sellVolume: 1 },
            { price: 101, buyVolume: 9, sellVolume: 1 },
        ];
        const barsWith = Array.from({ length: 20 }, (_, i) => ({
            time: T0 + i * HOUR, open: 100, high: 102, low: 99, close: 101, volume: 12,
            footprint: { tickSize: 1, rows: ladder },
        })) as OHLCV[];
        let last: number | null = null;
        engine.execute(
            { prepared, market: { symbol: 'BTCUSDT', timeframe: '60', symbolInfo: { ticker: 'BTCUSDT', mintick: 1 } }, bars: barsWith, inputs: {}, mode: 'static', historyState: 'complete' },
            { onModel: (m: IndicatorModel) => { const s = (m.series ?? []).find((x) => x.kind === 'line'); last = s?.points?.[s.points.length - 1]?.value ?? null; }, onError: () => {} },
        );
        await new Promise((r) => setTimeout(r, 80));
        expect(last).toBe(1);
    });

    it('resolves a price to the row whose band contains it', async () => {
        const r = await run('row = footprint.get_row_by_price(101.5, volume)\nplot(row.delta, title="d")');
        // 101.5 falls in the [101, 102) band => the 101 row: 1 buy - 5 sell.
        expect(r.last.d).toBe(-4);
    });
});

describe('footprint builtins: missing data', () => {
    it('yields na and warns once when the bar carries no footprint', async () => {
        const r = await run('plot(footprint.total_volume(volume), title="total")', false);
        expect(r.errors).toEqual([]);
        expect(r.last.total).toBeNull();
        expect(r.warnings.length).toBe(1);
        expect(r.warnings[0]).toContain('no footprint data');
    });

    it('yields an empty array (not na) for rows when there is no footprint', async () => {
        const r = await run('rows = footprint.rows(volume)\nplot(array.size(rows), title="n")', false);
        expect(r.last.n).toBe(0);
    });
});

describe('footprint builtins: usable in expressions', () => {
    it('drives plotshape from delta', async () => {
        const r = await run(
            'plotshape(footprint.delta(volume) > 0, title="buyers", style=shape.circle, location=location.bottom)',
        );
        expect(r.errors).toEqual([]);
        expect(r.markers).toBe(1);
    });
});
