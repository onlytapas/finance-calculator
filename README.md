# Finance Calculator

A personal wealth planner that runs entirely in your browser. Enter what you have invested, what you add every month or year, and anything you own, and it shows where you stand today and where you are heading at each birthday up to retirement.

**Live:** https://onlytapas.github.io/finance-calculator/

## What it does

- **Profile**: date of birth, retirement age and the milestone ages you care about.
- **Investments**: invested so far, monthly and yearly investment, expected rate of interest and tax on gains (mutual funds, EPF, PPF, FDs, insurance and so on).
- **Assets**: property, gold, silver. Enter units and price per unit (e.g. 100 grams × ₹7,500) or just the value, plus an optional expected growth.
- **Current portfolio**: totals and each holding's share.
- **Future projection**: milestone cards (invested, with growth, assets, net worth after tax), a growth chart and a year-by-year table.
- **Download PDF**: saves the whole page through the browser's print dialog.
- Light and dark mode.

## Privacy

The hosted page has no backend, no account, no analytics and no third-party script. Everything you type stays in your own browser tab (`sessionStorage`):

- it survives a refresh;
- it is cleared when you close the tab or the browser;
- nobody else opening the same link can see it.

Use **Download PDF** if you want to keep a copy.

## How the numbers work

- **Invested** counts only money put in: what you have invested so far plus every future monthly and yearly investment. No returns.
- **With growth** compounds each investment monthly at its expected rate, with each new investment joining as it is made.
- **After tax** takes the investment's tax-on-gains % off its gain, as if cashed out on that date. It is a simple estimate: no yearly exemptions, and slab-taxed interest is taxed on the total gain.
- **Assets** grow from today's value at their own rate with nothing added, and are kept apart from "invested" and "with growth". Net worth = investments with growth + assets.
- Projections are taken at your birthday month each year.

These are planning estimates, not financial advice.

## Run it locally

No build step and no dependencies, only Node.js.

```
node server.js          # then open http://localhost:4545
```

or double-click `start.command` on a Mac.

Run this way, the page can also keep your numbers in a local `data.json` next to `server.js` (create it once with `{"profile": {}, "investments": [], "assets": []}`). Every save writes it atomically and keeps the last 30 copies in `backups/`. Both are listed in `.gitignore` and never leave your machine. Without a `data.json` the page behaves exactly like the hosted one.

Terminal view of the same numbers:

```
node calc.js            # summary, milestones, year by year
node calc.js --full     # also each investment for every year
node calc.js --json     # raw numbers
node calc.js --today 2030-01-01
```

## Files

| Path | Purpose |
| --- | --- |
| `docs/index.html` | Page structure (served by GitHub Pages from `docs/`) |
| `docs/style.css` | Sage & Clay theme, light and dark, print layout |
| `docs/engine.js` | Projection maths. Pure functions, shared by the page and `calc.js` |
| `docs/app.js` | Editing, rendering, chart, PDF |
| `server.js` | Optional local server that reads and writes `data.json` |
| `calc.js` | Optional terminal view |
