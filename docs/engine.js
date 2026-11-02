// Projection engine. Pure functions, no DOM. Used by the browser app and by calc.js in the terminal.
// Money is in rupees. Rates are annual percentages, compounded monthly.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MS_DAY = 86400000;

  function parseDate(s) {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const [y, m, d] = String(s || '').split('-').map(Number);
    if (!y || !m) return null;
    return new Date(y, m - 1, d || 1);
  }

  function ymd(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function monthIndex(d) {
    return d.getFullYear() * 12 + d.getMonth();
  }

  function ageAt(dob, date) {
    const b = parseDate(dob);
    if (!b) return null;
    let age = date.getFullYear() - b.getFullYear();
    const beforeBirthday = date.getMonth() < b.getMonth() || (date.getMonth() === b.getMonth() && date.getDate() < b.getDate());
    if (beforeBirthday) age -= 1;
    return age;
  }

  // Simulate one investment month by month from its asOf date up to `endMonthIdx` (inclusive).
  // Returns a map monthIdx -> {putIn, value}. The asOf month itself is the starting point (no growth, no add).
  // Each following month: value grows one month at rate, then monthly add, then yearly add if it is that month.
  function simulate(inv, endMonthIdx) {
    const start = parseDate(inv.asOf) || new Date();
    const r = (Number(inv.rate) || 0) / 100 / 12;
    const monthly = Number(inv.monthly) || 0;
    const yearly = Number(inv.yearly) || 0;
    const yearlyMonth = Number(inv.yearlyMonth) || 0; // 1..12, 0 = never
    let putIn = Number(inv.invested) || 0;
    let value = Number(inv.value) || 0;
    const out = new Map();
    let idx = monthIndex(start);
    out.set(idx, { putIn, value });
    while (idx < endMonthIdx) {
      idx += 1;
      const m = (idx % 12) + 1; // calendar month 1..12
      value = value * (1 + r);
      if (monthly) { value += monthly; putIn += monthly; }
      if (yearly && m === yearlyMonth) { value += yearly; putIn += yearly; }
      out.set(idx, { putIn, value });
    }
    return out;
  }

  // Value of an investment at a given date (month resolution). Dates before asOf return the asOf figures.
  function at(sim, date) {
    const idx = monthIndex(date);
    const keys = [...sim.keys()];
    const first = keys[0];
    if (idx <= first) return sim.get(first);
    return sim.get(idx) || sim.get(keys[keys.length - 1]);
  }

  // Build everything the dashboard and the CLI need.
  // opts: { today: Date, dob: 'YYYY-MM-DD', retireAge: number, milestoneAges: number[] }
  function build(data, opts) {
    const today = parseDate(opts.today || new Date());
    const profile = data.profile || {};
    const dob = parseDate(opts.dob || profile.dob);
    const retireAge = Number(opts.retireAge || profile.retireAge) || null; // null = not set
    const milestoneAges = (opts.milestoneAges || profile.milestoneAges || []).map(Number).filter(Boolean);

    // Horizon: the birthday month of retireAge, or 20 years from now if no DOB or no retirement age.
    let endDate;
    if (dob && retireAge) endDate = new Date(dob.getFullYear() + retireAge, dob.getMonth(), 1);
    else endDate = new Date(today.getFullYear() + 20, today.getMonth(), 1);
    if (endDate < today) endDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endIdx = monthIndex(endDate);

    const sims = data.investments.map((inv) => ({ inv, sim: simulate(inv, endIdx) }));
    // Assets (property, gold, ...) hold a value and grow at their rate; nothing is added to them.
    // They are kept apart from investments so "put in" and "with growth" stay contribution-based.
    const assetSims = (data.assets || []).map((a) => ({
      a,
      sim: simulate({ invested: a.value, value: a.value, asOf: a.asOf, rate: a.rate, monthly: 0, yearly: 0 }, endIdx),
    }));
    const assetsCurrent = assetSims.map(({ a, sim }) => ({
      id: a.id,
      name: a.name,
      rate: Number(a.rate) || 0,
      tax: Number(a.tax) || 0,
      value: Number(a.value) || 0,
      valueToday: at(sim, today).value,
    }));

    // Current picture: last recorded vs estimated today.
    const current = sims.map(({ inv, sim }) => {
      const nowPt = at(sim, today);
      return {
        id: inv.id,
        name: inv.name,
        type: inv.type,
        rate: Number(inv.rate) || 0,
        asOf: inv.asOf,
        invested: Number(inv.invested) || 0,
        value: Number(inv.value) || 0,
        putInToday: nowPt.putIn,
        valueToday: nowPt.value,
        monthlyAdd: (Number(inv.monthly) || 0) + (Number(inv.yearly) || 0) / 12,
      };
    });
    const totals = current.reduce((t, c) => ({
      invested: t.invested + c.invested,
      value: t.value + c.value,
      putInToday: t.putInToday + c.putInToday,
      valueToday: t.valueToday + c.valueToday,
      monthlyAdd: t.monthlyAdd + c.monthlyAdd,
    }), { invested: 0, value: 0, putInToday: 0, valueToday: 0, monthlyAdd: 0 });
    totals.assets = assetsCurrent.reduce((s, c) => s + c.value, 0);
    totals.assetsToday = assetsCurrent.reduce((s, c) => s + c.valueToday, 0);

    // Year-wise rows: at each birthday from the next one to retireAge (or each calendar year if no DOB).
    const rows = [];
    // afterTax: value minus the investment's tax % on the gain (value - putIn), as if cashed out on that date.
    const pushRow = (label, date, age) => {
      const parts = sims.map(({ inv, sim }) => {
        const p = at(sim, date);
        const tax = Math.max(0, p.value - p.putIn) * (Number(inv.tax) || 0) / 100;
        return { id: inv.id, name: inv.name, putIn: p.putIn, value: p.value, afterTax: p.value - tax };
      });
      const assetParts = assetSims.map(({ a, sim }) => {
        const v = at(sim, date).value;
        const tax = Math.max(0, v - (Number(a.value) || 0)) * (Number(a.tax) || 0) / 100;
        return { id: a.id, name: a.name, value: v, afterTax: v - tax };
      });
      rows.push({
        label,
        date: ymd(date),
        age,
        parts,
        assetParts,
        assets: assetParts.reduce((s, p) => s + p.value, 0),
        assetsAfterTax: assetParts.reduce((s, p) => s + p.afterTax, 0),
        putIn: parts.reduce((s, p) => s + p.putIn, 0),
        value: parts.reduce((s, p) => s + p.value, 0),
        afterTax: parts.reduce((s, p) => s + p.afterTax, 0),
      });
    };
    pushRow('Today', today, dob ? ageAt(dob, today) : null);
    if (dob) {
      let age = ageAt(dob, today) + 1;
      const lastAge = retireAge || ageAt(dob, endDate);
      for (; age <= lastAge; age += 1) {
        const d = new Date(dob.getFullYear() + age, dob.getMonth(), 1);
        pushRow(`Age ${age}`, d, age);
      }
    } else {
      for (let y = today.getFullYear() + 1; y <= endDate.getFullYear(); y += 1) {
        pushRow(String(y), new Date(y, today.getMonth(), 1), null);
      }
    }

    const milestones = rows.filter((r) => r.age !== null && milestoneAges.includes(r.age));

    return {
      today: ymd(today),
      ageToday: dob ? ageAt(dob, today) : null,
      retireAge,
      endDate: ymd(endDate),
      current,
      assetsCurrent,
      totals,
      rows,
      milestones,
    };
  }

  // Indian formatting helpers.
  function inr(n, opts) {
    const v = Math.round(Number(n) || 0);
    return '₹' + v.toLocaleString('en-IN', opts);
  }
  function short(n) {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)} L`;
    return inr(v);
  }

  return { build, simulate, at, parseDate, ymd, ageAt, inr, short };
});
