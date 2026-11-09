// Tests for the projection maths in docs/engine.js. Run with: npm test  (Node's built-in test runner, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../docs/engine.js');

const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 0.01, `${msg}: ${actual} vs ${expected}`);

test('parseDate reads YYYY-MM-DD, defaults the day to 1, and rejects empty input', () => {
  assert.equal(Engine.ymd(Engine.parseDate('2026-03-15')), '2026-03-15');
  assert.equal(Engine.ymd(Engine.parseDate('2026-03')), '2026-03-01');
  assert.equal(Engine.parseDate(''), null);
  assert.equal(Engine.parseDate(undefined), null);
});

test('ageAt counts a birthday only once it has been reached', () => {
  const today = Engine.parseDate('2026-06-15');
  assert.equal(Engine.ageAt('1990-06-15', today), 36, 'birthday today');
  assert.equal(Engine.ageAt('1990-06-16', today), 35, 'birthday tomorrow');
  assert.equal(Engine.ageAt('1990-01-01', today), 36, 'birthday earlier in the year');
  assert.equal(Engine.ageAt('', today), null);
});

test('simulate: the asOf month is the starting point, then growth, monthly and yearly additions', () => {
  const inv = { asOf: '2026-01-01', invested: 1000, value: 1000, rate: 12, monthly: 100, yearly: 500, yearlyMonth: 3 };
  const start = 2026 * 12 + 0;
  const sim = Engine.simulate(inv, start + 2); // January (start), February, March
  assert.deepEqual(sim.get(start), { putIn: 1000, value: 1000 });

  const feb = sim.get(start + 1); // 1% growth, then +100
  close(feb.value, 1000 * 1.01 + 100, 'February value');
  assert.equal(feb.putIn, 1100);

  const mar = sim.get(start + 2); // 1% growth, +100, and the yearly +500 lands in March
  close(mar.value, feb.value * 1.01 + 100 + 500, 'March value');
  assert.equal(mar.putIn, 1700);
});

test('at returns the starting figures before asOf and the last figures after the horizon', () => {
  const inv = { asOf: '2026-01-01', invested: 1000, value: 1000, rate: 0, monthly: 100 };
  const sim = Engine.simulate(inv, 2026 * 12 + 3);
  assert.equal(Engine.at(sim, Engine.parseDate('2025-06-01')).putIn, 1000, 'before asOf');
  assert.equal(Engine.at(sim, Engine.parseDate('2030-01-01')).putIn, 1300, 'after the horizon');
});

test('build: "invested" counts only money put in, never returns', () => {
  const data = { investments: [{ id: 'a', name: 'Fund', asOf: '2026-01-01', invested: 10000, value: 10000, rate: 10, monthly: 1000 }] };
  const out = Engine.build(data, { today: '2027-01-01' });
  const today = out.rows[0];
  assert.equal(today.label, 'Today');
  assert.equal(today.putIn, 10000 + 12 * 1000, 'twelve monthly payments added, no growth counted');
  assert.ok(today.value > today.putIn, 'with growth is higher than invested');
});

test('build: tax is charged on the gain only, and never on a loss', () => {
  const gain = { investments: [{ id: 'g', asOf: '2026-01-01', invested: 1000, value: 1000, rate: 12, tax: 10 }] };
  const row = Engine.build(gain, { today: '2027-01-01' }).rows[0];
  close(row.afterTax, row.value - (row.value - row.putIn) * 0.1, 'after tax on a gain');

  const loss = { investments: [{ id: 'l', asOf: '2026-01-01', invested: 1000, value: 800, rate: 0, tax: 30 }] };
  const lossRow = Engine.build(loss, { today: '2027-01-01' }).rows[0];
  assert.equal(lossRow.afterTax, 800, 'no tax when the value is below what was put in');
});

test('build: without a retirement age the projection runs 20 years ahead', () => {
  const out = Engine.build({ investments: [] }, { today: '2026-05-10' });
  assert.equal(out.endDate, '2046-05-01');
  assert.equal(out.rows.length, 1 + 20, 'Today plus one row per year');
});

test('build: with a date of birth, rows are birthdays up to retirement and milestones are picked out', () => {
  const data = { profile: { dob: '1990-08-20', retireAge: 40, milestoneAges: [38, 40] }, investments: [] };
  const out = Engine.build(data, { today: '2026-01-01' });
  assert.equal(out.ageToday, 35);
  assert.deepEqual(out.rows.map((r) => r.label), ['Today', 'Age 36', 'Age 37', 'Age 38', 'Age 39', 'Age 40']);
  assert.deepEqual(out.milestones.map((r) => r.age), [38, 40]);
});

test('build: assets grow on their own and are kept apart from investments', () => {
  const data = {
    investments: [{ id: 'f', asOf: '2026-01-01', invested: 1000, value: 1000, rate: 0 }],
    assets: [{ id: 'gold', name: 'Gold', asOf: '2026-01-01', value: 5000, rate: 12 }],
  };
  const out = Engine.build(data, { today: '2027-01-01' });
  assert.equal(out.totals.assets, 5000, 'recorded asset value');
  assert.ok(out.totals.assetsToday > 5000, 'asset has grown');
  assert.equal(out.totals.invested, 1000, 'assets are not counted as invested');
  assert.equal(out.rows[0].putIn, 1000, 'assets are not counted as put in');
});

test('inr and short use Indian number formatting', () => {
  assert.equal(Engine.inr(123456.4), '₹1,23,456');
  assert.equal(Engine.short(15000000), '₹1.50 Cr');
  assert.equal(Engine.short(150000), '₹1.5 L');
  assert.equal(Engine.short(-250000), '-₹2.5 L');
  assert.equal(Engine.short(999), '₹999');
});
