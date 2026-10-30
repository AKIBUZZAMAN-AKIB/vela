# লোকালি চালানোর সম্পূর্ণ গাইড (বাংলা) — Vela / crypto-world-ai

এই ডকুমেন্টে ধাপে ধাপে বলা আছে কীভাবে এই রিপোটি নিজের কম্পিউটারে চালাবেন — চার্ট চালু করা, Pine Script চালানো, নতুন **footprint (order flow)** ফিচার আর **multiple workspace** ব্যবহার করা, টেস্ট চালানো এবং সমস্যা হলে কী করবেন।

---

## ১. যা যা লাগবে (Prerequisites)

| জিনিস | ভার্সন | কেন দরকার |
| --- | --- | --- |
| **Node.js** | **২০ বা তার উপরে** (LTS) | Vite, Vitest, TypeScript সব Node-এ চলে |
| **npm** | ১০+ (Node-এর সাথে আসে) | প্যাকেজ ইনস্টল |
| **Git** | যেকোনো আধুনিক ভার্সন | রিপো ক্লোন |
| **ব্রাউজার** | Chrome / Edge / Firefox (সর্বশেষ) | WebGL2 + Canvas2D রেন্ডারার |

ভার্সন চেক করুন:

```bash
node -v     # v20.x বা বেশি
npm -v
git --version
```

> **Node ১৮ বা তার নিচে** থাকলে `structuredClone`, আধুনিক Vite ইত্যাদি ফিচারে এরর আসবে — Node ২০ LTS ইনস্টল করে নিন ([nodejs.org](https://nodejs.org))।

---

## ২. প্রজেক্ট নামিয়ে নিন

```bash
git clone https://github.com/<আপনার-ইউজারনেম>/vela.git
cd vela
```

এরপর ডিপেন্ডেন্সি ইনস্টল:

```bash
npm install
```

`npm install` চলাকালীন স্বয়ংক্রিয়ভাবে `prepare` স্ক্রিপ্ট চলে (`node tools/build-package.mjs`) এবং `dist/` তৈরি হয় — অর্থাৎ আলাদা করে `npm run build` করার দরকার নেই।

---

## ৩. সবচেয়ে দ্রুত চালু: Playground

```bash
npm run playground
```

টার্মিনালে এমন কিছু দেখবেন:

```
  VITE v7.x  ready in 300 ms
  ➜  Local:   http://localhost:5190/
```

ব্রাউজারে খুলুন: **http://localhost:5190/**

| পেজ | কী দেখাবে |
| --- | --- |
| `/` | ল্যান্ডিং পেজ (সব ডেমোর লিংক) |
| `/workspace.html` | **মূল অ্যাপ** — ৪-চার্ট গ্রিড, টপবার, ইন্ডিকেটর, ড্রয়িং |
| `/index.html` বা ডেমো পেজগুলো | একক চার্ট (single chart) উদাহরণ |
| `/offline.html` | নেটওয়ার্ক ছাড়া চালানোর জন্য ডেমো |

> `/workspace.html` খোলার পর যদি চার্টে ক্যান্ডেল না আসে, সেকশন ৮ (সমস্যা সমাধান) দেখুন — সাধারণত Binance-এ CORS/নেটওয়ার্ক ব্লক থাকে।

Playground বন্ধ করতে টার্মিনালে <kbd>Ctrl</kbd>+<kbd>C</kbd>।

---

## ৪. প্রোডাকশন বিল্ড

```bash
npm run build
```

এতে `dist/` (ESM + `.d.ts` টাইপ) তৈরি হয় — এটাই আপনার অ্যাপে `@luxalgo/vela` হিসেবে ইমপোর্ট করবেন।

```bash
npm run typecheck    # টাইপ চেক
npm run lint         # ESLint
```

---

## ৫. নিজের অ্যাপে ব্যবহার (সংক্ষেপে)

```ts
import { VelaWorkspace } from '@luxalgo/vela/workspace';

const ws = new VelaWorkspace('#chart', {
    layout: '4',            // গ্রিড: '1', '2', '4', '6', '8' … অথবা 'g3x3'
    symbol: 'BTCUSDT',
    timeframe: '60',
    persist: true,          // localStorage-এ সেভ
});
```

সম্পূর্ণ API: `docs/user/api-reference.md`, `docs/user/workspace.md`, `docs/user/options.md`।

---

## ৬. Pine Script চালানো

Vela নিজে কোনো স্ক্রিপ্ট-ইঞ্জিন বান্ডল করে না — পোর্টটা ডিফাইন করে, আর এই রিপোতে MIT লাইসেন্সের একটি রেফারেন্স ইঞ্জিন vendored আছে (`playground/vendor/pine-libre/`)।

- Playground-এ ইন্ডিকেটর প্যানেল থেকে **Pine Script** এডিটর খুলে স্ক্রিপ্ট লিখে **Add to chart** চাপুন।
- ২০টি রেডিমেড v6 উদাহরণ আছে `playground/pine-scripts.ts` ফাইলে (`PINE_SCRIPTS`)।

### নতুন: order-flow (`footprint.*`)

আগে `footprint.total_volume` লিখলে এরর আসত: `Undeclared identifier "footprint"`। এখন v6-এর **৯টি footprint ফাংশন** আর **`volume_row`-এর ৮টি ফিল্ড** কাজ করে:

```pine
//@version=6
indicator("Footprint delta", overlay=false)
delta = footprint.delta(volume)
plot(delta, "Delta", color = delta >= 0 ? color.teal : color.red, style = plot.style_columns)
```

গুরুত্বপূর্ণ: ইঞ্জিন নিজে থেকে ভলিউম বানায় না। **হোস্টকে** প্রতিটি বারে ভলিউম-অ্যাট-প্রাইস দিতে হবে:

```ts
const bars = rawBars.map((b) => ({
    ...b,
    footprint: {
        tickSize: 1,                       // প্রতি রো-এর প্রাইস স্টেপ
        rows: [
            { price: 100.0, buyVolume: 3, sellVolume: 1 },   // price = রো-এর নিচের প্রান্ত
            { price: 101.0, buyVolume: 1, sellVolume: 5 },
        ],
    },
}));
```

`footprint` না দিলে প্রতিটি কল `na` ফেরাবে এবং **একবার** ওয়ার্নিং দেবে — চুপচাপ `na` নয়, যাতে ডিবাগ করা যায়।

সব ফাংশন, ভ্যালু-এরিয়া ও imbalance-এর নিয়ম: **`docs/user/footprint.md`**।

---

## ৭. Multiple workspace (একাধিক ওয়ার্কস্পেস)

একই ব্রাউজারে অনেকগুলো নামকরা ওয়ার্কস্পেস রাখতে পারবেন — যেমন `Swing 4h`, `Scalping 1m` — একটির কাজ অন্যটা মুছে ফেলবে না।

**কীবোর্ড:**

| শর্টকাট | কাজ |
| --- | --- |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd> | নতুন ওয়ার্কস্পেস |
| <kbd>Alt</kbd> + <kbd>]</kbd> | পরের ওয়ার্কস্পেস |
| <kbd>Alt</kbd> + <kbd>[</kbd> | আগের ওয়ার্কস্পেস |

**কোড থেকে:**

```ts
ws.newWorkspace();            // -> "Workspace"
ws.newWorkspace('Scalping');  // -> "Scalping"
ws.newWorkspace('Scalping');  // -> "Scalping 2"  (নাম কখনো ক্ল্যাশ করবে না)
ws.workspaces();              // [{ name, charts, indicators, savedAt, active, dirty }, …]
ws.switchWorkspace(-1);       // আগেরটায় যান (শেষ থেকে প্রথমে wrap করে)
```

বিস্তারিত (নতুন ওয়ার্কস্পেস কী কী ইনহেরিট করে, কোথায় সেভ হয়): **`docs/user/workspaces.md`**।

ব্রাউজার কনসোল থেকেও ট্রাই করতে পারবেন — playground-এ `window.velaWorkspace` এক্সপোজড:

```js
velaWorkspace.newWorkspace('টেস্ট')
velaWorkspace.workspaces()
```

---

## ৮. টেস্ট চালানো

```bash
npm test                 # পুরো suite (≈৫ মিনিট, ৩২৯০+ টেস্ট)
npx vitest run test/pine-footprint.test.ts     # শুধু order-flow
npx vitest run test/workspace-multi.test.ts    # শুধু multiple workspace
npm run test:watch       # ওয়াচ মোড
npm run test:browser     # Playwright ব্রাউজার টেস্ট (আগে: npx playwright install)
```

প্রথমবার `npm run test:browser` চালানোর আগে:

```bash
npx playwright install chromium
```

---

## ৯. সমস্যা সমাধান (Troubleshooting)

| সমস্যা | কারণ ও সমাধান |
| --- | --- |
| চার্ট খালি, কনসোলে `CORS` / `Failed to load resource: api.binance.com` | আপনার নেটওয়ার্ক বা ব্রাউজার এক্সটেনশন Binance API ব্লক করছে। অন্য নেটওয়ার্কে চেষ্টা করুন, VPN/অ্যাড-ব্লকার বন্ধ করুন, অথবা `playground/offline.html` (নেটওয়ার্ক ছাড়া) ব্যবহার করুন। |
| `EADDRINUSE: 5190` | পোর্ট ব্যস্ত। `npx vite --port 5191` দিয়ে চালান। |
| `Undeclared identifier "footprint"` | vendored ইঞ্জিন re-sync হয়ে প্যাচ মুছে গেছে — `git apply scripts/patches/footprint-builtins.patch` চালান। |
| `Cannot find module ... dist/` | `npm run build` (বা `npm install` আবার) চালান — `prepare` স্ক্রিপ্ট `dist/` বানায়। |
| `structuredClone is not defined` | Node ১৮ বা পুরনো — Node ২০ LTS-এ যান। |
| টাইপ এরর `@types/chai` ফাইলে | `npx tsc --noEmit -p tsconfig.json` ব্যবহার করুন (প্রজেক্ট কনফিগ দিয়ে), একক ফাইলে `tsc` চালাবেন না। |
| Playground-এ ইন্ডিকেটর নেই | ইঞ্জিন আলাদা অ্যাডন — `playground/vendor/pine-libre` ইমপোর্ট করা আছে কিনা দেখুন। |

---

## ১০. ফোল্ডার ম্যাপ (কোথায় কী)

```
src/workspace/       মাল্টি-চার্ট শেল (VelaWorkspace, layouts, persist, sync, workspaces)
src/core/            চার্ট কোর, ইন্ডিকেটর, volume-profile (order flow ডেটা)
src/renderers/       WebGL2 + Canvas2D রেন্ডারার
src/data/providers/  binance / coinbase / hyperliquid
src/widget/          টপবার, সাইডবার, অবজেক্ট ট্রি, পাইন রেফারেন্স ডেটা
playground/          ডেমো + ভেন্ডরড Pine ইঞ্জিন (vendor/pine-libre)
scripts/             build, sync-pine-engine, patches/footprint-builtins.patch
test/                Vitest suite + browser টেস্ট
docs/                ইউজার ও আর্কিটেকচার ডকুমেন্টেশন
```

---

## ১১. এক নজরে কমান্ড

```bash
npm install            # ডিপেন্ডেন্সি + dist বিল্ড
npm run playground     # http://localhost:5190 — অ্যাপ চালু
npm run build          # লাইব্রেরি বিল্ড
npm run typecheck      # টাইপ চেক
npm run lint           # লিন্ট
npm test               # সব টেস্ট
npm run test:browser   # ব্রাউজার টেস্ট (Playwright)
```

---

**লাইসেন্স ও অ্যাট্রিবিউশন:** এই پروজেক্ট Apache-2.0, এবং `NOTICE` ফাইলের শর্ত অনুযায়ী যেকোনো চার্ট সারফেসে **"Vela"** মার্ক/লিংক দৃশ্যমান রাখতে হবে। ওই ফাইলটা মুছবেন না।
