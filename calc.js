#!/usr/bin/env node
// Terminal view of the same numbers the dashboard shows. No server needed.
// Usage:  node calc.js            -> summary, milestones, year-wise totals
//         node calc.js --full     -> also per-investment figures for every year
//         node calc.js --json     -> raw result as JSON (for scripts or for Claude)
//         node calc.js --today 2029-05-01   -> pretend today is that date

const fs = require('fs');
const path = require('path');
const Engine = require('./docs/engine.js');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const DATA = path.join(__dirname, 'data.json');
if (!fs.existsSync(DATA)) {
  console.error('No data.json next to calc.js. Create one, or enter your numbers in the page via node server.js.');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const result = Engine.build(data, { today: opt('--today') ? Engine.parseDate(opt('--today')) : new Date() });

if (flag('--json')) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const S = Engine.short;
const pad = (s, n, right) => (right ? String(s).padStart(n) : String(s).padEnd(n));

console.log(`\nFinance Calculator  (today ${result.today}${result.ageToday !== null ? `, age ${result.ageToday}` : ''}, horizon ${result.retireAge ? `age ${result.retireAge}` : '20 years'} = ${result.endDate})\n`);

console.log('CURRENT');
console.log(pad('Investment', 34) + pad('Put in', 12, true) + pad('Last value', 12, true) + pad('As of', 12, true) + pad('Rate', 7, true) + pad('Est. today', 13, true));
for (const c of result.current) {
  console.log(pad(c.name, 34) + pad(S(c.invested), 12, true) + pad(S(c.value), 12, true) + pad(c.asOf || '', 12, true) + pad(c.rate + '%', 7, true) + pad(S(c.valueToday), 13, true));
}
const t = result.totals;
console.log(pad('TOTAL', 34) + pad(S(t.invested), 12, true) + pad(S(t.value), 12, true) + pad('', 12) + pad('', 7) + pad(S(t.valueToday), 13, true));
console.log(`Monthly additions across everything: ${S(t.monthlyAdd)} (yearly adds spread over 12 months)\n`);

if (result.milestones.length) {
  console.log('MILESTONES');
  for (const m of result.milestones) {
    console.log(`${pad(m.label, 8)} ${m.date}   put in ${pad(S(m.putIn), 11, true)}   with growth ${pad(S(m.value), 11, true)}   growth ${pad(S(m.value - m.putIn), 11, true)}   after tax ${pad(S(m.afterTax), 11, true)}${m.assets ? `   assets ${pad(S(m.assets), 11, true)}` : ''}`);
  }
  console.log('');
}

console.log('YEAR-WISE');
console.log(pad('When', 10) + pad('Date', 12) + pad('Put in', 13, true) + pad('With growth', 14, true) + pad('Growth', 13, true) + pad('After tax', 13, true));
for (const r of result.rows) {
  console.log(pad(r.label, 10) + pad(r.date, 12) + pad(S(r.putIn), 13, true) + pad(S(r.value), 14, true) + pad(S(r.value - r.putIn), 13, true) + pad(S(r.afterTax), 13, true));
  if (flag('--full')) {
    for (const p of r.parts) {
      console.log('    ' + pad(p.name, 30) + pad(S(p.putIn), 13, true) + pad(S(p.value), 14, true) + pad('', 13) + pad(S(p.afterTax), 13, true));
    }
  }
}
console.log('');
