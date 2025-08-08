const apiBase = "/api"; // SWA managed functions
const pendingKey = "st_pending_entries";

// DOM refs
const metricEl = document.getElementById("metric");
const valueEl = document.getElementById("value");
const noteEl = document.getElementById("note");
const tsEl = document.getElementById("ts");
const entriesEl = document.getElementById("entries");
const todayCountsEl = document.getElementById("todayCounts");
const saveBtn = document.getElementById("saveBtn");
const refreshBtn = document.getElementById("refreshBtn");
const exportBtn = document.getElementById("exportBtn");
const flushBtn = document.getElementById("flushBtn");
const presetsEl = document.getElementById("presets");
const accidentRow = document.getElementById("accidentRow");
const energyRow = document.getElementById("energyRow");
const energySlider = document.getElementById("energy");
const locationEl = document.getElementById("location");
const severityEl = document.getElementById("severity");
const themeToggle = document.getElementById("themeToggle");

const historyRangeEl = document.getElementById('historyRange');
const historyListEl = document.getElementById('historyList');

function setNow() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - tzOffset*60000);
  tsEl.value = local.toISOString().slice(0,16);
}

// THEME: manual toggle stored in localStorage (applies data-theme on <html>)
(function initTheme(){
  try {
    const saved = localStorage.getItem('theme'); // "light" | "dark" | null
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
    updateThemeIcon();
  } catch {}
})();

function updateThemeIcon(){
  if (!themeToggle) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  themeToggle.textContent = isDark ? '☀️' : '🌙';
}

if (themeToggle) themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch {}
  updateThemeIcon();
});

// Config (external)
let CONFIG = null;
let metricMap = new Map();

async function loadConfig() {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    CONFIG = await res.json();
    console.info('[config] Loaded ./config.json');
  } catch (err) {
    console.warn('[config] Could not load ./config.json; using built-in defaults.', err);
    CONFIG = {
      metrics: [
        { id: 'stand_assisted', label: 'Stand (Assisted)' },
        { id: 'stand_unassisted', label: 'Stand (Unassisted)' },
        { id: 'drink', label: 'Drink Water' },
        { id: 'eat', label: 'Eat' },
        { id: 'notes', label: 'Notes' }
      ],
      presets: [
        { label: '+1 Stand (Unassisted)',       metric: 'stand_unassisted',      value: '+1', note: '' },
        { label: '+1 Walk Inside (Unassisted)', metric: 'walk_inside_unassisted', value: '+1', note: '' },
        { label: '+1 Panting',                   metric: 'panting',               value: '+1', note: '' },
        { label: '+1 Drink Water',               metric: 'drink',                 value: '+1', note: '' }
      ]
    };
  }

  metricMap = new Map(CONFIG.metrics.map(m => [m.id, m]));
  buildMetricSelect();
  buildPresets();
  onMetricChange();
}

function buildMetricSelect() {
  metricEl.innerHTML = '';
  for (const m of CONFIG.metrics) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    metricEl.appendChild(opt);
  }
}

function buildPresets() {
  presetsEl.innerHTML = '';
  for (const p of (CONFIG.presets || [])) {
    const btn = document.createElement('button');
    btn.className = 'preset';
    btn.dataset.metric = p.metric;
    if (p.value != null) btn.dataset.value = String(p.value);
    if (p.note != null) btn.dataset.note = String(p.note);
    btn.textContent = p.label;
    presetsEl.appendChild(btn);
  }
}

metricEl.addEventListener("change", onMetricChange);
function onMetricChange() {
  const id = metricEl.value;
  const def = metricMap.get(id) || {};
  // Accident-specific extras
  accidentRow.style.display = def.showAccidentExtras ? '' : 'none';
  // Energy slider
  if (def.energyScale) {
    energyRow.style.display = '';
    energySlider.min = def.energyScale.min ?? 0;
    energySlider.max = def.energyScale.max ?? 5;
    energySlider.step = def.energyScale.step ?? 1;
    if (!valueEl.value) {
      energySlider.value = String(def.energyScale.default ?? 3);
      valueEl.value = String(def.energyScale.default ?? 3);
    }
  } else {
    energyRow.style.display = 'none';
  }
}

// Preset clicks
presetsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button.preset");
  if (!btn) return;
  metricEl.value = btn.dataset.metric;
  valueEl.value = btn.dataset.value || "";
  noteEl.value = btn.dataset.note || "";
  onMetricChange();
  saveEntry();
});

// Utils
function fmtDate(s) {
  const d = new Date(s);
  return d.toLocaleString();
}
function pill(label) {
  const span = document.createElement("span");
  span.className = "pill";
  span.textContent = label;
  return span;
}
function pillForMetric(metricId){
  const span = document.createElement('span');
  span.className = 'pill';
  span.textContent = metricId;
  // If config has a group later, we can add class for color coding
  const def = metricMap.get(metricId);
  if (def && def.group) span.classList.add(`pill--${def.group}`);
  return span;
}

// History helpers
function isoDay(d) { return d.toISOString().slice(0,10); }
function daysArray(n) {
  const out = [];
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(end); dt.setUTCDate(end.getUTCDate() - i);
    out.push(isoDay(dt));
  }
  return out;
}
function rollupCountsByDay(items) {
  const byDay = new Map();
  for (const e of (items || [])) {
    const key = new Date(e.ts).toISOString().slice(0,10);
    if (!byDay.has(key)) byDay.set(key, {});
    const bucket = byDay.get(key);
    bucket[e.metric] = (bucket[e.metric] || 0) + 1;
  }
  return byDay;
}
function seriesForMetric(metricId, days, byDay) {
  const vals = [];
  for (const d of days) {
    const bucket = byDay.get(d) || {};
    vals.push(bucket[metricId] || 0);
  }
  return vals;
}
function sparklineSVG(values, w = 180, h = 28) {
  if (!values.length) return "";
  const max = Math.max(...values), min = Math.min(...values);
  const sx = (i) => (values.length === 1) ? 1 : (i / (values.length - 1)) * (w - 2) + 1;
  const sy = (v) => {
    if (max === min) return h / 2;
    return h - 1 - ((v - min) / (max - min)) * (h - 2);
  };
  const pts = values.map((v,i)=>`${sx(i)},${sy(v)}`).join(" ");
  const last = values[values.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}"/><circle cx="${sx(values.length-1)}" cy="${sy(last)}" r="2" /></svg>`;
}

// History render/load
async function loadHistory() {
  historyListEl.innerHTML = "<div class='empty'>Loading…</div>";
  const days = parseInt(historyRangeEl.value || '30', 10);
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  const params = new URLSearchParams({ from: from.toISOString(), to: now.toISOString() });
  const res = await fetch(`${apiBase}/entries?${params.toString()}`);
  if (!res.ok) { historyListEl.innerHTML = "<div class='empty'>Failed to load history.</div>"; return; }
  const data = await res.json();
  renderHistory(data.items || [], days);
}
function renderHistory(items, daysBack) {
  const days = daysArray(daysBack);
  const byDay = rollupCountsByDay(items);
  const totals = new Map();
  for (const e of (items || [])) totals.set(e.metric, (totals.get(e.metric) || 0) + 1);

  const metricIds = (CONFIG.metrics || []).map(m => m.id);
  const top = metricIds.filter(id => totals.get(id) > 0)
                       .sort((a,b) => (totals.get(b)||0) - (totals.get(a)||0))
                       .slice(0, 8);

  historyListEl.innerHTML = '';
  if (top.length === 0) {
    historyListEl.innerHTML = "<div class='empty'>No history for this period.</div>";
    return;
  }
  for (const id of top) {
    const def = metricMap.get(id) || { label: id };
    const series = seriesForMetric(id, days, byDay);
    const last = series.length ? series[series.length - 1] : 0;

    const row = document.createElement('div');
    row.className = 'history-row';

    const name = document.createElement('h3');
    name.textContent = def.label || id;
    row.appendChild(name);

    const spark = document.createElement('div');
    spark.className = 'spark';
    spark.innerHTML = sparklineSVG(series);
    row.appendChild(spark);

    const lastDiv = document.createElement('div');
    lastDiv.className = 'mono';
    lastDiv.textContent = String(last);
    row.appendChild(lastDiv);

    historyListEl.appendChild(row);
  }
}

function updateEntriesHeader() {
  const days = parseInt(historyRangeEl.value || '30', 10);
  const h2 = document.getElementById('entriesHeader');
  if (h2) h2.textContent = `Entry Details (last ${days} days)`;
}
historyRangeEl.addEventListener('change', () => {
  updateEntriesHeader();
  loadHistory();
  refresh();
});

// Offline queue helpers
function loadPending() { try { return JSON.parse(localStorage.getItem(pendingKey) || "[]"); } catch { return []; } }
function savePending(arr) { localStorage.setItem(pendingKey, JSON.stringify(arr)); }
async function flushPending() {
  const queue = loadPending();
  if (!queue.length) return;
  const remain = [];
  for (const body of queue) {
    try {
      const res = await fetch(`${apiBase}/entry`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("fail");
    } catch {
      remain.push(body);
    }
  }
  savePending(remain);
  await refresh();
  alert(remain.length ? `Synced ${queue.length - remain.length}, ${remain.length} left` : `All pending entries synced`);
}
window.addEventListener("online", flushPending);
setInterval(flushPending, 30000);

// Save / delete
async function saveEntry() {
  const metric = metricEl.value;
  let value = valueEl.value || '';
  const noteParts = [];
  const def = metricMap.get(metric) || {};
  if (def.energyScale) value = energySlider.value;
  if (def.showAccidentExtras) {
    if (locationEl.value) noteParts.push(`location:${locationEl.value}`);
    if (severityEl.value) noteParts.push(`size:${severityEl.value}`);
  }
  const extra = noteParts.join(' ');
  const note = [noteEl.value || '', extra].filter(Boolean).join(' ').trim();
  const localIso = new Date(tsEl.value).toISOString();
  const body = { metric, value, note, ts: localIso };

  try {
    const res = await fetch(`${apiBase}/entry`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("save failed");
  } catch {
    const q = loadPending();
    q.push(body);
    savePending(q);
  }
  valueEl.value = ""; noteEl.value = ""; locationEl.value = ""; severityEl.value = "";
  setNow();
  await refresh();
}

async function deleteEntry(partitionKey, rowKey) {
  if (!confirm("Delete this entry?")) return;
  const res = await fetch(`${apiBase}/entry/${encodeURIComponent(partitionKey)}/${encodeURIComponent(rowKey)}`, { method: "DELETE" });
  if (!res.ok) { alert("Failed to delete."); return; }
  await refresh();
}

// Today summary + entries
function summarizeToday(entries) {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);
  const today = entries.filter(e => {
    const t = new Date(e.ts);
    return t >= start && t <= end;
  });
  const counts = {};
  for (const e of today) counts[e.metric] = (counts[e.metric] || 0) + 1;

  todayCountsEl.innerHTML = "";
  const keys = Object.keys(counts).sort();
  if (keys.length === 0) {
    document.getElementById('summaryEmpty')?.style && (document.getElementById('summaryEmpty').style.display = '');
    return;
  }
  document.getElementById('summaryEmpty')?.style && (document.getElementById('summaryEmpty').style.display = 'none');
  for (const k of keys) {
    const div = document.createElement("div");
    div.textContent = `${k}: ${counts[k]}`;
    todayCountsEl.appendChild(div);
  }
}

async function refresh() {
  entriesEl.innerHTML = "<div class='empty'>Loading…</div>";
  const params = new URLSearchParams();
  const now = new Date();
  const days = parseInt(historyRangeEl.value || '30', 10);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  params.set("from", start.toISOString());
  params.set("to", now.toISOString());
  const res = await fetch(`${apiBase}/entries?${params.toString()}`);
  if (!res.ok) { entriesEl.innerHTML = "<div class='empty'>Failed to load.</div>"; return; }
  const data = await res.json();

  entriesEl.innerHTML = "";
  if (!data.items || !data.items.length) {
    summarizeToday([]);
    entriesEl.innerHTML = "<div class='empty'>No entries in this period.</div>";
    return;
  }
  summarizeToday(data.items || []);
  (data.items || []).sort((a,b) => a.ts > b.ts ? -1 : 1).forEach(e => {
    const div = document.createElement("div");
    div.className = "entry";
    const h = document.createElement("div");
    h.appendChild(pillForMetric(e.metric));
    if (e.value) h.appendChild(pill(e.value));
    div.appendChild(h);

    const t = document.createElement("div");
    t.className = "muted";
    t.textContent = fmtDate(e.ts);
    div.appendChild(t);

    if (e.note) {
      const n = document.createElement("div");
      n.textContent = e.note;
      div.appendChild(n);
    }

    const actions = document.createElement("div");
    actions.className = "flex";
    const del = document.createElement("button");
    del.className = "iconbtn danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteEntry(e.partitionKey, e.id));
    actions.appendChild(del);
    div.appendChild(actions);

    entriesEl.appendChild(div);
  });
}

// Wire events
saveBtn.addEventListener("click", saveEntry);
refreshBtn.addEventListener("click", refresh);
exportBtn.addEventListener("click", async () => {
  const days = parseInt(historyRangeEl.value || '30', 10);
  const res = await fetch(`${apiBase}/export?days=${encodeURIComponent(days)}`);
  if (!res.ok) { alert("Failed to export"); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "stella_export.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});
flushBtn.addEventListener("click", flushPending);

// Init
setNow();
loadConfig();
refresh();
loadHistory();
updateEntriesHeader();