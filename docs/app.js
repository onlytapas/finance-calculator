/* Finance Calculator UI. Profile, Investments and Assets are edited behind a pencil; the rest is computed from them. */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const S = Engine.short;
  const INR = (n) => Engine.inr(n);
  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthYear = (ymd) => { const [y, m] = ymd.split('-').map(Number); return `${MONTHS[m]} ${y}`; };
  const dayMonthYear = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return `${d} ${MONTHS[m]} ${y}`; };

  // Each investment / asset keeps one colour everywhere on the page (dots, share bars, table headers).
  const colorOf = (id) => `var(--c${(Math.max(0, [...data.investments, ...data.assets].findIndex((i) => i.id === id)) % 6) + 1})`;
  const dot = (id) => `<i class="dot" style="--c:${colorOf(id)}"></i>`;

  let data = null;
  let dirty = false;
  const editing = { profile: false, holdings: false };

  // Two places data can live:
  //  'file'    - this machine runs server.js and has a data.json; saves go to that file.
  //  'browser' - anywhere else (a hosted copy, or a fresh clone with no data.json). Starts blank and
  //              saves only to sessionStorage: it survives a refresh, is gone once the tab or browser is
  //              closed, and never leaves the visitor's machine.
  const STORE_KEY = 'finance-calculator:data';
  let mode = 'browser';

  function blank() {
    return { profile: { name: '', dob: '', retireAge: '', milestoneAges: [], notes: '' }, investments: [], assets: [] };
  }

  async function load() {
    try {
      const res = await fetch('api/data', { cache: 'no-store' });
      if (res.ok && (res.headers.get('Content-Type') || '').includes('json')) {
        data = await res.json();
        mode = 'file';
      }
    } catch (e) { /* no server here, fall through to browser storage */ }
    if (mode === 'browser') {
      try { data = JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch (e) { data = null; }
      if (!data || !Array.isArray(data.investments)) data = blank();
    }
    data.profile = data.profile || {};
    data.investments = data.investments || [];
    data.assets = data.assets || [];
    $('#storage-note').textContent = mode === 'file'
      ? 'Your numbers are saved on this computer only.'
      : 'Your numbers stay only in this browser tab. They survive a refresh and are cleared when you close it. Nothing is sent anywhere.';
    // first visit: open the profile; Investments & Assets wait behind their pencil with a hint
    if (!data.investments.length && !data.assets.length) editing.profile = true;
    $('#btn-reset').hidden = mode !== 'browser'; // never offered on the local copy that writes data.json
    renderProfile();
    renderList('investments');
    renderList('assets');
    recalc();
  }

  // Reset is greyed out until something has been typed or saved.
  function hasAnything() {
    const p = data.profile;
    return !!(p.name || p.dob || p.retireAge || (p.milestoneAges || []).length || p.notes || data.investments.length || data.assets.length)
      || $$('main input, main textarea').some((el) => el.type !== 'checkbox' && el.value.trim() !== '' && !el.closest('[hidden]'));
  }
  function refreshReset() { $('#btn-reset').disabled = !hasAnything(); }
  document.addEventListener('input', refreshReset);

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Clear everything you have entered and start again?')) return;
    const btn = $('#btn-reset');
    btn.classList.add('spin');
    setTimeout(() => btn.classList.remove('spin'), 600);
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* storage blocked, nothing to clear */ }
    data = blank();
    dirty = false;
    editing.profile = true;
    editing.holdings = false;
    renderProfile();
    renderList('investments');
    renderList('assets');
    recalc();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  async function save() {
    try {
      if (mode === 'file') {
        const res = await fetch('api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error(await res.text());
      } else {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(data));
      }
      dirty = false;
    } catch (e) {
      alert('Could not save: ' + e.message);
    }
  }

  // ---------- light / dark ----------
  // Follows the Mac setting until the round button is clicked, then remembers the choice.
  $('#btn-theme').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('finance-calculator:theme', root.dataset.theme); } catch (e) { /* storage blocked */ }
  });

  // ---------- edit mode ----------
  function setEditing(section, on) {
    editing[section] = on;
    $('#' + section).classList.toggle('editing', on);
  }

  $$('.pencil').forEach((btn) => btn.addEventListener('click', () => {
    const section = btn.closest('.editable').id;
    setEditing(section, true);
    if (section === 'profile') renderProfile(); else { renderList('investments'); renderList('assets'); }
    const first = $('#' + section + ' .edit input, #' + section + ' tbody input');
    if (first) first.focus();
  }));

  // Profile has a plain Save; Investments & Assets has one "Calculate current & future", which also jumps to the results.
  $$('.calc').forEach((btn) => btn.addEventListener('click', async () => {
    const fromProfile = btn.id === 'btn-profile-save';
    readProfile();
    await save();
    setEditing('profile', false);
    if (!fromProfile) setEditing('holdings', false);
    renderProfile();
    renderList('investments');
    renderList('assets');
    recalc();
    if (!fromProfile) $('#portfolio').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // ---------- profile ----------
  function renderProfile() {
    const p = data.profile;
    $('#profile').classList.toggle('editing', editing.profile);
    $('#p-name').value = p.name || '';
    $('#p-dob').value = p.dob || '';
    $('#p-retire').value = p.retireAge || '';
    $('#p-milestones').value = (p.milestoneAges || []).join(', ');
    $('#p-notes').value = p.notes || '';
    const today = new Date();
    const age = p.dob ? Engine.ageAt(p.dob, today) : null;
    const initials = (p.name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const chip = (k, v) => `<div class="chip"><span>${k}</span><b${v === '–' ? ' class="none"' : ''}>${v}</b></div>`;
    $('#profile-view').innerHTML = `
      <div class="who">
        <div class="avatar">${initials ? esc(initials) : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>'}</div>
        <div>
          <div class="who-name">${p.name ? esc(p.name) : '<span class="faint">Add your name</span>'}</div>
          <div class="who-sub">${p.dob ? `Born ${dayMonthYear(p.dob)}${age !== null ? ` · ${age} years old` : ''}` : 'Add your date of birth to see milestones by age'}</div>
        </div>
      </div>
      <div class="chips">
        ${chip('Retire at', p.retireAge ? `${p.retireAge}${age !== null ? ` <small>in ${Math.max(0, p.retireAge - age)} yrs</small>` : ''}` : '–')}
        ${chip('Milestones', (p.milestoneAges || []).length ? (p.milestoneAges || []).join(' · ') : '–')}
      </div>
      ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}`;
  }

  function readProfile() {
    const p = data.profile;
    p.name = $('#p-name').value.trim();
    p.dob = $('#p-dob').value;
    p.retireAge = Number($('#p-retire').value) || '';
    p.milestoneAges = $('#p-milestones').value.split(/[,\s]+/).map(Number).filter((n) => n > 0);
    p.notes = $('#p-notes').value;
  }

  $$('#profile input, #profile textarea').forEach((el) => el.addEventListener('input', () => { dirty = true; }));

  // ---------- investments and assets tables ----------
  // "Invested so far" / "Value today" is treated as today's value: editing it also resets value and asOf,
  // which the engine grows from.
  const LISTS = {
    investments: {
      table: '#inv-table', add: '#btn-add', what: 'investment', placeholder: 'e.g. Mutual funds',
      empty: 'No investments yet. Click the pencil to add your investments.',
      emptyEditing: 'No investments yet. Use + Add investment below.',
      fields: [
        { key: 'name', type: 'text', cls: 'wide' },
        { key: 'invested', type: 'number', num: true },
        { key: 'monthly', type: 'number', num: true },
        { key: 'yearly', type: 'number', num: true, col: 'col-yearly' },
        { key: 'yearlyMonth', type: 'month', num: true, col: 'col-yearly' },
        { key: 'rate', type: 'number', num: true, cls: 'narrow', step: '0.1' },
        { key: 'tax', type: 'number', num: true, cls: 'narrow', step: '0.5' },
      ],
      blank: () => ({ id: 'inv' + Date.now(), name: '', invested: 0, value: 0, asOf: Engine.ymd(new Date()), monthly: 0, yearly: 0, yearlyMonth: 0, rate: 0, tax: 0 }),
    },
    assets: {
      table: '#asset-table', add: '#btn-add-asset', what: 'asset', placeholder: 'e.g. Gold, Flat in Pune',
      empty: 'No assets added. Click the pencil to add property, gold, silver or anything else you own.',
      emptyEditing: 'No assets yet. Use + Add asset below.',
      // units x price per unit fills the asset value; the value can also be typed straight in
      fields: [
        { key: 'name', type: 'text', cls: 'wide' },
        { key: 'units', type: 'units', num: true },
        { key: 'unitPrice', type: 'number', num: true },
        { key: 'rate', type: 'number', num: true, cls: 'narrow', step: '0.1' },
        { key: 'value', type: 'number', num: true, cls: 'asset-value' },
      ],
      blank: () => ({ id: 'ast' + Date.now(), name: '', units: 0, unit: '', unitPrice: 0, value: 0, asOf: Engine.ymd(new Date()), rate: 0 }),
    },
  };
  // Amount boxes are plain text with a numeric keypad, so "7,500", "₹ 38,88,000" or "100 grams" all read as numbers.
  // (A type=number box silently turns those into "", which some browsers do, and the value never fills in.)
  const parseNum = (str) => {
    const m = String(str).replace(/[,₹\s]/g, '').match(/\d*\.?\d+/);
    return m ? Number(m[0]) : 0;
  };

  // Units offered for assets; anything else goes in through Other.
  const UNITS = ['grams', 'kg', 'sq ft', 'sq yards', 'acres', 'pieces'];

  // Edit boxes show amounts with Indian commas (38,88,000); parseNum reads them back.
  const fmtNum = (n) => (Number(n) ? Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '');

  const hasYearly = () => data.investments.some((i) => Number(i.yearly) > 0);
  const hasTax = () => data.investments.some((i) => Number(i.tax) > 0);

  function renderList(kind) {
    // both tables open and close together with the Investments & Assets pencil
    const L = LISTS[kind], list = data[kind], on = editing.holdings;
    $('#holdings').classList.toggle('editing', on);
    // nobody pays yearly -> hide the yearly columns (they stay while editing so one can be added)
    if (kind === 'investments') $(L.table).classList.toggle('no-yearly', !on && !hasYearly());
    const tb = $(L.table + ' tbody');
    tb.innerHTML = '';
    if (data) setTimeout(refreshReset); // rows added or removed
    if (!list.length) {
      tb.innerHTML = `<tr class="empty"><td colspan="${L.fields.length + 1}">${on ? L.emptyEditing : L.empty}</td></tr>`;
      return;
    }
    list.forEach((item, i) => {
      const tr = document.createElement('tr');
      L.fields.forEach((f) => {
        const td = document.createElement('td');
        td.className = [f.num ? 'num' : '', f.col || ''].join(' ').trim();
        if (!on) {
          td.innerHTML = readCell(item, f);
          tr.appendChild(td);
          return;
        }
        if (f.type === 'units') {
          // how many units, and a unit picked from a list (Other lets you type your own)
          const wrap = document.createElement('div');
          wrap.className = 'units-pair';
          const qty = document.createElement('input');
          qty.type = 'text'; qty.inputMode = 'decimal'; qty.className = 'qty';
          qty.value = fmtNum(item.units);
          qty.placeholder = '100';
          const pick = document.createElement('select');
          pick.className = 'unit-pick';
          pick.innerHTML = '<option value="">unit</option>' + UNITS.map((u) => `<option>${u}</option>`).join('') + '<option value="other">Other…</option>';
          const own = document.createElement('input');
          own.type = 'text'; own.className = 'unit'; own.placeholder = 'e.g. shares';
          const known = !item.unit || UNITS.includes(item.unit);
          pick.value = known ? (item.unit || '') : 'other';
          own.value = known ? '' : item.unit;
          own.hidden = known;
          qty.addEventListener('input', () => { item.units = parseNum(qty.value); fillValue(item, tr); dirty = true; });
          pick.addEventListener('change', () => {
            own.hidden = pick.value !== 'other';
            item.unit = pick.value === 'other' ? own.value.trim() : pick.value;
            if (!own.hidden) own.focus();
            dirty = true;
          });
          own.addEventListener('input', () => { item.unit = own.value.trim(); dirty = true; });
          wrap.append(qty, pick, own);
          td.appendChild(wrap);
          tr.appendChild(td);
          return;
        }
        let el;
        if (f.type === 'month') {
          el = document.createElement('select');
          el.innerHTML = MONTHS.slice(1).map((m, idx) => `<option value="${idx + 1}">${m}</option>`).join('');
          el.value = String(item.yearlyMonth || 4);
          el.hidden = !(Number(item.yearly) > 0);
        } else {
          el = document.createElement('input');
          el.type = f.type === 'number' ? 'text' : f.type;
          if (f.type === 'number') el.inputMode = 'decimal';

          if (f.type === 'number') el.value = (f.key === 'unitPrice' && !item[f.key]) ? '' : (fmtNum(item[f.key]) || '0');
          else el.value = item[f.key] == null ? '' : item[f.key];
          if (f.key === 'unitPrice') el.placeholder = '₹';
          if (f.key === 'name') el.placeholder = L.placeholder;
        }
        if (f.cls) el.classList.add(f.cls);
        el.addEventListener('input', () => {
          let v = el.value;
          if (f.type === 'number') v = parseNum(v);
          else if (f.type === 'month') v = Number(v) || 0;
          item[f.key] = v;
          if (f.key === 'invested') { item.value = v; item.asOf = Engine.ymd(new Date()); }
          if (kind === 'assets' && f.key === 'value') item.asOf = Engine.ymd(new Date());
          if (f.key === 'unitPrice') fillValue(item, tr);
          if (f.key === 'yearly') {
            const sel = $('select', tr);
            sel.hidden = !(v > 0);
            item.yearlyMonth = v > 0 ? Number(sel.value) : 0;
          }
          dirty = true;
        });
        td.appendChild(el);
        tr.appendChild(td);
      });
      const tdDel = document.createElement('td');
      tdDel.className = 'edit-cell';
      if (on) {
        const del = document.createElement('button');
        del.className = 'trash';
        del.type = 'button';
        del.title = `Delete this ${L.what}`;
        del.setAttribute('aria-label', del.title);
        // lid lifts on hover; on click the row slides away, then it is removed (saved on Calculate)
        del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
          + '<g class="lid"><path d="M3 6h18"/><path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6"/></g>'
          + '<path d="M5.5 6l1 13.5A1.5 1.5 0 0 0 8 21h8a1.5 1.5 0 0 0 1.5-1.5L18.5 6"/><path d="M10 10.5v6M14 10.5v6"/></svg>';
        del.addEventListener('click', () => {
          tr.classList.add('removing');
          setTimeout(() => {
            list.splice(list.indexOf(item), 1);
            dirty = true;
            renderList(kind);
          }, 420);
        });
        tdDel.appendChild(del);
      }
      tr.appendChild(tdDel);
      tb.appendChild(tr);
    });
  }

  // Units and price both set -> asset value = units x price (still editable by hand afterwards).
  function fillValue(item, tr) {
    if (!(Number(item.units) > 0 && Number(item.unitPrice) > 0)) return;
    item.value = Math.round(item.units * item.unitPrice);
    item.asOf = Engine.ymd(new Date());
    const box = $('input.asset-value', tr);
    if (box) { box.value = fmtNum(item.value); box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); }
  }

  const unitsText = (item) => Number(item.units) ? `${Number(item.units).toLocaleString('en-IN')} ${esc(item.unit || '')}`.trim() : '';
  const unitPriceText = (item) => Number(item.unitPrice) ? `${INR(item.unitPrice)}${item.unit ? ` <small class="faint">/ ${esc(item.unit)}</small>` : ''}` : '';

  function readCell(item, f) {
    const v = item[f.key];
    if (f.key === 'name') return `${dot(item.id)}<b>${esc(v)}</b>`;
    if (f.key === 'units') return unitsText(item) || '<span class="faint">–</span>';
    if (f.key === 'unitPrice') return unitPriceText(item) || '<span class="faint">–</span>';
    if (f.type === 'number' && f.cls === 'asset-value') return Number(v) ? `<b>${INR(v)}</b>` : '<span class="faint">–</span>';
    if (f.key === 'yearlyMonth') return Number(item.yearly) > 0 && v ? MONTHS[v] : '<span class="faint">–</span>';
    if (f.key === 'rate' || f.key === 'tax') return Number(v) ? `${Number(v)}%` : '<span class="faint">–</span>';
    return Number(v) ? INR(v) : '<span class="faint">–</span>';
  }

  Object.entries(LISTS).forEach(([kind, L]) => $(L.add).addEventListener('click', () => {
    data[kind].push(L.blank());
    dirty = true;
    renderList(kind);
    const rows = $$(L.table + ' tbody tr');
    rows[rows.length - 1].querySelector('input').focus();
  }));

  // Download PDF: the browser's print dialog with "Save as PDF"; the print styles lay the page out for paper.
  $('#btn-pdf').addEventListener('click', () => {
    const was = document.title;
    const name = (data.profile.name || 'finance').trim().replace(/\s+/g, '-').toLowerCase();
    document.title = `${name}-finance-${Engine.ymd(new Date())}`; // becomes the suggested file name
    window.print();
    document.title = was;
  });

  // Hover: a soft light follows the pointer on every card; small cards also tilt a little in 3D.
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('.tilt, .glow');
    if (!el) return;
    const b = el.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    if (el.classList.contains('tilt')) {
      el.style.setProperty('--ry', ((px - 0.5) * 8).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((0.5 - py) * 8).toFixed(2) + 'deg');
    }
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest && e.target.closest('.tilt');
    if (el && !el.contains(e.relatedTarget)) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); }
  });

  // Sections float up as they scroll into view.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.08 });
    $$('.reveal').forEach((el) => io.observe(el));
  } else {
    $$('.reveal').forEach((el) => el.classList.add('in'));
  }

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- computed sections ----------
  function recalc() {
    let result;
    try {
      result = Engine.build(data, {});
    } catch (e) {
      showError('Cannot calculate: ' + e.message);
      return;
    }
    renderHero(result);
    refreshReset();
    renderCurrentTable(result);
    renderMilestones(result);
    renderChart(result);
    renderProjTable(result);
  }

  function showError(msg) {
    const el = $('#headline');
    el.textContent = msg;
    el.hidden = false;
  }

  function renderHero(r) {
    const t = r.totals;
    const monthly = data.investments.reduce((sum, i) => sum + (Number(i.monthly) || 0), 0);
    const yearly = data.investments.reduce((sum, i) => sum + (Number(i.yearly) || 0), 0);
    const icon = {
      total: '<path d="M3 10h18M5 10V20M19 10V20M9 10v10M15 10v10M3 20h18M12 3l9 5H3z"/>',
      assets: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
      month: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      year: '<path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3"/>',
    };
    const stat = (k, v, sub, ic, big) => `<div class="stat tilt${big ? ' main' : ''}"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon[ic]}</svg></div><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
    $('#hero').innerHTML = [
      stat('Total invested so far', S(t.invested), INR(t.invested), 'total', true),
      data.assets.length ? stat('Total assets', S(t.assets), INR(t.assets), 'assets') : '',
      stat('Investing per month', S(monthly), INR(monthly), 'month'),
      yearly ? stat('Investing per year', S(yearly), INR(yearly), 'year') : '',
    ].join('');
  }

  const shareCell = (id, pct) => `<td class="share-col"><div class="share"><div class="track"><div class="fill" style="width:${pct.toFixed(1)}%;--c:${colorOf(id)}"></div></div><span>${pct.toFixed(0)}%</span></div></td>`;
  const pctOrDash = (v) => Number(v) ? `${Number(v)}%` : '–';

  function renderCurrentTable(r) {
    const total = r.totals.invested || 1;
    const byId = Object.fromEntries(data.investments.map((i) => [i.id, i]));
    const showYearly = hasYearly(), showTax = hasTax();
    $('#current-table thead').innerHTML = '<tr><th>Investment</th><th class="num">Invested so far</th><th class="num">Monthly</th>'
      + (showYearly ? '<th class="num">Yearly</th>' : '') + '<th class="num">Rate</th>' + (showTax ? '<th class="num">Tax on gains</th>' : '')
      + '<th class="share-col">Share of investments</th></tr>';
    const rows = r.current.slice().sort((a, b) => b.invested - a.invested).map((c) => {
      const inv = byId[c.id] || {};
      return `<tr><td>${dot(c.id)}${esc(c.name)}</td><td class="num">${S(c.invested)}</td><td class="num">${Number(inv.monthly) ? S(inv.monthly) : '–'}</td>`
        + (showYearly ? `<td class="num">${Number(inv.yearly) ? S(inv.yearly) : '–'}</td>` : '')
        + `<td class="num">${pctOrDash(c.rate)}</td>` + (showTax ? `<td class="num">${pctOrDash(inv.tax)}</td>` : '')
        + shareCell(c.id, c.invested / total * 100) + '</tr>';
    });
    $('#current-table tbody').innerHTML = rows.join('')
      + `<tr class="total"><td>Total</td><td class="num">${S(r.totals.invested)}</td><td colspan="${3 + showYearly + showTax}"></td></tr>`;

    // Assets get their own table, shares measured against total assets.
    $('#assets-breakdown').hidden = !r.assetsCurrent.length;
    const aTotal = r.totals.assets || 1;
    const assetById = Object.fromEntries(data.assets.map((a) => [a.id, a]));
    $('#asset-current-table thead').innerHTML = '<tr><th>Asset</th><th class="num">Units</th><th class="num">Price per unit</th><th class="num">Expected growth</th>'
      + '<th class="num">Asset value</th><th class="share-col">Share of assets</th></tr>';
    $('#asset-current-table tbody').innerHTML = r.assetsCurrent.slice().sort((a, b) => b.value - a.value).map((c) => {
      const a = assetById[c.id] || {};
      return `<tr><td>${dot(c.id)}${esc(c.name)}</td><td class="num">${unitsText(a) || '–'}</td><td class="num">${unitPriceText(a) || '–'}</td>`
        + `<td class="num">${pctOrDash(c.rate)}</td><td class="num">${S(c.value)}</td>` + shareCell(c.id, c.value / aTotal * 100) + '</tr>';
    }).join('')
      + `<tr class="total"><td>Total</td><td colspan="3"></td><td class="num">${S(r.totals.assets)}</td><td></td></tr>`;
  }

  // Net worth at a row: investments with growth + assets (after tax when any tax is set).
  const netWorth = (row, tax) => (tax ? row.afterTax + row.assetsAfterTax : row.value + row.assets);

  function renderMilestones(r) {
    const el = $('#milestones');
    const tax = hasTax(), assets = data.assets.length > 0;
    $('#proj-note').textContent = (r.ageToday === null
      ? 'Add a date of birth in the profile to see milestones by age. Rows below are by calendar year.'
      : 'At your birthday each year. Invested counts only what you put in. With growth adds the expected rate of interest.')
      + (assets ? ' Assets grow at their own rate.' : '')
      + (tax ? ' After tax takes off the tax on gains.' : '');
    const box = (k, v, cls) => `<div><div class="k">${k}</div><div class="v ${cls || ''}">${S(v)}</div></div>`;
    el.innerHTML = r.milestones.map((m) => {
      const boxes = [box('Invested', m.putIn), box('With growth', m.value, 'accent')];
      if (assets) boxes.push(box('Assets', m.assets), box(tax ? 'Net worth after tax' : 'Net worth', netWorth(m, tax), 'strong'));
      else if (tax) boxes.push(box('After tax', m.afterTax));
      return `
      <div class="milestone tilt">
        <div class="k">${m.label}<small>${monthYear(m.date)}</small></div>
        <div class="pair n${boxes.length}">${boxes.join('')}</div>
        <table class="mini">
          <tr><th></th><th class="num">Invested</th><th class="num">With growth</th>${tax ? '<th class="num">After tax</th>' : ''}</tr>
          ${m.parts.map((p) => `<tr><td title="${esc(p.name)}">${dot(p.id)}${esc(p.name)}</td><td class="num">${S(p.putIn)}</td><td class="num"><b>${S(p.value)}</b></td>${tax ? `<td class="num">${S(p.afterTax)}</td>` : ''}</tr>`).join('')}
          ${m.assetParts.map((p, k) => `<tr class="${k ? '' : 'first-asset'}"><td title="${esc(p.name)}">${dot(p.id)}${esc(p.name)}</td><td class="num faint">asset</td><td class="num"><b>${S(p.value)}</b></td>${tax ? `<td class="num">${S(p.afterTax)}</td>` : ''}</tr>`).join('')}
        </table>
      </div>`;
    }).join('');
  }

  function renderProjTable(r) {
    const tax = hasTax(), assets = data.assets.length > 0;
    $('#yearly-note').textContent = `Investment cells: invested, then value with growth. Asset cells: value.${tax ? ' Totals also show after tax.' : ''} Scroll inside the box to see every year.`;
    const first = r.rows[0] || { parts: [], assetParts: [] };
    $('#proj-table thead').innerHTML = '<tr><th>When</th>'
      + first.parts.map((p) => `<th class="num">${dot(p.id)}${esc(p.name)}</th>`).join('')
      + first.assetParts.map((p) => `<th class="num asset-col">${dot(p.id)}${esc(p.name)}</th>`).join('')
      + `<th class="num">${assets ? 'Investments' : 'Total'}</th>${assets ? '<th class="num">Net worth</th>' : ''}</tr>`;
    const cell = (putIn, value) => `<td class="num"><span class="sub">${S(putIn)}</span><b>${S(value)}</b></td>`;
    $('#proj-table tbody').innerHTML = r.rows.map((row) => `<tr><td>${row.label}<span class="sub">${monthYear(row.date)}</span></td>`
      + row.parts.map((p) => cell(p.putIn, p.value)).join('')
      + row.assetParts.map((p) => `<td class="num asset-col"><b>${S(p.value)}</b></td>`).join('')
      + `<td class="num total-cell"><span class="sub">${S(row.putIn)}</span><b>${S(row.value)}</b>${tax ? `<span class="sub">after tax ${S(row.afterTax)}</span>` : ''}</td>`
      + (assets ? `<td class="num total-cell"><b>${S(row.value + row.assets)}</b>${tax ? `<span class="sub">after tax ${S(netWorth(row, true))}</span>` : ''}</td>` : '')
      + '</tr>').join('');
  }

  // Line chart: invested (clay) vs with growth (sage), hover crosshair.
  function renderChart(r) {
    const rows = r.rows;
    const W = 960, H = 320, L = 70, R = 20, T = 40, B = 40;
    const el = $('#chart');
    if (rows.length < 2) { el.innerHTML = ''; return; }
    if (!rows.some((row) => row.value > 0)) { el.innerHTML = '<p class="muted">Add an investment above to see the chart.</p>'; return; }
    const assets = data.assets.length > 0;
    rows.forEach((row) => { row.net = row.value + row.assets; });
    const maxV = Math.max(...rows.map((x) => (assets ? x.net : x.value))) * 1.05 || 1;
    const x = (i) => L + (i / (rows.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - v / maxV) * (H - T - B);
    const path = (key) => rows.map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ');
    const ticks = niceTicks(maxV, 6);
    const last = rows[rows.length - 1];
    const svg = `
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Invested versus with growth, year by year" font-size="12">
  <text x="${L}" y="20" font-size="15" font-weight="600" fill="var(--text)" class="display">By ${last.label.toLowerCase()} (${last.date.slice(0, 4)}): ${S(last.putIn)} invested grows to ${S(last.value)}${assets ? ` · net worth ${S(last.net)}` : ''}</text>
  ${ticks.map((t) => `<g><line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" fill="var(--text-2)">${S(t)}</text></g>`).join('')}
  <defs><linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
  <path class="area" d="${path('value')} L${x(rows.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z" fill="url(#g-area)"/>
  <path class="draw" pathLength="1" d="${path('putIn')}" fill="none" stroke="var(--muted-bar)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 0"/>
  <path class="draw" pathLength="1" d="${path('value')}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
  ${assets ? `<path class="draw" pathLength="1" d="${path('net')}" fill="none" stroke="var(--c4)" stroke-width="2.5" stroke-linecap="round"/>` : ''}
  ${rows.map((row, i) => (i % Math.ceil(rows.length / 8) === 0 || i === rows.length - 1) ? `<text x="${x(i)}" y="${H - 14}" text-anchor="middle" fill="var(--text-2)">${row.label}</text>` : '').join('')}
  <g font-size="12">
    ${assets ? `<rect x="${W - R - 350}" y="${T - 4}" width="12" height="12" fill="var(--c4)"/><text x="${W - R - 334}" y="${T + 7}" fill="var(--text-2)">Net worth</text>` : ''}
    <rect x="${W - R - 230}" y="${T - 4}" width="12" height="12" fill="var(--accent)"/><text x="${W - R - 214}" y="${T + 7}" fill="var(--text-2)">With growth</text>
    <rect x="${W - R - 120}" y="${T - 4}" width="12" height="12" fill="var(--muted-bar)"/><text x="${W - R - 104}" y="${T + 7}" fill="var(--text-2)">Invested</text>
  </g>
  <line id="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--text-3)" stroke-dasharray="3 3" visibility="hidden"/>
  <circle id="d1" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>
  <circle id="d2" r="5" fill="var(--muted-bar)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>
  <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/>
</svg>
<div class="tip" id="tip"></div>`;
    el.innerHTML = svg;
    const svgEl = $('svg', el), hit = $('#hit', el), tip = $('#tip', el);
    hit.addEventListener('mousemove', (e) => {
      const pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
      const i = Math.max(0, Math.min(rows.length - 1, Math.round((p.x - L) / (W - L - R) * (rows.length - 1))));
      const row = rows[i];
      $('#xh', el).setAttribute('x1', x(i)); $('#xh', el).setAttribute('x2', x(i)); $('#xh', el).setAttribute('visibility', 'visible');
      $('#d1', el).setAttribute('cx', x(i)); $('#d1', el).setAttribute('cy', y(row.value)); $('#d1', el).setAttribute('visibility', 'visible');
      $('#d2', el).setAttribute('cx', x(i)); $('#d2', el).setAttribute('cy', y(row.putIn)); $('#d2', el).setAttribute('visibility', 'visible');
      tip.style.display = 'block';
      tip.innerHTML = `<b>${row.label}</b> · ${monthYear(row.date)}<br>Invested ${S(row.putIn)}<br>With growth ${S(row.value)}<br>Growth ${S(row.value - row.putIn)}${assets ? `<br>Assets ${S(row.assets)}<br><b>Net worth ${S(row.net)}</b>` : ''}`;
      const box = el.getBoundingClientRect();
      let tx = e.clientX - box.left + 14, ty = e.clientY - box.top - 10;
      if (tx + tip.offsetWidth > box.width) tx = e.clientX - box.left - tip.offsetWidth - 14;
      tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
    });
    hit.addEventListener('mouseleave', () => {
      tip.style.display = 'none';
      ['#xh', '#d1', '#d2'].forEach((id) => $(id, el).setAttribute('visibility', 'hidden'));
    });
  }

  function niceTicks(max, n) {
    const raw = max / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
    const out = [];
    for (let v = step; v <= max; v += step) out.push(v);
    return out;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  load().catch((e) => showError('Could not load data: ' + e.message));
})();
