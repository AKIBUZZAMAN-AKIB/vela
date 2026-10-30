# Order flow: `footprint.*` and `volume_row` (Pine v6)

Vela's Pine engine implements the Pine v6 **order-flow** namespaces: `footprint.*`
(9 builtins) and the `volume_row` values those builtins return (8 fields). Together
they are the last 17 functions of the official v6 reference the engine was missing —
with them, coverage of the Pine v6 function set is **470/475**; the remaining five are
the generic doc spellings of constructors (`array.new<type>`, `map.new<type,type>`,
`matrix.new<type>`) that are already reachable as `array.new<float>(...)` etc.

## The data contract

The engine has no market data of its own — the host supplies each bar's
volume-at-price on the bar itself:

```ts
bar.footprint = {
    tickSize: 1,                       // price step of one row (default: symbolInfo.mintick)
    rows: [
        { price: 100.0, buyVolume: 3, sellVolume: 1 },   // price = the row's LOWER edge
        { price: 101.0, buyVolume: 1, sellVolume: 5 },
        { price: 102.0, buyVolume: 2, sellVolume: 2 },
    ],
};
```

Rows may arrive in any order — the engine sorts them by price. A bar with no
`footprint` (or an empty `rows` array) is not an error: every `footprint.*` call
returns `na` and the engine emits **one warning per call site**, because a silent
`na` is impossible to debug from the script side.

## The functions

| Function | Returns | Definition |
| --- | --- | --- |
| `footprint.total_volume(src)` | `float` | Sum of every row's buy + sell volume. |
| `footprint.buy_volume(src)` | `float` | Sum of the rows' buy volume (trades at the ask). |
| `footprint.sell_volume(src)` | `float` | Sum of the rows' sell volume (trades at the bid). |
| `footprint.delta(src)` | `float` | `buy_volume - sell_volume`; negative when sellers dominate. |
| `footprint.poc(src)` | `float` | Point of control — the **midpoint** of the busiest row (`price + tickSize / 2`). Ties resolve to the lowest price, so the value is stable across runs. |
| `footprint.val(src)` | `float` | Value-area low: the lower edge of the lowest row in the 70% area. |
| `footprint.vah(src)` | `float` | Value-area high: the upper edge of the highest row in the 70% area. |
| `footprint.rows(src)` | `array<volume_row>` | Every row, price-ascending. Empty (not `na`) when the bar has no footprint. |
| `footprint.get_row_by_price(price, src)` | `volume_row` | The row whose `[down_price, up_price)` band contains `price`; the top row also owns everything above it. |

### Value area

The value area starts at the POC row and repeatedly absorbs the heavier of its two
neighbours until 70% of the bar's volume is inside — the standard TPO expansion. It
is a single contiguous band by construction, so `val <= poc <= vah` always holds.

### `volume_row` fields

| Field | Meaning |
| --- | --- |
| `up_price` | The row's upper edge (`price + tickSize`). |
| `down_price` | The row's lower edge (`price`). |
| `buy_volume` / `sell_volume` / `total_volume` | The row's own volumes. |
| `delta` | `buy_volume - sell_volume` for this row. |
| `has_buy_imbalance` | `buy_volume >= 3 × sell_volume` of the row **one tick below**. |
| `has_sell_imbalance` | `sell_volume >= 3 × buy_volume` of the row **one tick above**. |

Imbalance is the diagonal read footprint traders use, not a row-against-itself
comparison. The ladder's **edge rows have no diagonal neighbour**, so they cannot
establish an imbalance and report `false` — the alternative (comparing a row to its
own two sides) flags every thin edge row and is useless in practice.

## A working script

```pine
//@version=6
indicator("Footprint delta", overlay=false)

delta = footprint.delta(volume)
plot(delta, "Delta", color = delta >= 0 ? color.teal : color.red, style = plot.style_columns)

// The busiest row of the current bar, and whether it is absorbed on the bid.
row = footprint.get_row_by_price(footprint.poc(volume), volume)
plotchar(row.has_sell_imbalance, "POC absorbed", "▲", location.bottom,
     color = color.orange, size = size.tiny)
```

```pine
//@version=6
indicator("Value area width", overlay=false)

width = footprint.vah(volume) - footprint.val(volume)
plot(width, "VA width")
plot(footprint.delta(volume) > 0 and close > footprint.poc(volume) ? width : na,
     "Accepted above POC", color = color.green, style = plot.style_area)
```

## Where the numbers come from

`footprint.*` reads only what the host puts on the bar. Vela's own volume-profile
machinery (`src/core/volume-profile/`) computes profiles from the trade feed; a host
that wants real order flow feeds those rows through `bar.footprint`. The engine
never invents volume: a bar without rows is `na`, not a guess.

## Implementation note (vendored engine)

The builtins live in `playground/vendor/pine-libre/index.js`
(`registerFootprint`, plus `"footprint"` added to `KNOWN_NAMESPACES` — without that
entry the parser rejects the namespace as an undeclared identifier). That file is a
build artifact of a separate MIT-licensed repository, refreshed by
`scripts/sync-pine-engine.mjs`, so the change is kept as a patch:
**`scripts/patches/footprint-builtins.patch`**. Re-apply it after any re-sync:

```bash
git apply scripts/patches/footprint-builtins.patch
npx vitest run test/pine-footprint.test.ts
```

Tests: `test/pine-footprint.test.ts` (12 cases) pins the arithmetic, the row fields,
the imbalance edges, and the `na` + warning path.
