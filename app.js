// ---------- Model ----------

const KEY = 'dosify';
// Model:
// · timings: dose timings, in stored order (never reordered): { id (random), name, start, end (hours),
//   visible, order: [product ids in record order] }. If none is valid, those of DEFAULT_TIMINGS (to have
//   more by default just add another one there) with new ids.
// · products: in product order: { id, name, notes (directions), refs (references), memo (free notes),
//   cost (€ per container) and units (doses per container), integers or '', created and updated (ISO: when it was
//   created and when it was last saved), and schedules: [{ dose (starts with the
//   amount of each dose), start, days, timings: [ids of the timings it is taken at; at least one] }]. Without
//   schedules a product does not show on the home screen.
// · records: doses taken: { at, day, id (product), timing (timing id), name, dose, notes (the product as it was taken) }
const DEFAULT_TIMINGS = [
  { name: 'Desayuno', start: 6, end: 12 },
  { name: 'Almuerzo', start: 12, end: 18 },
  { name: 'Cena', start: 18, end: 24 },
  { name: 'Demanda', start: '', end: '' },
];
// All ids (timings, products) are random.
const newId = () => crypto.randomUUID().slice(0, 8);
const defaultTimings = () => DEFAULT_TIMINGS.map(d => ({ id: newId(), ...d, visible: true, order: [] }));
const timingIds = () => state.timings.map(ti => ti.id);
const TEXT = ['name', 'notes', 'refs', 'memo'];
const DAYS = 7; // past days always shown
const DAYS_MAX = 30; // how far back days with records are shown
const RECORDS_MAX = 1000;

// ---------- Helpers: DOM, text, storage ----------

const $ = (sel, root = document) => root.querySelector(sel);
const str = v => v == null ? '' : String(v);
const load = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Plain text with line breaks and clickable links (http, https or www.) that open in a new tab.
const lines = text => esc(text).replace(/\n/g, '<br>');
const linkify = text => lines(text).replace(/(https?:\/\/|www\.)[^\s<]*[^\s<.,;:)]/g, url => `<a href="${url.startsWith('http') ? url : `https://${url}`}" target="_blank" rel="noopener">${url}</a>`);
const empty = text => `<ion-item lines="none"><ion-label color="medium" class="ion-text-center">${text}</ion-label></ion-item>`;
const emptyList = text => `<ion-list inset="true">${empty(text)}</ion-list>`;
// Shared dialogs: an action sheet with options + «Cancelar» (onCancel runs if dismissed without choosing) and a confirm alert.
function sheet(header, buttons, onCancel) {
  const el = $('#sheet');
  el.header = header;
  el.buttons = [...buttons, { text: 'Cancelar', role: 'cancel' }];
  el.present();
  if (onCancel) el.onDidDismiss().then(({ role }) => role === 'cancel' || role === 'backdrop' ? onCancel() : null);
}
function ask(header, handler) {
  const alert = $('#confirm');
  alert.header = header;
  alert.message = '';
  alert.buttons = [{ text: 'Cancelar', role: 'cancel' }, { text: 'Aceptar', role: 'destructive', handler }];
  alert.present();
}

// ---------- Dates and times ----------

const dayKey = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const fromKey = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => dayKey(new Date());
// Dates and times shown to the user, one rule everywhere: the first figure without zero padding, the inner ones with it
// («9/02», «5:06»), and the year only when it is not the current one («9/02/2027»). Keys are «YYYY-MM-DD»; `at` is ISO.
const otherYear = key => key.slice(0, 4) !== today().slice(0, 4);
const dayMonth = key => `${Number(key.slice(8, 10))}/${key.slice(5, 7)}`; // only where the year is already shown (PDF rows)
const shortDate = key => otherYear(key) ? `${dayMonth(key)}/${key.slice(0, 4)}` : dayMonth(key);
const longDate = (key, weekday = true) => fromKey(key).toLocaleDateString('es', { ...(weekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'long', ...(otherYear(key) ? { year: 'numeric' } : {}) });
const monthName = key => { const t = fromKey(`${key.slice(0, 7)}-01`).toLocaleDateString('es', { month: 'long' }); return `${t[0].toUpperCase()}${t.slice(1)}${otherYear(key) ? ` ${key.slice(0, 4)}` : ''}`; };
const time = iso => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const dateTime = iso => `${longDate(dayKey(new Date(iso)), false)} a las ${time(iso)}`; // «23 de octubre a las 6:02»
// Time spans in plain words, on a scale of days, weeks, months and years («3 días», «2 semanas», «1 mes»).
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const daysText = days => days < 7 ? count(days, 'día', 'días') : days < 30 ? count(Math.floor(days / 7), 'semana', 'semanas')
  : days < 365 ? count(Math.floor(days / 30), 'mes', 'meses') : count(Math.floor(days / 365), 'año', 'años');
// How long ago: «Hace un momento», «Hace 3 minutos», «Hace 2 horas», «Ayer», «Hace 2 semanas»…
function relative(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso)) / 60000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  if (minutes < 1) return 'Hace un momento';
  if (hours < 1) return `Hace ${count(minutes, 'minuto', 'minutos')}`;
  if (days < 1) return `Hace ${count(hours, 'hora', 'horas')}`;
  return days === 1 ? 'Ayer' : `Hace ${daysText(days)}`;
}
// How far ahead, in days: «Hoy», «Mañana», «Dentro de 3 semanas»…
const until = days => days <= 0 ? 'Hoy' : days === 1 ? 'Mañana' : `Dentro de ${daysText(days)}`;

// ---------- Data: validation and cleaning ----------

// Whole hour from 0 to 24 or '' (no hour); null if invalid.
const hour = v => { const t = String(v ?? '').trim(); return t === '' ? '' : /^\d{1,2}$/.test(t) && Number(t) <= 24 ? Number(t) : null; };

const asText = v => typeof v === 'string' ? v : '';
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
const stamp = v => { const t = new Date(v ?? ''); return isNaN(t) ? '' : t.toISOString(); }; // ISO timestamp or ''
const asList = v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
// Names of the failing checks: [['field', ok], …] → ['field', …].
const failing = checks => checks.filter(([, ok]) => !ok).map(([f]) => f);
// Integer ≥ min or '' (empty); null if something else was written.
const int = (v, min = 0) => { const t = String(v ?? '').trim(); return t === '' ? '' : /^\d+$/.test(t) && Number(t) >= min ? Number(t) : null; };
// Amount of each dose: the number the dose starts with («1 comprimido», «0,5 ml»); 0 if it does not start with one.
const amount = dose => Number(String(dose).match(/^\s*(\d+(?:[.,]\d+)?)/)?.[1].replace(',', '.')) || 0;
// Valid schedules (numeric dose, date, duration and at least one existing timing), ordered by start date and,
// on equal dates, by duration; incomplete ones are dropped.
const cleanSchedules = (v, ids = timingIds()) => (Array.isArray(v) ? v : []).map(p => p && typeof p === 'object' ? { dose: p.dose, start: p.start, days: p.days, timings: ids.filter(id => asList(p.timings).includes(id)) } : null)
  .filter(p => p && amount(p.dose) && date(p.start) && Number.isInteger(p.days) && p.days >= 1 && p.timings.length).sort((a, b) => a.start.localeCompare(b.start) || a.days - b.days);
// Cleans stored or imported data: whatever is missing or wrong takes its default and records that cannot be
// understood are dropped. No compatibility with older formats.
function clean(raw) {
  const arr = v => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
  // Timings: the stored ones with an id, in order (name, hours and visibility defaulted if missing); if none
  // is left, the defaults with new ids.
  const saved = arr(raw?.timings).filter(ti => asText(ti.id)).map(ti => ({ id: ti.id, name: asText(ti.name), start: hour(ti.start) ?? '', end: hour(ti.end) ?? '',
    visible: typeof ti.visible === 'boolean' ? ti.visible : true, order: asList(ti.order) }));
  const timings = saved.length ? saved : defaultTimings();
  const ids = timings.map(ti => ti.id);
  // Products: dropped without a name; a new id if missing; only valid schedules with existing timings; created and
  // updated default to now and to created.
  const now = new Date().toISOString();
  const products = arr(raw?.products).filter(m => asText(m.name)).map(m => { const created = stamp(m.created) || now; return {
    id: asText(m.id) || newId(), name: m.name, notes: asText(m.notes), refs: asText(m.refs), memo: asText(m.memo),
    cost: int(m.cost) ?? '', units: int(m.units, 1) ?? '', created, updated: stamp(m.updated) || created, schedules: cleanSchedules(m.schedules, ids),
  }; });
  for (const ti of timings) ti.order = ti.order.filter(id => products.some(m => m.id === id));
  // Records: need a valid day, an existing timing and a valid date; the rest are dropped. Newest first, at most RECORDS_MAX.
  const records = arr(raw?.records).filter(e => date(e.day) && ids.includes(e.timing) && !isNaN(new Date(e.at)))
    .map(e => ({ at: new Date(e.at).toISOString(), day: e.day, id: asText(e.id) || null, timing: e.timing, name: asText(e.name), dose: asText(e.dose), notes: asText(e.notes) }))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECORDS_MAX);
  return { timings, products, records };
}
const state = clean(load(KEY));
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const commit = () => { save(); render(); };

// ---------- Timings ----------

const timingOf = id => state.timings.find(ti => ti.id === id);
const productOf = id => state.products.find(m => m.id === id);
const visibleTimings = () => state.timings.filter(ti => ti.visible);
const visibleOf = ids => ids.filter(id => timingOf(id).visible);
const hours = ti => ti.start !== '' && ti.end !== '' ? `${ti.start}–${ti.end} h` : ti.start !== '' ? `desde las ${ti.start} h` : ti.end !== '' ? `hasta las ${ti.end} h` : '';
const label = id => { const ti = timingOf(id); return ti.name || hours(ti) || 'Sin nombre'; };
// Does hour h fall in the timing? Supports timings crossing midnight (e.g. 22–6).
const within = (ti, h) => ti.start === '' || ti.end === '' ? false : ti.start <= ti.end ? h >= ti.start && h < ti.end : h >= ti.start || h < ti.end;
// Current timing of a list: the one containing the current hour; else the next to start; if none has
// hours, the first one.
function timingNow(list = visibleTimings()) {
  const h = new Date().getHours();
  const next = list.filter(ti => ti.start !== '').sort((a, b) => (a.start - h + 24) % 24 - (b.start - h + 24) % 24)[0];
  return (list.find(ti => within(ti, h)) ?? next ?? list[0])?.id ?? '';
}

// ---------- Schedules, doses and records of a day ----------

const addDays = (key, n) => { const d = fromKey(key); d.setDate(d.getDate() + n); return dayKey(d); };
// Record order of a timing: its «order» list; products not in it go after, in product order.
const pos = (m, timing) => { const i = timingOf(timing).order.indexOf(m.id); return i < 0 ? Infinity : i; };
const byTiming = (products, timing) => [...products].sort((a, b) => pos(a, timing) - pos(b, timing));
// Schedule of a day: the last one started on or before that day (a later start cuts the previous one),
// if its duration reaches that day. A product shows on the home screen only on days covered by a schedule, at its
// timings and with its dose; without schedules it does not show.
const scheduleEnd = p => addDays(p.start, p.days - 1);
const scheduleOn = (m, day) => { const p = m.schedules.filter(p => p.start <= day).at(-1); return p && day <= scheduleEnd(p) ? p : null; };
const onDay = (m, day) => !!scheduleOn(m, day);
const doseOn = (m, day) => scheduleOn(m, day)?.dose ?? '';
// Timings that apply on a day: those of that day's schedule (or, if none applies, the last one's); without
// schedules, none.
const timingsOn = (m, day) => (scheduleOn(m, day) ?? m.schedules.at(-1))?.timings ?? [];
const doses = (timing, day) => byTiming(state.products.filter(m => timingsOn(m, day).includes(timing) && onDay(m, day)).map(m => ({ ...m, dose: doseOn(m, day) })), timing);
// Each record stores the product's name, dose and notes as taken; so the history shows what was taken even if
// the product changes or is deleted.
const SNAP = ['name', 'dose', 'notes'];
const snap = m => Object.fromEntries(SNAP.map(k => [k, m[k]]));
const snapOn = (m, day, dose = '') => ({ ...snap(m), dose: doseOn(m, day) || dose }); // the product as taken on that day (no schedule: the given dose)
const takenAs = e => ({ id: e.id, ...snap(e) });
// A record is identified by product, timing and day.
const recordOf = (id, timing, day) => state.records.find(e => e.id === id && e.timing === timing && e.day === day);
const recordsOfProduct = id => state.records.filter(e => e.id === id);
const addRecord = (m, timing, day, at = new Date()) => state.records.unshift({ at: at.toISOString(), day, id: m.id, timing, ...snapOn(m, day) });
const removeRecord = (id, timing, day) => { state.records = state.records.filter(e => !(e.id === id && e.timing === timing && e.day === day)); };
// Rows of a day and timing: pending (current products without a record) and taken (their records, including products no
// longer in the timing or deleted).
function dayRows(timing, day) {
  const records = state.records.filter(e => e.day === day && e.timing === timing);
  const pending = doses(timing, day).filter(m => !records.some(e => e.id === m.id));
  return { pending, taken: records.map(e => ({ ...takenAs(e), record: e })) };
}

// ---------- Home ----------

const selectedDay = () => $('#day').value || today();
const selectedTiming = () => $('#timing').value;
// Checking a dose adds a record with the product as it is that day; unchecking removes it.
function toggle(id, timing, checked) {
  if (checked) addRecord(productOf(id), timing, selectedDay()); else removeRecord(id, timing, selectedDay());
  commit();
}

// Progress ring with a caption inside.
const ring = (done, total, caption, size = 44, font = 11) => `
  <ion-text color="primary">
    <svg width="${size}" height="${size}" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="15.915" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="4"></circle>
      <circle cx="22" cy="22" r="15.915" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="${total ? done / total * 100 : 0} 100" transform="rotate(-90 22 22)"></circle>
      <text x="22" y="22" text-anchor="middle" dominant-baseline="central" font-size="${font}" font-weight="bold" fill="currentColor">${caption}</text>
    </svg>
  </ion-text>`;


// Always the last DAYS days and today (last and selected on load); up to DAYS_MAX days back, also the days
// with a record. The selected day is kept so it does not vanish when its last record is unchecked.
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
function renderDays() {
  const recent = Array.from({ length: DAYS + 1 }, (_, i) => daysAgo(DAYS - i));
  const recorded = state.records.map(e => e.day).filter(day => day >= daysAgo(DAYS_MAX));
  const keys = [...new Set([...recorded, ...recent, $('#day').value].filter(Boolean))].sort();
  $('#day').innerHTML = keys.map(key => {
    const d = fromKey(key);
    const rows = visibleTimings().map(ti => dayRows(ti.id, key));
    const done = rows.reduce((n, r) => n + r.taken.length, 0), total = rows.reduce((n, r) => n + r.taken.length + r.pending.length, 0);
    return `
      <ion-segment-button value="${key}" layout="icon-bottom">
        ${ring(done, total, `${done}/${total}`)}
        <ion-label>${d.toLocaleDateString('es', { weekday: 'narrow' })} ${shortDate(key)}</ion-label>
      </ion-segment-button>`;
  }).join('');
}

let timingTabsHtml = '';
// Home tabs: only visible timings with something that day (a pending product or a record). If the selected
// one is gone, switch to the current one among those left.
const dayTimings = day => visibleTimings().filter(ti => { const r = dayRows(ti.id, day); return r.pending.length || r.taken.length; });
function renderTimingTabs() {
  const timings = dayTimings(selectedDay());
  const html = timings.map(ti => `<ion-segment-button value="${ti.id}"><ion-label>${esc(label(ti.id))}</ion-label></ion-segment-button>`).join('');
  if (html !== timingTabsHtml) $('#timing').innerHTML = timingTabsHtml = html; // only when it changes: keeps the selection, no flicker
  if (!timings.some(ti => ti.id === $('#timing').value)) $('#timing').value = timingNow(timings);
}

// Product text: name (medium weight), dose (main text) and notes (grey, clipped to about two lines).
const brief = text => { const t = text.split('\n').slice(0, 2).join(' '); return t.length > 80 ? `${t.slice(0, 80).trimEnd()}…` : t; };
const doseLine = text => text ? `<p><ion-text color="dark">${esc(text)}</ion-text></p>` : '';
const notesLine = m => m.notes ? `<p>${esc(brief(m.notes))}</p>` : '';

// The (i) of a row opens the product view (read only); its color warns of the container end, or is grey if the
// product was deleted.
const viewButton = id => `
      <ion-button slot="end" fill="clear" data-view="${id}" aria-label="Ver producto">
        <ion-icon slot="icon-only" name="information-circle" color="${productOf(id) ? supplyColor(id) : 'medium'}" size="large"></ion-icon>
      </ion-button>`;
// Dose row. If already taken, shows the time next to the dose; while sorting, the (i) gives way to the handle.
const doseItem = (m, timing, record, sorting) => `
    <ion-item data-id="${m.id}">
      <ion-checkbox slot="start" aria-label="${esc(m.name)}" data-id="${m.id}" data-timing="${timing}" ${record ? 'checked' : ''} ${sorting ? 'disabled' : ''}></ion-checkbox>
      <ion-label class="ion-text-wrap">
        <h2 class="medium">${esc(m.name)}</h2>
        ${doseLine([record && time(record.at), m.dose].filter(Boolean).join(' · '))}
        ${notesLine(m)}
      </ion-label>
      ${sorting ? '<ion-reorder slot="end"></ion-reorder>' : viewButton(m.id)}
    </ion-item>`;
// Each dose goes in its own inset list: independent rows.
const doseRow = (m, timing, record) => `<ion-list inset="true">${doseItem(m, timing, record)}</ion-list>`;

// Header button of a section (Pending, Taken).
// Icon button of a list header.
const headerButton = (id, icon, title) => `<ion-button id="${id}" fill="clear" aria-label="${title}"><ion-icon slot="icon-only" name="${icon}"></ion-icon></ion-button>`;

// «Pendiente»: its button toggles sort mode; the order set applies to that timing on any day.
let sortingPending = false;

// «Tomas»: its button opens an action sheet to choose the order; the icon shows the chosen one.
// Not stored: the app always starts in record order.
const SORTS = {
  records: { icon: 'reorder-three-outline', label: 'Orden de tomas' },
  recent: { icon: 'arrow-up-outline', label: 'Más reciente arriba' },
  oldest: { icon: 'arrow-down-outline', label: 'Más reciente abajo' },
  products: { icon: 'list-outline', label: 'Orden de productos' },
};
let sortMode = 'records';

const chooseSort = () => sheet('Ordenar tomas', Object.entries(SORTS).map(([key, o]) => (
  { text: o.label, role: key === sortMode ? 'selected' : undefined, handler: () => { sortMode = key; renderHome(); } })));
// Position in product order; records of deleted products go last.
const productIndex = id => { const i = state.products.findIndex(m => m.id === id); return i < 0 ? Infinity : i; };
const byProducts = (a, b) => (productIndex(a.id) - productIndex(b.id)) || 0; // NaN when both are deleted
const sortTaken = (rows, timing) => [...rows].sort(
  sortMode === 'records' ? (a, b) => (pos(a, timing) - pos(b, timing)) || byProducts(a, b)
  : sortMode === 'products' ? byProducts
  : (a, b) => a.record.at.localeCompare(b.record.at) * (sortMode === 'oldest' ? 1 : -1));

// Moves an item from position «from» to «to» (ionReorderEnd detail; «to» is missing if it did not move).
const move = (list, { from, to = from }) => { const l = [...list]; l.splice(to, 0, ...l.splice(from, 1)); return l; };

// Sorting «Pendiente» moves those products among the positions they occupy in the timing (taken ones do not move)
// and stores the timing's full order.
function reorderPending(timing, moved) {
  const all = byTiming(state.products.filter(m => timingsOn(m, selectedDay()).includes(timing)), timing);
  const ids = new Set(moved.map(m => m.id));
  let i = 0;
  timingOf(timing).order = all.map(m => ids.has(m.id) ? moved[i++].id : m.id);
  save();
}

const setScroll = (sc, y) => { sc.scrollTop = y; requestAnimationFrame(() => { sc.scrollTop = y; }); };
// Keeps an ion-content's scroll when re-rendering: saves it, renders and restores it once Ionic has drawn the rows.
async function keepScroll(content, paint) {
  const scroller = await content.getScrollElement();
  const y = scroller.scrollTop;
  paint();
  await Promise.all([...content.querySelectorAll('ion-item')].map(el => el.componentOnReady?.()));
  setScroll(scroller, y);
}

async function renderHome() {
  const day = selectedDay();
  const timing = selectedTiming();
  if (!timing) { $('#home').innerHTML = emptyList(visibleTimings().length ? 'Nada que tomar este día.' : 'No hay momentos visibles. Actívalos en Productos › Momentos.'); return; }
  const { pending, taken: takenRows } = dayRows(timing, day);
  const taken = sortTaken(takenRows, timing);
  const done = taken.length, total = pending.length + taken.length;

  // Keeps the scroll position when re-rendering (e.g. when checking a dose at the end of the list).
  await keepScroll($('#home'), () => { $('#home').innerHTML = `
    <ion-list inset="true">
      <ion-item lines="none">
        <div slot="start">${ring(done, total, `${total ? Math.round(done / total * 100) : 0}%`, 88, 8.5)}</div>
        <ion-label>
          <h2>${done} de ${total} tomadas</h2>
          <p>${day === today() ? 'hoy, ' : ''}${longDate(day)}</p>
        </ion-label>
      </ion-item>
    </ion-list>
    <ion-list-header>
      <ion-label>Pendiente</ion-label>
      ${headerButton('pending-sort', sortingPending ? 'checkmark-outline' : 'swap-vertical-outline', sortingPending ? 'Terminar de ordenar' : 'Ordenar')}
    </ion-list-header>
    ${!pending.length ? emptyList('Nada pendiente.') : sortingPending
      ? `<ion-list inset="true"><ion-reorder-group id="pending-list" disabled="false">${pending.map(m => doseItem(m, timing, null, true)).join('')}</ion-reorder-group></ion-list>`
      : pending.map(m => doseRow(m, timing)).join('')}
    <ion-list-header>
      <ion-label>Tomas</ion-label>
      ${headerButton('taken-sort', SORTS[sortMode].icon, SORTS[sortMode].label)}
    </ion-list-header>
    ${taken.map(m => doseRow(m, timing, m.record)).join('') || emptyList('Sin tomas.')}`; });
}

// ---------- Products ----------

const manager = $('#manager');
const EMPTY_PRODUCT = { name: '', notes: '', refs: '', memo: '', cost: '', units: '', schedules: [] };
// New product with its timestamps. Saving one (editor or assistant) stamps «updated» even with nothing changed, and its
// records from today on (all of them with `all`) copy the product again, the dose re-read from the schedule.
const newProduct = values => { const now = new Date().toISOString(); return { id: newId(), ...values, created: now, updated: now }; };
function updateProduct(m, values, all = false) {
  Object.assign(m, values, { updated: new Date().toISOString() });
  for (const e of recordsOfProduct(m.id)) if (all || e.day >= today()) Object.assign(e, snapOn(m, e.day, e.dose));
}
const deleteProduct = id => { state.products = state.products.filter(m => m.id !== id); for (const ti of state.timings) ti.order = ti.order.filter(x => x !== id); };
// Last change of a product, for Estadísticas: date and time as title and, below, how long ago.
const updatedLabel = m => m ? `<ion-label><p>Últimos cambios</p><h2>${dateTime(m.updated)}</h2><p>${relative(m.updated)}</p></ion-label>` : readLabel('Últimos cambios', '');

// A product is paused when it has no current or future schedule (also when it has none): it goes in the
// paused list, in grey, without costs.
const paused = m => !scheduleOn(m, today()) && !m.schedules.some(p => p.start > today());
// Schedule line in the list: the dose and the visible timings, dot separated («1 cápsula ·
// Desayuno · Almuerzo»), of today's schedule (or the last one); without schedules, «Sin pauta».
const scheduleText = m => { const p = scheduleOn(m, today()) ?? m.schedules.at(-1); return p ? [p.dose, ...visibleOf(p.timings).map(label)].map(esc).join(' · ') : 'Sin pauta'; };

// Product row: name (with the container end on the right), today's schedule (dose and timings), the notes
// in grey and the costs.
// Dot before the name in the product list, only if the product was saved since Products was opened this time. The
// snapshot is taken each time Products opens, so going back home resets it.
let updatedAtOpen = new Map();
const snapshotUpdated = () => { updatedAtOpen = new Map(state.products.map(m => [m.id, m.updated])); };
const changedDot = m => updatedAtOpen.get(m.id) === m.updated ? '' : '<span class="dot"></span>';
const productRow = m => { const off = paused(m), cost = off ? '' : costLine(m); return `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap"${off ? ' color="medium"' : ''}>
      ${off ? '' : endNote(m.id)}
      <h2 class="medium">${changedDot(m)}${esc(m.name)}</h2>
      <p>${off ? scheduleText(m) : `<ion-text color="dark">${scheduleText(m)}</ion-text>`}</p>
      ${notesLine(m)}
      ${cost ? `<p><ion-text color="teal" class="medium">${cost}</ion-text></p>` : ''}
    </ion-label>
    ${off ? '' : '<ion-reorder slot="end"></ion-reorder>'}
  </ion-item>`; };

// ---------- Figures: every calculation about a product, in one place ----------

const monthDays = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
const daysLeft = end => Math.round((fromKey(end) - fromKey(today())) / 864e5);
const dosesSum = records => records.reduce((n, e) => n + amount(e.dose), 0);
// Doses per day: the amount of today's dose for each visible timing of today's schedule.
const perDayUnits = m => amount(doseOn(m, today())) * visibleOf(timingsOn(m, today())).length;
const SOON_DAYS = 7, SHOP_DAYS = 14;
// What is known about a product from its schedules, cost, container and records (null when it cannot be computed):
// · costPerDay = cost / units × daily; costPerMonth = costPerDay × days of the current month.
// · end: when the current container runs out. All recorded doses are summed and, each time they complete a container,
//   a new one starts: what is left of the current one is the remainder. Today's pending doses are subtracted and the
//   rest is spread over the doses per day. If it does not cover today, it ends today. soon: under SOON_DAYS days.
// · records, dosesTaken, costTaken (doses taken × cost / units) and firstDay: its history.
// The product list, Costes, Próximas compras, the product view, the history and the assistant all read from here.
function figures(m) {
  const records = recordsOfProduct(m.id), dosesTaken = dosesSum(records), daily = perDayUnits(m);
  const unitCost = m.cost !== '' && m.units !== '' ? m.cost / m.units : null;
  const costPerDay = unitCost !== null && daily ? unitCost * daily : null;
  let end = '';
  if (m.units !== '' && daily) {
    const pendingToday = Math.max(0, daily - dosesSum(records.filter(e => e.day === today())));
    const left = m.units - dosesTaken % m.units - pendingToday;
    end = addDays(today(), left < 0 ? 0 : Math.floor(left / daily));
  }
  const days = end ? daysLeft(end) : null;
  return { paused: paused(m), doseToday: doseOn(m, today()), daily, costPerDay, costPerMonth: costPerDay === null ? null : costPerDay * monthDays(),
    end, daysLeft: days, soon: days !== null && days < SOON_DAYS,
    records: records.length, dosesTaken, costTaken: unitCost === null ? null : dosesTaken * unitCost, firstDay: records.map(e => e.day).sort()[0] ?? '' };
}
// Figures of the active products together: cost of the containers, per day and per month, and what runs out within
// SHOP_DAYS days (most urgent first).
function totals() {
  const products = state.products.filter(m => !paused(m)), priced = products.filter(m => m.cost !== ''), full = priced.filter(m => m.units !== '');
  const costPerDay = full.reduce((sum, m) => sum + (figures(m).costPerDay ?? 0), 0);
  const shopping = products.map(m => ({ m, ...figures(m) })).filter(x => x.end && x.daysLeft <= SHOP_DAYS).sort((a, b) => a.end.localeCompare(b.end));
  return { products, priced, full, containers: priced.reduce((sum, m) => sum + m.cost, 0), costPerDay, costPerMonth: costPerDay * monthDays(), shopping };
}

// ---------- Figures shown ----------

const euros = (n, digits = 2) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });
const per = (n, unit) => `${euros(n, Number.isInteger(n) ? 0 : 2).replace(/\s*€/, '')} €/${unit}`;
// Container end: rose when it runs out soon (the home (i), the product row and the purchase texts).
const supplyColor = id => { const m = productOf(id); return m && figures(m).soon ? 'rose' : 'teal'; };
// «12/04 · Dentro de 3 semanas», for Próximas compras and the product view; without units or schedule, nothing.
const purchaseText = m => { const f = figures(m); return f.end ? `<ion-text ${f.soon ? 'color="rose"' : ''}>${shortDate(f.end)} · ${until(f.daysLeft)}</ion-text>` : ''; };
const purchaseRow = m => `<ion-item>${readLabel('Fecha estimada de compra', m ? purchaseText(m) : '', true)}</ion-item>`;
// Container end («5/01», the same day as «Fecha estimada de compra») on the right of the product row, level with the
// name: grey; rose and medium weight if it runs out soon.
const endNote = id => {
  const m = productOf(id), f = m && figures(m);
  return f?.end ? `<ion-note ${f.soon ? 'class="ion-float-right medium" color="rose"' : 'class="ion-float-right"'}>${shortDate(f.end)}</ion-note>` : '';
};
// Cost line of a product row: «30 €/ud · 15 €/mes · 1 €/día», with whatever can be computed.
function costLine(m) {
  const f = figures(m), parts = [];
  if (m.cost !== '') parts.push(per(m.cost, 'ud'));
  if (f.costPerDay !== null) parts.push(per(f.costPerMonth, 'mes'), per(f.costPerDay, 'día'));
  return parts.join(' · ');
}

function renderCosts() {
  const { products, priced, full, containers, costPerDay, costPerMonth, shopping: shop } = totals();
  const row = (title, text, extra = '', icon = '') => `<ion-item${extra}>${icon}<ion-label><h2 class="medium">${title}</h2><p>${text}</p></ion-label></ion-item>`;
  // Overall costs: total of the containers and, with doses per container, per day and per month (days of the current month);
  // at the end, the upcoming purchases row (shown even without costs if something runs out).
  $('#costs').innerHTML = priced.length || shop.length ? `
    <ion-list-header><ion-label>Costes</ion-label></ion-list-header>
    <ion-list inset="true">
      ${priced.length ? row(`${euros(containers, 0)} en total`, `${priced.length} de ${products.length} productos con coste`)
      + row(`${euros(costPerMonth)} al mes`, `${euros(costPerDay)} al día · ${full.length} de ${products.length} productos con coste y dosis por envase`) : ''}
      ${row('Próximas compras', shop.length ? `${count(shop.length, 'producto se acaba', 'productos se acaban')} en ${SHOP_DAYS} días` : `Nada se acaba en ${SHOP_DAYS} días`, ' button="true" id="open-shopping"',
        `<ion-icon slot="start" name="cart-outline" color="${shop.length ? 'primary' : 'medium'}"></ion-icon>`)}
    </ion-list>` : '';
}

// Upcoming purchases list: name, price if any, days left, expected date and the (i) with the product view
// (as on the home screen); the total at the end.
const shoppingModal = $('#shopping');
function openShopping() {
  const shop = totals().shopping, priced = shop.filter(x => x.m.cost !== '');
  $('#shopping-body').innerHTML = shop.length ? `
    <ion-list inset="true">
      ${shop.map(({ m }) => `
      <ion-item>
        <ion-label>
          <h2 class="medium">${esc(m.name)}</h2>
          <p>${purchaseText(m)}</p>
        </ion-label>
        ${m.cost !== '' ? `<ion-note slot="end">${euros(m.cost, 0)}</ion-note>` : ''}${viewButton(m.id)}
      </ion-item>`).join('')}
    </ion-list>
    ${priced.length ? `<ion-list inset="true"><ion-item lines="none"><ion-label><h2 class="medium">Total</h2><p>${priced.length} de ${shop.length} con precio</p></ion-label><ion-note slot="end">${euros(priced.reduce((sum, x) => sum + x.m.cost, 0), 0)}</ion-note></ion-item></ion-list>` : ''}`
    : emptyList(`Nada se acaba en los próximos ${SHOP_DAYS} días.`);
  shoppingModal.present();
}

// Product list: only active ones; paused ones go apart, in the «Pausados» row (only if any), which opens
// its own list. They are edited from there and, with a new schedule, return to the active ones.
const pausedModal = $('#paused');
function renderProducts() {
  const activeProducts = state.products.filter(m => !paused(m)), pausedProducts = state.products.filter(paused);
  $('#list-count').textContent = activeProducts.length;
  $('#list').innerHTML = activeProducts.map(productRow).join('') || empty('Sin productos. Pulsa «Añadir» para crear uno.');
  $('#paused-row').classList.toggle('ion-hide', !pausedProducts.length);
  $('#paused-count').textContent = pausedProducts.length;
  $('#paused-list').innerHTML = pausedProducts.map(productRow).join('') || empty('No hay productos pausados.');
}


// ---------- CSV ----------

const SEP = ';';
const yes = v => ['1', 'yes', 'true', 'sí', 'si'].includes(String(v).trim().toLowerCase());
const hhmm = iso => time(iso).padStart(5, '0'); // data format («05:06»)
const csv = rows => '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(SEP)).join('\r\n');

function parseCSV(text) {
  const rows = [[]];
  let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    }
    else if (c === '"') quoted = true;
    else if (c === SEP) { rows.at(-1).push(cell); cell = ''; }
    else if (c === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); }
    else if (c !== '\r') cell += c;
  }
  rows.at(-1).push(cell);
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

function download(name, data, type = 'text/csv') {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href));
}

// One CSV with shared columns named after the data fields; each row type uses its own:
// · timing: id, name, start and end (hours), visible (true/false) and order (space-separated product ids), in order.
// · product: id, name, notes, refs, memo, cost (€ per container), units (doses per container), created and updated («YYYY-MM-DD HH:MM», local time).
// · schedule: product id, dose, start (start date), days (duration) and timings (space-separated ids).
// · record: product id, timing, at («YYYY-MM-DD HH:MM», local time) and the product as taken: name, dose and notes.
// Each column is a data field with the same name; the record's «day» is inside «at».
// Exported by type: timings and products in their order, schedules by start date and records by day and time.
const HEAD = ['type', 'id', 'name', 'notes', 'refs', 'memo', 'cost', 'units', 'dose', 'start', 'end', 'days', 'timings', 'timing', 'visible', 'order', 'at', 'created', 'updated'];
const csvStamp = iso => `${dayKey(new Date(iso))} ${hhmm(iso)}`; // «YYYY-MM-DD HH:MM», local time
const csvRow = (type, o) => HEAD.map(h => h === 'type' ? type : o[h] ?? '');

const exportCSV = () => csv([
  HEAD,
  ...state.timings.map(ti => csvRow('timing', { id: ti.id, name: ti.name, start: ti.start, end: ti.end, visible: ti.visible, order: ti.order.join(' ') })),
  ...state.products.map(m => csvRow('product', { id: m.id, name: m.name, notes: m.notes, refs: m.refs, memo: m.memo, cost: m.cost, units: m.units, created: csvStamp(m.created), updated: csvStamp(m.updated) })),
  ...state.products.flatMap(m => m.schedules.map(p => ({ id: m.id, ...p }))).sort((a, b) => a.start.localeCompare(b.start))
    .map(p => csvRow('schedule', { id: p.id, dose: p.dose, start: p.start, days: p.days, timings: p.timings.join(' ') })),
  ...[...state.records].sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at))
    .map(e => csvRow('record', { id: e.id, name: e.name, dose: e.dose, notes: e.notes, timing: e.timing, at: `${e.day} ${hhmm(e.at)}` })),
]);

// Reads rows into objects and cleans them with clean(), like stored data.
async function importCSV(file) {
  const rows = parseCSV(await file.text());
  const head = rows.shift()?.map(h => h.toLowerCase()) ?? [];
  const raw = { timings: [], products: [], records: [] };
  const words = v => v.split(/\s+/).filter(Boolean);
  for (const r of rows) {
    const c = Object.fromEntries(HEAD.map(h => [h, r[head.indexOf(h)] ?? '']));
    if (c.type === 'timing') raw.timings.push({ id: c.id, name: c.name, start: c.start, end: c.end, visible: c.visible === '' ? true : yes(c.visible), order: words(c.order) });
    if (c.type === 'product') raw.products.push({ id: c.id, name: c.name, notes: c.notes, refs: c.refs, memo: c.memo, cost: c.cost, units: c.units, created: c.created.replace(' ', 'T'), updated: c.updated.replace(' ', 'T'), schedules: [] });
    if (c.type === 'schedule') raw.products.find(m => m.id === c.id)?.schedules.push({ dose: c.dose, start: c.start, days: int(c.days, 1), timings: words(c.timings) });
    if (c.type === 'record') { const [day, hhmm = '00:00'] = c.at.split(' '); raw.records.push({ at: `${day}T${hhmm}`, day, id: c.id, timing: c.timing, name: c.name, dose: c.dose, notes: c.notes }); }
  }
  if (!raw.timings.length && !raw.products.length && !raw.records.length) return;
  const apply = () => { Object.assign(state, clean(raw)); commit(); };
  ask('¿Reemplazar la base de datos?', apply);
}

// ---------- PDF ----------

// Monthly history as PDF: «DOSIFY» title, month and a 5-column table with fixed rows.
// The PDF is written by hand (no libraries) with the standard Helvetica and Helvetica-Bold fonts, which need no embedding.
const A4 = { w: 595.28, h: 841.89 };
// Helvetica widths (characters 32–126, in thousandths of an em) to measure and clip text; Helvetica-Bold only for the title.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const textWidth = (text, size) => [...text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
  .reduce((w, c) => w + (HELV[c.charCodeAt(0) - 32] ?? 556), 0) * size / 1000;
const fitText = (text, size, max) => { let t = String(text ?? ''); if (textWidth(t, size) <= max) return t; while (t && textWidth(`${t}…`, size) > max) t = t.slice(0, -1); return `${t.trimEnd()}…`; };
// Wraps text into at most «lines» lines that fit in «max»; what is left over is clipped with «…» on the last one.
function wrap(text, size, max, lines = 2) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), out = [];
  while (words.length && out.length < lines) {
    let line = words.shift();
    while (words.length && textWidth(`${line} ${words[0]}`, size) <= max) line += ` ${words.shift()}`;
    if (textWidth(line, size) > max && out.length < lines - 1) { // word longer than the cell: split it
      let cut = line.length; while (cut > 1 && textWidth(line.slice(0, cut), size) > max) cut--;
      words.unshift(line.slice(cut)); line = line.slice(0, cut);
    }
    out.push(line);
  }
  if (words.length) out[lines - 1] = `${out[lines - 1]} ${words.join(' ')}`;
  if (out.length) out[out.length - 1] = fitText(out.at(-1), size, max);
  return out;
}
// PDF text in WinAnsi: \ ( ) are escaped, the common characters above latin-1 use their WinAnsi codes and the rest become «?».
const WINANSI = { '…': '\\205', '€': '\\200', '–': '\\226', '—': '\\227', '‘': '\\221', '’': '\\222', '“': '\\223', '”': '\\224' };
const pdfText = t => [...t].map(c => WINANSI[c] ?? (c.charCodeAt(0) > 255 ? '?' : c.replace(/[\\()]/g, '\\$&'))).join('');

function pdfPages(month, rows) {
  // Template measures (908 px wide) converted to A4 points.
  const k = A4.w / 908, X = px => px * k, Y = px => A4.h - px * k;
  const cols = [67, 153, 247, 545, 647, 835], left = X(cols[0]), right = X(cols.at(-1));
  const line = (x1, y1, x2, y2) => `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
  const head = ['FECHA', 'HORA', 'PRODUCTO', 'DOSIS', 'INDICACIONES'];
  const rowH = 38.4, top = 126, headH = 38;
  const perPage = Math.floor((A4.h / k - 56 - top - headH) / rowH);
  const pages = [];
  for (let p = 0; p === 0 || p * perPage < rows.length; p++) {
    const c = [];
    const put = (font, size, x, y, t, gray = 0.13) => c.push(`BT /${font} ${size} Tf ${gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(t)}) Tj ET`);
    // Title and month
    put('F2', 26, left, Y(85), 'DOSIFY');
    put('F1', 8.5, X(610), Y(75), 'MES');
    put('F1', 10, X(684), Y(73), month);
    c.push(`0.55 G 0.6 w [0.8 1.2] 0 d ${line(X(678), Y(77), right, Y(77))} [] 0 d`);
    // Grey table header
    c.push(`0.85 g ${left.toFixed(2)} ${Y(top + headH).toFixed(2)} ${(right - left).toFixed(2)} ${(headH * k).toFixed(2)} re f`);
    head.forEach((h, i) => { const mid = (X(cols[i]) + X(cols[i + 1])) / 2; put('F1', 8.5, mid - textWidth(h, 8.5) / 2, Y(top + headH / 2) - 3, h); });
    // Rows of the page
    const pageRows = rows.slice(p * perPage, (p + 1) * perPage);
    pageRows.forEach((r, n) => {
      // Each cell, up to two lines vertically centred in the row.
      const mid = Y(top + headH + rowH * n + rowH / 2) - 3, lead = 9.5;
      r.forEach((v, i) => {
        const x = X(cols[i]), w = X(cols[i + 1]) - x, cell = wrap(v, 8.5, w - 8);
        cell.forEach((t, j) => put('F1', 8.5, i < 2 ? x + (w - textWidth(t, 8.5)) / 2 : x + 4, mid + ((cell.length - 1) / 2 - j) * lead, t));
      });
    });
    // Grid
    const bottom = top + headH + rowH * perPage;
    c.push('0.45 G 0.6 w');
    for (let n = 0; n <= perPage + 1; n++) { const y = n === 0 ? top : top + headH + rowH * (n - 1); c.push(line(left, Y(y), right, Y(y))); }
    for (const x of cols) c.push(line(X(x), Y(top), X(x), Y(bottom)));
    pages.push(c.join('\n'));
  }
  return pages;
}

// Assembles the PDF file: catalog, pages, two standard fonts and one content stream per page; then the xref table.
function pdfFile(pages) {
  const objs = [];
  const add = body => (objs.push(body), objs.length);
  const catalog = add(''), tree = add('');
  const font = name => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`);
  const f1 = font('Helvetica'), f2 = font('Helvetica-Bold');
  const kids = pages.map(content => {
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Contents ${stream} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objs[tree - 1] = `<< /Type /Pages /Kids [${kids.map(n => `${n} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(out, ch => ch.charCodeAt(0));
}

// Records of a month («YYYY-MM») by date and time: date, time, and the product as taken: name, dose and notes.
function exportPDF(month) {
  const rows = state.records.filter(e => e.day.startsWith(month)).sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at)).map(e => [dayMonth(e.day), time(e.at), e.name, e.dose, e.notes]);
  download(`dosify-${month}.pdf`, pdfFile(pdfPages(monthName(month), rows)), 'application/pdf');
}

// PDF month (ion-select as action sheet): of the last 6 months, only those with records, newest first;
// the newest by default. Without records in that span, the row and the button are disabled.
const pdfMonth = $('#pdf-month');
function renderPdfMonths() {
  const now = new Date(), recorded = new Set(state.records.map(e => e.day.slice(0, 7)));
  const months = Array.from({ length: 6 }, (_, i) => dayKey(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7)).filter(k => recorded.has(k));
  pdfMonth.innerHTML = months.map(k => `<ion-select-option value="${k}">${monthName(k)}</ion-select-option>`).join('');
  if (!months.includes(pdfMonth.value)) pdfMonth.value = months[0];
  pdfMonth.disabled = $('#export-pdf').disabled = !months.length;
}

// ---------- Product editor ----------

// When an editor closes (save or cancel), the Products list returns to where it was when it opened.
let managerY = 0;
const managerContent = $('#manager ion-content');
const managerScroller = () => managerContent.getScrollElement();
const rememberScroll = async () => { managerY = (await managerScroller()).scrollTop; };
const restoreScroll = async () => setScroll(await managerScroller(), managerY);

const editor = $('#editor');
const field = name => $(`[name="${name}"]`, editor);
let editing = null;

// Marks the bad fields red (Ionic) and focuses the first one; true if any.
const flagInvalid = (get, names, bad) => { for (const f of names) get(f).classList.toggle('ion-invalid', bad.includes(f)); for (const f of bad) get(f).classList.add('ion-touched'); if (bad.length) get(bad[0]).setFocus(); return bad.length > 0; };
function openEditor(product = {}) {
  editing = product.id ?? null;
  TEXT.forEach(f => field(f).value = product[f] ?? '');
  for (const f of ['cost', 'units']) { field(f).value = product[f] ?? ''; field(f).classList.remove('ion-invalid', 'ion-touched'); }
  schedules = structuredClone(product.schedules ?? []);
  renderSchedules();
  for (const id of ['#delete', '#delete-header', '#stats-section']) $(id).classList.toggle('ion-hide', !editing);
  $('#history-count').textContent = editing ? recordCount(editing) : '';
  $('#updated').innerHTML = editing ? updatedLabel(productOf(editing)) : '';
  rememberScroll();
  editor.present();
}

function saveEditor() {
  const old = productOf(editing);
  const product = Object.fromEntries(TEXT.map(f => [f, str(field(f).value).trim()]));
  if (!product.name) return field('name').setFocus();
  // Cost and doses per container: integers (doses at least 1) or empty.
  product.cost = int(field('cost').value); product.units = int(field('units').value, 1);
  if (flagInvalid(field, ['cost', 'units'], failing([['cost', product.cost !== null], ['units', product.units !== null]]))) return;
  product.schedules = cleanSchedules(schedules);
  const done = () => { commit(); editor.dismiss(); };
  if (!old) return state.products.push(newProduct(product)), done();
  // If what the history shows (name, notes) changes and there are earlier records, the user chooses whether those
  // change too (the dose lives in the schedule).
  const apply = all => { updateProduct(old, product, all); done(); };
  const changed = ['name', 'notes'].some(k => product[k] !== old[k]);
  if (!changed || !recordsOfProduct(old.id).some(e => e.day < today())) return apply(false);
  sheet('¿A qué se aplican los cambios?', [
    { text: 'Aplicar a partir de hoy', handler: () => apply(false) },
    { text: 'Aplicar a todo el registro', handler: () => apply(true) },
  ]);
}

// ---------- Schedules (inside the product editor) ----------

// Edited on a copy («schedules») saved with the product; «Cancelar» on the product discards them.
let schedules = [], editingSchedule = null;
const scheduleEditor = $('#schedule-editor');
const scheduleField = name => $(`[name="${name}"]`, scheduleEditor);

// Until which day a schedule applies: its last day or, if the next one starts earlier, the day before that.
const scheduleUntil = (all, p) => { const next = all.find(q => q.start > p.start); return next && next.start <= scheduleEnd(p) ? addDays(next.start, -1) : scheduleEnd(p); };

// Schedule row (editor list and product view), like the home rows: the dose as title, below the dates it applies and the
// duration («24/10 – 22/11 · 30 días») and, if any, a third grey line with its timings («Desayuno, Cena»).
const scheduleDates = (all, p) => `${shortDate(p.start)} – ${shortDate(scheduleUntil(all, p))} · ${count(p.days, 'día', 'días')}`;
const scheduleRow = (all, p) => `<h2 class="medium">${esc(p.dose)}</h2>${doseLine(scheduleDates(all, p))}${p.timings.length ? `<p>${esc(p.timings.map(label).join(', '))}</p>` : ''}`;
// Timings of a schedule: a checkbox per visible timing, with its hours as subtitle; hidden ones keep their value.
const timingBoxes = timings => visibleTimings().map(ti => `<ion-item><ion-checkbox name="timing-${ti.id}" ${timings.includes(ti.id) ? 'checked' : ''}><ion-label><h2>${esc(label(ti.id))}</h2><p>${hours(ti) || 'Sin horas'}</p></ion-label></ion-checkbox></ion-item>`).join('') || empty('No hay momentos visibles.');
const readTimings = old => timingIds().filter(id => timingOf(id).visible ? scheduleField(`timing-${id}`).checked : old.includes(id)); // hidden ones keep their value
function renderSchedules() {
  schedules = cleanSchedules(schedules);
  $('#schedule-list').innerHTML = schedules.map((p, i) => `<ion-item button="true" data-schedule="${i}"><ion-label class="ion-text-wrap">${scheduleRow(schedules, p)}</ion-label></ion-item>`).join('')
    + `<ion-item button="true" detail="false" data-schedule="new"><ion-icon slot="start" name="add-outline" color="primary"></ion-icon><ion-label color="primary">Añadir pauta</ion-label></ion-item>`;
}

// A new schedule proposes the last one's dose and timings, and today.
const nextSchedule = list => ({ dose: list.at(-1)?.dose ?? '', start: today(), days: '', timings: list.at(-1)?.timings ?? [] });
function openSchedule(i) {
  editingSchedule = i;
  const p = schedules[i] ?? nextSchedule(schedules);
  for (const f of ['dose', 'start', 'days']) { scheduleField(f).value = p[f]; scheduleField(f).classList.remove('ion-invalid', 'ion-touched'); }
  $('#schedule-timings').innerHTML = timingBoxes(p.timings);
  $('#schedule-timings-error').classList.add('ion-hide');
  $('#schedule-delete').classList.toggle('ion-hide', i === null);
  scheduleEditor.present();
}

// A dose starting with a number, a start date, a duration of at least 1 day and at least one timing; whatever
// is missing is marked red.
function saveSchedule() {
  const p = { dose: str(scheduleField('dose').value).trim(), start: date(str(scheduleField('start').value)), days: int(scheduleField('days').value, 1), timings: readTimings(schedules[editingSchedule]?.timings ?? []) };
  $('#schedule-timings-error').classList.toggle('ion-hide', p.timings.length > 0);
  if (flagInvalid(scheduleField, ['dose', 'start', 'days'], failing([['dose', amount(p.dose)], ['start', p.start], ['days', p.days]])) || !p.timings.length) return;
  if (editingSchedule === null) schedules.push(p); else schedules[editingSchedule] = p;
  renderSchedules();
  scheduleEditor.dismiss();
}

// ---------- Product history ----------

// A record as a row: «25/10 · 15 gramos» and, below, «9:30 · Desayuno».
const recordLabel = e => `<ion-label><h2>${shortDate(e.day)} · ${esc(e.dose)}</h2><p>${time(e.at)} · ${esc(label(e.timing))}</p></ion-label>`;

// How many records a product has («1 toma», «12 tomas»), for the «Registro» row of the editor and the product view.
const recordsLabel = n => count(n, 'toma', 'tomas');
const recordCount = id => recordsLabel(recordsOfProduct(id).length);

// All records of the product: summary (since when, how many, doses and estimated cost) and, below, grouped by the
// schedule that applied each day (newest first; those without one under «Sin pauta»).
const historyModal = $('#history');
function openHistory(id) {
  const taken = recordsOfProduct(id).sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at));
  const m = productOf(id) ?? { ...EMPTY_PRODUCT, id, name: taken[0]?.name ?? '' }; // deleted product: only its records
  const f = figures(m), item = (k, v) => `<ion-item><ion-label>${k}</ion-label><ion-note slot="end">${v}</ion-note></ion-item>`;
  const summary = [
    ['Desde', f.firstDay ? shortDate(f.firstDay) : '—'],
    ['Tomas', f.records],
    ['Dosis tomadas', f.dosesTaken.toLocaleString('es')],
    ...(f.costTaken !== null ? [['Coste estimado', euros(f.costTaken)]] : []),
  ];
  const groups = new Map();
  for (const e of taken) {
    const p = scheduleOn(m, e.day), key = p ? `${p.start}|${p.days}` : '';
    if (!groups.has(key)) groups.set(key, { title: p ? `${shortDate(p.start)} · ${esc(p.dose)}` : 'Sin pauta', rows: [] });
    groups.get(key).rows.push(e);
  }
  $('#history-title').textContent = m.name;
  $('#history-body').innerHTML = `
    <ion-list inset="true">${summary.map(([k, v]) => item(k, v)).join('')}</ion-list>
    ${[...groups.values()].map(g => `
      <ion-list-header><ion-label>${g.title} (${g.rows.length})</ion-label></ion-list-header>
      <ion-list inset="true">${g.rows.map(e => `<ion-item>${recordLabel(e)}</ion-item>`).join('')}</ion-list>`).join('')
    || emptyList('Sin tomas registradas.')}`;
  historyModal.present();
}

// ---------- Product view (ficha) ----------

// Read only, mirror of the editor, whether the product exists or not: Producto, Pautas (with each one's timings),
// Otros datos (ending with the estimated purchase date on its own) and Estadísticas («Registro», below it the dose
// taken when opened from home, and «Últimos cambios» on its own). For a deleted product it shows what the record
// stores (name, notes and the dose) and «—» elsewhere.
// «Editar», only if the product exists, closes the view and opens the editor.
const viewModal = $('#view');
let viewing = null;
// Read-only row: small title and value («—» when empty); html = the value is already HTML, links = make links clickable.
const readLabel = (name, value, html, links) => `<ion-label class="ion-text-wrap"><p>${name}</p><h2>${(html ? value : links ? linkify(value ?? '') : lines(value ?? '')) || '—'}</h2></ion-label>`;
const readRow = (name, value, links) => `<ion-item>${readLabel(name, value, false, links)}</ion-item>`;
const readSection = (title, rows) => `<ion-list-header><ion-label>${title}</ion-label></ion-list-header><ion-list inset="true">${rows}</ion-list>`;
function openView(id, record) {
  const m = productOf(id), p = m ?? { ...EMPTY_PRODUCT, name: record.name, notes: record.notes };
  viewing = id;
  $('#view-title').textContent = p.name;
  $('#view-edit').classList.toggle('ion-hide', !m);
  $('#view-body').innerHTML = readSection('Producto', readRow('Nombre', p.name) + readRow('Indicaciones', p.notes))
    + readSection('Pautas', p.schedules.map(x => `<ion-item><ion-label class="ion-text-wrap">${scheduleRow(p.schedules, x)}</ion-label></ion-item>`).join('') || empty(m ? 'Sin pautas.' : '—'))
    + readSection('Otros datos', readRow('Referencias', p.refs, true) + readRow('Notas', p.memo, true))
    + `<ion-list inset="true">${readRow('Coste del envase', p.cost === '' ? '' : euros(p.cost, 0))}${readRow('Dosis por envase', p.units === '' ? '' : p.units.toLocaleString('es'))}</ion-list>`
    + `<ion-list inset="true">${purchaseRow(m)}</ion-list>`
    + readSection('Estadísticas', `<ion-item button="true" id="view-history"><ion-label>Registro</ion-label><ion-note slot="end">${recordCount(id)}</ion-note></ion-item>${record ? `<ion-item>${recordLabel(record)}</ion-item>` : ''}`)
    + `<ion-list inset="true"><ion-item>${updatedLabel(m)}</ion-item></ion-list>`
    + (m ? '' : emptyList('El producto se borró: se muestra lo que guarda la toma.'));
  viewModal.present();
}

// ---------- Timings list and editor ----------

// Timings: visibility checkbox on the left; tapping the row opens its editor.
const timingRow = ti => `
  <ion-item detail="false" data-timing="${ti.id}">
    <ion-checkbox slot="start" aria-label="Visible" data-timing="${ti.id}" ${ti.visible ? 'checked' : ''}></ion-checkbox>
    <ion-label ${ti.visible ? '' : 'color="medium"'}>
      <h2 class="medium">${esc(label(ti.id))}</h2>
      <p>${hours(ti) || 'Sin horas'}</p>
    </ion-label>
  </ion-item>`;

const renderTimingRows = () => { $('#timings').innerHTML = state.timings.map(timingRow).join(''); };

const timingEditor = $('#timing-editor');
const timingField = name => $(`[name="${name}"]`, timingEditor);
let editingTiming = null;

function openTimingEditor(id) {
  editingTiming = id;
  const ti = timingOf(id);
  timingField('name').value = ti.name;
  for (const f of ['start', 'end']) { timingField(f).value = ti[f]; timingField(f).classList.remove('ion-invalid', 'ion-touched'); }
  rememberScroll();
  timingEditor.present();
}

// Hours are optional; if given, whole numbers from 0 to 24. An invalid hour is marked red (Ionic) and focused.
function saveTimingEditor() {
  const [start, end] = ['start', 'end'].map(f => hour(timingField(f).value));
  if (flagInvalid(timingField, ['start', 'end'], failing([['start', start !== null], ['end', end !== null]]))) return;
  Object.assign(timingOf(editingTiming), { name: str(timingField('name').value).trim(), start, end });
  commit();
  timingEditor.dismiss();
}

// ---------- Assistant: settings and chat state ----------

// Chat with an OpenAI-compatible model (POST {url}/chat/completions). The settings (base URL, API key and
// model) are stored apart from the data, only in this browser, and never go in the CSV. On each request the assistant
// gets all the app data; it can change them with tools, and each change becomes an editable proposal to save or discard.
const AI_KEY = 'dosify-assistant';
// No defaults: until all three fields are filled in, the assistant cannot be used.
const AI_FIELDS = ['url', 'key', 'model'];
const ai = (() => { const v = load(AI_KEY) ?? {}; return Object.fromEntries(AI_FIELDS.map(k => [k, asText(v[k]).trim()])); })();
const aiReady = () => !!(ai.url && ai.key && ai.model); // no defaults: all three are needed
const aiField = name => $(`#assistant-settings [name="${name}"]`);
// Saved while typing (not only on blur, which on iOS may not fire when closing Products) and the fields are
// filled with the stored values each time Products opens.
const showAi = () => AI_FIELDS.forEach(k => { aiField(k).value = ai[k]; });
for (const k of AI_FIELDS) aiField(k).addEventListener('ionInput', () => { ai[k] = String(aiField(k).value ?? '').trim(); localStorage.setItem(AI_KEY, JSON.stringify(ai)); });
showAi();
manager.addEventListener('ionModalWillPresent', showAi);

const chatModal = $('#chat'), chatBody = $('#chat-body'), chatInput = $('#chat-input'), proposalBody = $('#proposal-body');
const chatRoots = [chatBody, proposalBody]; // proposals live in the chat and in the edit view
// The chat is stored (apart from the data and outside the CSV) until «Limpiar» is pressed.
const CHAT_KEY = 'dosify-chat';
let { chat = [], chatView = [] } = (() => { const v = load(CHAT_KEY); return Array.isArray(v?.chat) && Array.isArray(v?.chatView) ? v : {}; })();
let chatBusy = false;
const saveChat = () => localStorage.setItem(CHAT_KEY, JSON.stringify({ chat, chatView }));

// ---------- Assistant: system prompt ----------

// What the assistant knows: what the app is, the data model, precomputed figures per product and all the data as JSON.
function systemPrompt() {
  const now = new Date();
  // The same figures the app shows, per product and overall, with Spanish keys and euros rounded to cents.
  const cents = n => n === null ? null : Math.round(n * 100) / 100;
  const summary = state.products.map(m => { const f = figures(m); return { id: m.id, nombre: m.name, dosis_hoy: f.doseToday, pausado: f.paused,
    tomas_hoy: onDay(m, today()) ? Object.fromEntries(timingsOn(m, today()).map(id => [id, recordOf(m.id, id, today()) ? 'tomada' : 'pendiente'])) : {},
    dosis_al_dia: f.daily, coste_envase: m.cost === '' ? null : m.cost, coste_dia: cents(f.costPerDay), coste_mes: cents(f.costPerMonth),
    fin_del_envase: f.end || null, dias_hasta_fin: f.daysLeft, se_acaba_pronto: f.soon,
    tomas_registradas: f.records, primera_toma: f.firstDay || null, dosis_tomadas: f.dosesTaken, coste_consumido: cents(f.costTaken) }; });
  const t = totals(), overall = { productos_activos: t.products.length, coste_envases: t.containers, coste_dia: cents(t.costPerDay), coste_mes: cents(t.costPerMonth),
    proximas_compras: t.shopping.map(x => ({ id: x.m.id, nombre: x.m.name, fin_del_envase: x.end, dias_hasta_fin: x.daysLeft })) };
  return `Eres el asistente de Dosify, una app para llevar la medicación y la suplementación (productos con sus pautas) y registrar las tomas. Responde en español, breve y claro, en Markdown: títulos, negritas, listas y, cuando ayuden a comparar o resumir, tablas. Para mostrar evolución o reparto puedes añadir una gráfica con un bloque de código \`\`\`chart que contenga solo JSON: {"type": "bar"|"line"|"pie"|"doughnut", "labels": [...], "datasets": [{"label": "...", "data": [números]}]}. Usa solo los datos que te doy; si algo no está, dilo. Habla siempre en lenguaje natural y de tú, en segunda persona («has guardado», «tienes», «te queda»): nunca muestres JSON, claves, ids ni datos en bruto. No das consejo médico: para dudas de salud, remite al médico o al farmacéutico.
Hoy es ${now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${today()}), y son las ${time(now)}.
Datos:
- timings: momentos de toma, en su orden (no se reordenan; id aleatorio; name es el nombre que ve el usuario; start y end, horas, opcionales; visible, si sale en la app; order, ids de producto en el orden de tomas). Por defecto son ${DEFAULT_TIMINGS.map(d => d.name).join(', ')}, pero pueden haberse renombrado: usa siempre los ids y nombres que ves en los datos. En la toma de cada día solo se ven los momentos visibles que ese día tienen algún producto pendiente o toma hecha.
- products: productos (id, name, notes = indicaciones, refs = referencias, memo = notas, cost = € por envase, units = dosis por envase, created y updated = fecha de creación y del último guardado en ISO, schedules = pautas { dose, start AAAA-MM-DD, days, timings = ids de los momentos en que se toma con esa pauta, al menos uno }). Cada día vale la última pauta que haya empezado, si su duración llega a ese día, en sus timings y con su dose (que empieza por la cantidad de cada toma). Un producto sin pauta vigente ni futura (también sin ninguna) está pausado: no sale en la toma y va en la lista «Pausados» de Productos; para que se tome hay que darle una pauta. Para cambiar los momentos de un producto, cambia los timings de su pauta (o crea otra con otros). Al crear un producto, propón ya su pauta (dosis, inicio, duración y momentos).
- records: tomas registradas (at = cuándo se marcó, day = día de la toma, id = producto, timing = momento, name, dose y notes = el producto tal como se tomó). Lo guardado en una toma no cambia solo porque cambie el producto: para corregir tomas ya guardadas (una o muchas: su dosis, indicaciones o nombre) está edit_records.
Cálculos por producto, los mismos que muestra la app (dosis de hoy; si está pausado; qué tomas de hoy están tomadas o pendientes por momento; dosis al día = cantidad de la dosis de hoy por cada momento visible de su pauta; coste del envase, al día = coste ÷ dosis por envase × dosis al día, y al mes = al día × días del mes actual, en euros; fin del envase actual con reinicio automático al gastar cada envase, días hasta entonces y si se acaba pronto, en menos de ${SOON_DAYS} días; tomas registradas, primera toma, dosis tomadas y coste consumido = dosis tomadas × coste ÷ dosis por envase; null es que no se puede calcular):
${JSON.stringify(summary)}
Totales de los productos activos (coste de los envases, al día y al mes, y los envases que se acaban en ${SHOP_DAYS} días, del más urgente al menos):
${JSON.stringify(overall)}
Datos completos:
${JSON.stringify({ timings: state.timings, products: state.products, records: state.records })}
Los datos de arriba son los únicos ciertos ahora mismo: lo que se dijera en mensajes anteriores puede haber cambiado. Comprueba en ellos si algo existe antes de hablar de ello; un producto con el mismo nombre que ya está en los datos se modifica, no se crea otro.
Interacción: siempre que quien usa la app quiera elegir, marcar varias cosas, repasar o confirmar una lista, rellenar o editar datos o responder entre opciones, no contestes con texto: llama a ui y compón la pantalla que haga falta con sus elementos (text, check, toggle, radio, chips, select, input de text/number/date/time, textarea y button), en una o varias secciones con título. Cada elemento tiene una clave (key): al aplicar recibes su valor y puedes usarlo en los argumentos de las acciones como {{clave}}. Las acciones son las otras herramientas: en un check, toggle, opción de radio, chips o select, se ejecuta si queda marcado o elegido; en un button, al pulsarlo; en actions (globales), siempre. Ejemplos: «una lista con check para marcar las tomas de esta mañana» → una sección con un check por producto pendiente del momento de la mañana, cada uno con action add_record (id, timing, day); «cambia el coste y las dosis por envase de X» → inputs number con key coste y dosis, y en actions edit_product con id, cost "{{coste}}" y units "{{dosis}}"; «¿qué producto?» → radio o buttons con los candidatos; elegir momentos → chips multiple. Los elementos sin acción solo te devuelven su valor: sirven para preguntar. Texto, tablas y gráficas solo cuando no hay nada con lo que interactuar.
Regla principal: siempre que el mensaje implique crear, cambiar, borrar, marcar o quitar algo, o corregir tomas ya guardadas (lo pida como lo pida), llama a la herramienta en ese mismo turno, antes de nada: sin pedir datos, sin pedir confirmación y sin describir lo que harías. Cada llamada genera en la conversación un formulario editable con lo que propongas, que quien usa la app completa, guarda o descarta; recibirás el resultado con los datos finales. Si falta algún dato, no lo preguntes: llama igualmente con lo que tengas (basta con identificar el producto, la toma o el momento), el formulario sale con los valores actuales y quien usa la app lo rellena; si te dan el dato, ponlo en la llamada. Para varios elementos, una llamada por elemento (se muestran como una lista); nunca repitas una llamada igual ni vuelvas a proponer algo que el resultado ya te ha confirmado como guardado. Si no está claro a qué producto se refiere, propón una llamada por cada candidato. Usa los id que ves en los datos.`;
}

// ---------- Assistant: tools ----------

// Tools: what the assistant can do. Each call becomes a proposal: an editable card in the chat
// (fields, timing chips, schedule rows) that the user saves or discards.
const stringProp = description => ({ type: 'string', description });
const intProp = description => ({ type: 'integer', description });
const timingProp = description => ({ type: 'string', enum: timingIds(), description });
const INPUT_TYPES = ['text', 'number', 'date', 'time'];
const productProps = () => ({
  name: stringProp('Nombre'), notes: stringProp('Indicaciones'), refs: stringProp('Referencias'), memo: stringProp('Notas'),
  cost: intProp('€ por envase'), units: intProp('Dosis por envase'),
  schedules: { type: 'array', description: 'Pautas (sustituyen a las que haya); sin ellas el producto no sale en la toma', items: { type: 'object', required: ['dose', 'start', 'days', 'timings'],
    properties: { dose: stringProp('Dosis; empieza por un número'), start: stringProp('Fecha de inicio AAAA-MM-DD'), days: intProp('Duración en días'), timings: { type: 'array', items: { type: 'string', enum: timingIds() }, description: 'Ids de los momentos en que se toma con esta pauta (al menos uno)' } } } },
});
const tool = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const ACTIONS = ['create_product', 'edit_product', 'delete_product', 'add_record', 'remove_record', 'edit_records', 'edit_timing'];
const UI_TYPES = ['text', 'check', 'toggle', 'radio', 'chips', 'select', 'input', 'textarea', 'button'];
const ACTION = { type: 'object', description: 'Acción: una de las otras herramientas con sus argumentos; en los argumentos, {{clave}} se sustituye por el valor del elemento con esa clave', required: ['tool'], properties: { tool: { type: 'string', enum: ACTIONS }, args: { type: 'object', description: 'Argumentos de esa herramienta' } } };
const tools = () => [
  tool('ui', 'Úsala siempre que haga falta interacción (elegir, marcar, repasar o confirmar una lista, rellenar o editar datos, responder entre opciones): compone una interfaz con componentes de la app a partir de secciones y elementos (texto, casillas, interruptores, radios, chips, selector, campos de texto, número, fecha y hora, área de texto y botones). Al aplicar se ejecutan las acciones de los elementos marcados o elegidos y las acciones globales, y recibes el valor de cada elemento.', {
    title: stringProp('Título de la interfaz'), confirm: stringProp('Texto del botón de aplicar, p. ej. «Marcar» o «Guardar»'),
    sections: { type: 'array', description: 'Secciones: cada una, un bloque (lista) con título opcional y sus elementos', items: { type: 'object', required: ['elements'], properties: {
      title: stringProp('Título de la sección'),
      elements: { type: 'array', items: { type: 'object', required: ['type'], properties: {
        type: { type: 'string', enum: UI_TYPES, description: 'text: solo texto; check: casilla; toggle: interruptor; radio: elegir una opción; chips: chips (varias con multiple); select: selector; input: campo (text, number, date o time); textarea: texto largo; button: botón que aplica al instante' },
        key: stringProp('Clave única del elemento: con ella recibes su valor y puedes usarlo en las acciones como {{clave}}'),
        label: stringProp('Texto principal (o etiqueta del campo)'), detail: stringProp('Texto secundario'), placeholder: stringProp('Texto de ayuda del campo'),
        checked: { type: 'boolean', description: 'check o toggle: marcado de inicio' }, value: { description: 'Valor inicial: texto en input, textarea, radio, select o chips; lista de valores en chips multiple' },
        input: { type: 'string', enum: INPUT_TYPES, description: 'input: tipo de campo' }, multiple: { type: 'boolean', description: 'chips: se pueden marcar varios' }, required: { type: 'boolean', description: 'input o textarea: obligatorio' },
        options: { type: 'array', description: 'radio, chips o select: opciones', items: { type: 'object', required: ['label'], properties: { value: stringProp('Valor (si no, el texto)'), label: stringProp('Texto'), detail: stringProp('Texto secundario (solo en radio)'), action: ACTION } } },
        action: ACTION,
      } } },
    } } },
    actions: { type: 'array', description: 'Acciones globales al aplicar (p. ej. edit_product con los valores de los campos como {{clave}})', items: ACTION },
  }, ['title', 'sections']),
  tool('create_product', 'Úsala en cuanto pidan crear o añadir un producto (medicamento o suplemento), aunque falten datos: abre un formulario editable con lo que propongas y quien usa la app completa el resto', productProps()),
  tool('edit_product', 'Úsala en cuanto pidan modificar, cambiar o editar algo de un producto (dosis, pauta, momentos, coste…), aunque no digan el valor nuevo: abre un formulario con el producto y tus cambios, si los hay', { id: stringProp('Id del producto'), ...productProps() }, ['id']),
  tool('delete_product', 'Úsala en cuanto pidan borrar o eliminar un producto (sus tomas se conservan)', { id: stringProp('Id del producto') }, ['id']),
  tool('add_record', 'Úsala en cuanto pidan marcar, registrar o apuntar una toma, aunque no digan momento ni día (el formulario sale con el primer momento del producto ese día y hoy)', { id: stringProp('Id del producto'), timing: timingProp('Momento; si no, el primero del producto ese día'), day: stringProp('Día AAAA-MM-DD; si no, hoy'), time: stringProp('Hora HH:MM; si no, la actual') }, ['id']),
  tool('remove_record', 'Úsala en cuanto pidan desmarcar o quitar una toma (dejarla pendiente), aunque no digan momento ni día', { id: stringProp('Id del producto'), timing: timingProp('Momento; si no, el primero del producto ese día'), day: stringProp('Día AAAA-MM-DD; si no, hoy') }, ['id']),
  tool('edit_records', 'Úsala en cuanto pidan corregir, cambiar o reescribir tomas ya guardadas (la dosis, las indicaciones o el nombre con que quedaron), una o muchas a la vez, aunque no digan el valor nuevo: abre un formulario con el producto, los días, el momento y los valores nuevos', { id: stringProp('Id del producto'), from: stringProp('Primer día AAAA-MM-DD; si no, el de su primera toma'), to: stringProp('Último día AAAA-MM-DD; si no, el de su última toma'), timing: timingProp('Solo las tomas de ese momento; si no, de todos'), dose: stringProp('Dosis nueva (empieza por un número); vacía, no cambia'), notes: stringProp('Indicaciones nuevas; vacías, no cambian'), name: stringProp('Nombre nuevo; vacío, no cambia') }, ['id']),
  tool('edit_timing', 'Úsala en cuanto pidan cambiar un momento (nombre, horas, visible), aunque no digan el valor nuevo', { id: { type: 'string', enum: timingIds() }, name: stringProp('Nombre'), start: intProp('Hora de inicio 0-24'), end: intProp('Hora de fin 0-24'), visible: { type: 'boolean' } }, ['id']),
];

// ---------- Assistant: proposal forms ----------

// Proposal forms. For each tool: draft (the editable data built from what the assistant proposes, or null
// if invalid), title, brief (summary in the proposal list), fields (the fields' HTML; ui uses blocks,
// one list per section), validate (bad fields), apply (saves and returns the summary) and, when needed,
// button or danger (text and color of the save button) and live (card text recomputed while typing in a
// field, in the [data-live] element). Draft values are text, as in the fields.
const chipToggle = (kind, value, text, on, extra = '') => `<ion-chip data-chip="${kind}" data-value="${esc(value)}" ${extra} ${on ? 'color="primary"' : 'outline="true" color="medium"'}><ion-label>${esc(text)}</ion-label></ion-chip>`;
const chipAction = (kind, text, icon) => `<ion-chip data-chip="${kind}" outline="true" color="primary"><ion-icon name="${icon}"></ion-icon><ion-label>${text}</ion-label></ion-chip>`;
const productFields = d => `
  <ion-item><ion-input data-field="name" label="Nombre" label-placement="stacked" value="${esc(d.name)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="notes" label="Indicaciones" label-placement="stacked" value="${esc(d.notes)}"></ion-input></ion-item>
  <ion-item><ion-textarea data-field="refs" label="Referencias" label-placement="stacked" auto-grow="true" value="${esc(d.refs)}"></ion-textarea></ion-item>
  <ion-item><ion-textarea data-field="memo" label="Notas" label-placement="stacked" auto-grow="true" value="${esc(d.memo)}"></ion-textarea></ion-item>
  <ion-item><ion-input data-field="cost" type="number" inputmode="numeric" label="Coste del envase (€)" label-placement="stacked" placeholder="Sin coste" value="${esc(d.cost)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="units" type="number" inputmode="numeric" label="Dosis por envase" label-placement="stacked" placeholder="Sin indicar" value="${esc(d.units)}"></ion-input></ion-item>
  ${d.schedules.map((p, i) => `
  <ion-item><ion-input data-schedule-field="dose" data-row="${i}" label="Pauta ${i + 1}: dosis" label-placement="stacked" placeholder="1 comprimido" value="${esc(p.dose)}"></ion-input><ion-chip slot="end" outline="true" color="medium" data-chip="remove-schedule" data-row="${i}"><ion-icon name="close-outline"></ion-icon><ion-label>Quitar</ion-label></ion-chip></ion-item>
  <ion-item><ion-input data-schedule-field="start" data-row="${i}" type="date" label="Inicio" label-placement="stacked" value="${esc(p.start)}"></ion-input><ion-input data-schedule-field="days" data-row="${i}" type="number" inputmode="numeric" label="Duración (días)" label-placement="stacked" value="${esc(p.days)}"></ion-input></ion-item>
  <ion-item lines="none"><ion-label><p>Momentos de la pauta ${i + 1}</p><p>${visibleTimings().map(ti => chipToggle('schedule-timing', ti.id, label(ti.id), p.timings.includes(ti.id), `data-row="${i}"`)).join('')}</p>${p.bad ? '<p><ion-text color="danger">Marca al menos un momento</ion-text></p>' : ''}</ion-label></ion-item>`).join('')}
  <ion-item lines="none"><ion-label><p>${chipAction('add-schedule', 'Añadir pauta', 'add-outline')}</p></ion-label></ion-item>`;
const productDraft = (base, a) => ({ name: str(a.name ?? base.name), notes: str(a.notes ?? base.notes), refs: str(a.refs ?? base.refs), memo: str(a.memo ?? base.memo),
  cost: str(a.cost ?? base.cost), units: str(a.units ?? base.units),
  schedules: (Array.isArray(a.schedules) ? a.schedules : base.schedules).filter(p => p && typeof p === 'object').map(p => ({ dose: str(p.dose), start: str(p.start), days: str(p.days), timings: timingIds().filter(id => asList(p.timings).includes(id)) })) });
// A schedule without timings is invalid (marked on its row: «Marca al menos un momento»).
const productValidate = d => [
  ...failing([['name', d.name.trim()], ['cost', int(d.cost) !== null], ['units', int(d.units, 1) !== null]]),
  ...d.schedules.flatMap((p, i) => failing([['dose', amount(p.dose)], ['start', date(p.start)], ['days', int(p.days, 1)], ['timings', p.timings.length]]).map(f => `${f}:${i}`)),
];
const productValues = d => ({ name: d.name.trim(), notes: d.notes.trim(), refs: d.refs.trim(), memo: d.memo.trim(), cost: int(d.cost), units: int(d.units, 1),
  schedules: d.schedules.map(p => ({ dose: p.dose.trim(), start: p.start, days: int(p.days, 1), timings: p.timings })) });
// Timing chips of a record: the visible ones and, if hidden, the chosen one (so it is always shown selected).
const timingChips = d => [...new Set([...visibleTimings().map(ti => ti.id), d.timing])].filter(timingOf).map(id => chipToggle('pick-timing', id, label(id), d.timing === id)).join('');
const recordFields = (d, withTime) => `
  <ion-item lines="none"><ion-label><h2 class="medium">${esc(d.name)}</h2><p>${timingChips(d)}</p></ion-label></ion-item>
  <ion-item><ion-input data-field="day" type="date" label="Día" label-placement="stacked" value="${esc(d.day)}"></ion-input>${withTime ? `<ion-input data-field="time" type="time" label="Hora" label-placement="stacked" value="${esc(d.time)}"></ion-input>` : ''}</ion-item>`;
const HHMM = /^\d{1,2}:\d{2}$/;
const recordDraft = a => { const m = productOf(a.id), day = date(str(a.day)) || today(), t = str(a.time); return m && { id: m.id, name: m.name, timing: timingIds().includes(a.timing) ? a.timing : timingsOn(m, day)[0] ?? timingIds()[0], day, time: HHMM.test(t) ? t.padStart(5, '0') : '' }; };
const recordValidate = d => failing([['day', date(d.day)], ['time', d.time === '' || HHMM.test(d.time)]]);
// A proposal's final data, described as text for the assistant.
const productDescribe = d => {
  const v = productValues(d);
  return [`nombre «${v.name}»`, v.notes && `indicaciones «${v.notes}»`, v.refs && `referencias «${v.refs}»`, v.memo && `notas «${v.memo}»`,
    v.cost !== '' && `${v.cost} € por envase`, v.units !== '' && `${v.units} dosis por envase`,
    v.schedules.length ? `pautas: ${v.schedules.map(p => `${p.dose} desde el ${shortDate(p.start)} durante ${count(p.days, 'día', 'días')} en ${p.timings.map(label).join(', ')}`).join('; ')}` : 'sin pautas (no sale en la toma)'].filter(Boolean).join(', ');
};
const recordDescribe = d => `${d.name} en ${label(d.timing)} el ${shortDate(d.day)}${d.time ? ` a las ${d.time}` : ''}`;
const productBrief = d => `${d.name.trim() || 'Sin nombre'} · ${d.schedules[0]?.dose || 'sin dosis'} · ${(d.schedules[0]?.timings ?? []).map(label).join(', ') || 'sin momentos'}`;
const recordBrief = d => `${d.name} · ${label(d.timing)} · ${shortDate(d.day)}${d.time ? ` ${d.time}` : ''}`;
// Fixing stored records: those of the product between two days (by default, from its first to its last record) and,
// if chosen, of one timing; empty new values (dose, notes, name) change nothing. Also works for a deleted
// product (its records keep its id).
const recordsOf = d => state.records.filter(e => e.id === d.id && e.day >= d.from && e.day <= d.to && (!d.timing || e.timing === d.timing));
const recordsDraft = a => {
  const id = str(a.id), days = recordsOfProduct(id).map(e => e.day).sort(), product = productOf(id)?.name ?? state.records.find(e => e.id === id)?.name;
  return product ? { id, product, from: date(str(a.from)) || days[0] || today(), to: date(str(a.to)) || days.at(-1) || today(), timing: timingIds().includes(a.timing) ? a.timing : '', dose: str(a.dose), notes: str(a.notes), name: str(a.name) } : null;
};
const recordsFields = d => `
  <ion-item lines="none"><ion-label class="ion-text-wrap"><h2 class="medium">${esc(d.product)}</h2><p data-live>${recordsLive(d)}</p><p>${chipToggle('pick-timing', '', 'Todos', !d.timing)}${timingChips(d)}</p></ion-label></ion-item>
  <ion-item><ion-input data-field="from" type="date" label="Desde" label-placement="stacked" value="${esc(d.from)}"></ion-input><ion-input data-field="to" type="date" label="Hasta" label-placement="stacked" value="${esc(d.to)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="dose" label="Dosis nueva" label-placement="stacked" placeholder="Sin cambio" value="${esc(d.dose)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="notes" label="Indicaciones nuevas" label-placement="stacked" placeholder="Sin cambio" value="${esc(d.notes)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="name" label="Nombre nuevo" label-placement="stacked" placeholder="Sin cambio" value="${esc(d.name)}"></ion-input></ion-item>`;
const recordsLive = d => `${recordsLabel(recordsOf(d).length)} entre esos días`;
const recordsValidate = d => failing([['from', date(d.from)], ['to', date(d.to) && d.to >= d.from], ['dose', d.dose.trim() === '' || amount(d.dose)]]);
const recordsChanges = d => Object.fromEntries(['name', 'dose', 'notes'].map(k => [k, d[k].trim()]).filter(([, v]) => v));
const recordsBrief = d => `${d.product} · ${recordsLabel(recordsOf(d).length)} · ${shortDate(d.from)} – ${shortDate(d.to)}${d.timing ? ` · ${label(d.timing)}` : ''}`;
const recordsText = d => { const c = recordsChanges(d), names = { name: 'nombre', dose: 'dosis', notes: 'indicaciones' }; return Object.entries(c).map(([k, v]) => `${names[k]} «${v}»`).join(', ') || 'sin cambios'; };
// ---------- Assistant: dynamic UI (ui tool) ----------

// Dynamic UI: sections (one list each) of elements built with Ionic components. Each element has a key;
// its value (checked, chosen or typed) is stored in the draft, goes back to the assistant on apply and can be used
// in action arguments as {{key}}. Actions (of checked or chosen elements, of a pressed button and the global
// ones) run through their tool's form, without going through its card.
const normAction = a => a && typeof a === 'object' && ACTIONS.includes(a.tool) ? { tool: a.tool, args: a.args && typeof a.args === 'object' ? a.args : {} } : null;
const normOptions = o => (Array.isArray(o) ? o : []).filter(x => x && typeof x === 'object' && str(x.label ?? x.value).trim())
  .map(x => ({ value: str(x.value ?? x.label).trim(), label: str(x.label ?? x.value).trim(), detail: str(x.detail).trim(), action: normAction(x.action) }));
function uiDraft(a) {
  const values = {}; let n = 0;
  const sections = (Array.isArray(a.sections) ? a.sections : []).map(sec => ({ title: str(sec?.title).trim(), elements: (Array.isArray(sec?.elements) ? sec.elements : [])
    .filter(el => el && typeof el === 'object' && UI_TYPES.includes(el.type)).map(el => {
      const e = { type: el.type, key: str(el.key).trim() || `e${++n}`, label: str(el.label ?? el.text).trim(), detail: str(el.detail).trim(), placeholder: str(el.placeholder).trim(),
        input: INPUT_TYPES.includes(el.input) ? el.input : 'text', multiple: el.multiple === true, required: el.required === true, options: normOptions(el.options), action: normAction(el.action) };
      const has = v => e.options.some(o => o.value === v);
      if (e.type === 'check' || e.type === 'toggle') values[e.key] = el.checked === true || el.value === true;
      else if (e.type === 'radio') values[e.key] = has(str(el.value)) ? str(el.value) : e.options[0]?.value ?? '';
      else if (e.type === 'select') values[e.key] = has(str(el.value)) ? str(el.value) : '';
      else if (e.type === 'chips') values[e.key] = e.multiple ? asList(el.value).filter(has) : has(str(el.value)) ? str(el.value) : '';
      else if (e.type === 'input' || e.type === 'textarea') values[e.key] = str(el.value);
      return e;
    }) })).filter(sec => sec.elements.length);
  if (!sections.length) return null;
  return { title: str(a.title).trim() || 'Interfaz', confirm: str(a.confirm).trim() || 'Aplicar', sections, values, pressed: null, actions: (Array.isArray(a.actions) ? a.actions : []).map(normAction).filter(Boolean) };
}
const uiElements = d => d.sections.flatMap(sec => sec.elements);
const uiSub = x => x.detail ? `<br><ion-text color="medium">${esc(x.detail)}</ion-text>` : '';
const UI_ELEMENTS = {
  text: (e, v) => `<ion-item><ion-label class="ion-text-wrap"><h2>${esc(e.label)}</h2>${e.detail ? `<p>${esc(e.detail)}</p>` : ''}</ion-label></ion-item>`,
  check: (e, v) => `<ion-item><ion-checkbox class="ion-text-wrap" data-ui="${esc(e.key)}" label-placement="end" justify="start" ${v ? 'checked' : ''}>${esc(e.label)}${uiSub(e)}</ion-checkbox></ion-item>`,
  toggle: (e, v) => `<ion-item><ion-toggle class="ion-text-wrap" data-ui="${esc(e.key)}" ${v ? 'checked' : ''}>${esc(e.label)}${uiSub(e)}</ion-toggle></ion-item>`,
  radio: (e, v) => `${e.label ? `<ion-item lines="none"><ion-label><p>${esc(e.label)}</p></ion-label></ion-item>` : ''}<ion-radio-group data-ui="${esc(e.key)}" value="${esc(v)}">${e.options.map(o =>
    `<ion-item><ion-radio class="ion-text-wrap" value="${esc(o.value)}" label-placement="end" justify="start">${esc(o.label)}${uiSub(o)}</ion-radio></ion-item>`).join('')}</ion-radio-group>`,
  chips: (e, v) => `<ion-item lines="none"><ion-label>${e.label ? `<p>${esc(e.label)}</p>` : ''}<p>${e.options.map(o => {
    const on = e.multiple ? v.includes(o.value) : v === o.value;
    return chipToggle('ui', o.value, o.label, on, `data-ui="${esc(e.key)}"`); }).join('')}</p></ion-label></ion-item>`,
  select: (e, v) => `<ion-item><ion-select data-ui="${esc(e.key)}" label="${esc(e.label)}" label-placement="stacked" interface="action-sheet" cancel-text="Cancelar" placeholder="${esc(e.placeholder || 'Elige')}" value="${esc(v)}">${e.options.map(o =>
    `<ion-select-option value="${esc(o.value)}">${esc(o.label)}</ion-select-option>`).join('')}</ion-select></ion-item>`,
  input: (e, v) => `<ion-item><ion-input data-ui="${esc(e.key)}" type="${e.input}" ${e.input === 'number' ? 'inputmode="numeric"' : ''} label="${esc(e.label)}" label-placement="stacked" placeholder="${esc(e.placeholder)}" value="${esc(v)}"></ion-input></ion-item>`,
  textarea: (e, v) => `<ion-item><ion-textarea data-ui="${esc(e.key)}" label="${esc(e.label)}" label-placement="stacked" auto-grow="true" placeholder="${esc(e.placeholder)}" value="${esc(v)}"></ion-textarea></ion-item>`,
  button: (e, v) => `<ion-item button="true" detail="false" data-ui-button="${esc(e.key)}"><ion-label color="primary" class="ion-text-wrap">${esc(e.label)}${e.detail ? `<p>${esc(e.detail)}</p>` : ''}</ion-label></ion-item>`,
};
const uiElement = (e, v) => UI_ELEMENTS[e.type](e, v);
const uiBlocks = d => d.sections.map(sec => `${sec.title ? `<ion-list-header><ion-label>${esc(sec.title)}</ion-label></ion-list-header>` : ''}<ion-list inset="true">${sec.elements.map(e => uiElement(e, d.values[e.key])).join('')}</ion-list>`).join('');
// An element's value, as text, for the assistant.
const uiValue = (e, d) => {
  const v = d.values[e.key], opt = x => e.options.find(o => o.value === x)?.label ?? x;
  if (e.type === 'button') return d.pressed === e.key ? 'pulsado' : 'no pulsado';
  if (Array.isArray(v)) return v.map(opt).join(', ') || 'ninguno';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  return opt(v) || '—';
};
// {{key}} in action arguments: the element's value (as is if it is the whole text; otherwise inside it).
const fill = (args, values) => JSON.parse(JSON.stringify(args), (k, v) => typeof v !== 'string' ? v
  : /^\{\{[^{}]+\}\}$/.test(v) ? values[v.slice(2, -2)] ?? '' : v.replace(/\{\{([^{}]+)\}\}/g, (_, key) => str(values[key])));
const runAction = (name, a) => {
  const f = FORMS[a.tool], d = f.draft(a.args);
  if (!d) return `${name}: no se ha podido (no existe)`;
  if (f.validate(d).length) return `${name}: no se ha podido (faltan datos o no valen)`;
  return `${name}: ${f.apply(d) ?? 'no se ha podido'}`;
};
const FORMS = {
  ui: {
    draft: uiDraft, key: a => str(a.title).trim().toLowerCase(), missing: () => 'la interfaz no tiene ninguna sección con elementos válidos.', title: d => d.title, button: d => d.confirm, blocks: uiBlocks,
    describe: d => uiElements(d).filter(e => e.type !== 'text').map(e => `${e.label || e.key}: ${uiValue(e, d)}`).join('; ') || 'sin elementos',
    brief: d => count(uiElements(d).filter(e => e.type !== 'text').length, 'elemento', 'elementos'),
    validate: d => uiElements(d).filter(e => (e.type === 'input' || e.type === 'textarea') && e.required && !str(d.values[e.key]).trim()).map(e => `@${e.key}`),
    apply: d => {
      const runs = [], run = (name, a) => { if (a) runs.push(runAction(name, { tool: a.tool, args: fill(a.args, d.values) })); };
      for (const e of uiElements(d)) {
        const v = d.values[e.key], chosen = e.options.filter(o => e.type === 'chips' && e.multiple ? v.includes(o.value) : v === o.value);
        if ((e.type === 'check' || e.type === 'toggle') && v) run(e.label, e.action);
        if (e.type === 'radio' || e.type === 'select' || e.type === 'chips') chosen.forEach(o => run(o.label, o.action));
        if (e.type === 'button' && d.pressed === e.key) run(e.label, e.action);
      }
      d.actions.forEach(a => run(d.title, a));
      return runs.length ? runs.join('; ') : `${d.title}: aplicado`;
    },
  },
  create_product: {
    draft: a => productDraft(EMPTY_PRODUCT, a), key: a => str(a.name).trim().toLowerCase(),
    title: () => 'Nuevo producto', brief: productBrief, fields: productFields, validate: productValidate, describe: productDescribe,
    apply: d => { const v = productValues(d); state.products.push(newProduct(v)); return `Producto «${v.name}» creado`; },
  },
  edit_product: {
    draft: a => { const m = productOf(a.id); return m && { id: m.id, ...productDraft(m, a) }; },
    title: d => `Cambiar el producto «${productOf(d.id)?.name ?? d.name}»`, brief: productBrief, fields: productFields, validate: productValidate, describe: productDescribe,
    apply: d => {
      const m = productOf(d.id); if (!m) return null;
      updateProduct(m, productValues(d));
      return `Producto «${m.name}» cambiado`;
    },
  },
  delete_product: {
    draft: a => { const m = productOf(a.id); return m && { id: m.id, name: m.name }; },
    title: () => 'Borrar producto', danger: 'Borrar', brief: d => `${d.name} · se conservan sus tomas`, describe: d => d.name,
    fields: d => `<ion-item lines="none"><ion-label><h2 class="medium">${esc(d.name)}</h2><p>Sus tomas registradas se conservan.</p></ion-label></ion-item>`,
    validate: () => [],
    apply: d => { deleteProduct(d.id); return `Producto «${d.name}» borrado`; },
  },
  add_record: {
    draft: recordDraft, title: () => 'Marcar toma', brief: recordBrief, fields: d => recordFields(d, true), validate: recordValidate, describe: recordDescribe,
    apply: d => {
      const m = productOf(d.id); if (!m) return null;
      if (!recordOf(d.id, d.timing, d.day)) addRecord(m, d.timing, d.day, d.time ? new Date(`${d.day}T${d.time.padStart(5, '0')}`) : new Date());
      return `«${m.name}» marcado en ${label(d.timing)} el ${shortDate(d.day)}`;
    },
  },
  remove_record: {
    draft: recordDraft, title: () => 'Dejar pendiente', brief: recordBrief, fields: d => recordFields(d, false), validate: recordValidate, describe: recordDescribe,
    apply: d => { removeRecord(d.id, d.timing, d.day); return `«${d.name}» pendiente en ${label(d.timing)} el ${shortDate(d.day)}`; },
  },
  edit_records: {
    draft: recordsDraft, missing: () => `no hay ningún producto ni toma con ese id. ${existing()}`, title: () => 'Corregir tomas', brief: recordsBrief, fields: recordsFields, live: recordsLive, validate: recordsValidate,
    describe: d => `${recordsLabel(recordsOf(d).length)} de ${d.product} del ${shortDate(d.from)} al ${shortDate(d.to)}${d.timing ? ` en ${label(d.timing)}` : ''}: ${recordsText(d)}`,
    apply: d => { const rows = recordsOf(d), changes = recordsChanges(d); for (const e of rows) Object.assign(e, changes); return `${recordsLabel(rows.length)} de «${d.product}» ${rows.length === 1 ? 'cambiada' : 'cambiadas'}: ${recordsText(d)}`; },
  },
  edit_timing: {
    missing: () => `no existe ese momento. ${existingTimings()}`,
    draft: a => { const ti = timingOf(a.id); return ti && { id: ti.id, name: str(a.name ?? ti.name), start: str(a.start ?? ti.start), end: str(a.end ?? ti.end), visible: typeof a.visible === 'boolean' ? a.visible : ti.visible }; },
    title: d => `Cambiar el momento «${label(d.id)}»`,
    brief: d => `${d.name.trim() || 'Sin nombre'} · ${d.start !== '' || d.end !== '' ? `${d.start || '?'}–${d.end || '?'} h` : 'sin horas'} · ${d.visible ? 'visible' : 'oculto'}`,
    fields: d => `
  <ion-item><ion-input data-field="name" label="Nombre" label-placement="stacked" placeholder="Sin nombre" value="${esc(d.name)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="start" type="number" inputmode="numeric" label="Hora de inicio (de 0 a 24)" label-placement="stacked" placeholder="Sin hora" value="${esc(d.start)}"></ion-input><ion-input data-field="end" type="number" inputmode="numeric" label="Hora de fin (de 0 a 24)" label-placement="stacked" placeholder="Sin hora" value="${esc(d.end)}"></ion-input></ion-item>
  <ion-item lines="none"><ion-label><p>${chipToggle('visible', 'visible', 'Visible en la toma', d.visible)}</p></ion-label></ion-item>`,
    validate: d => failing([['start', hour(d.start) !== null], ['end', hour(d.end) !== null]]),
    describe: d => `nombre «${d.name.trim()}», ${d.start !== '' || d.end !== '' ? `de ${d.start || '?'} a ${d.end || '?'} h` : 'sin horas'}, ${d.visible ? 'visible' : 'oculto'}`,
    apply: d => { Object.assign(timingOf(d.id), { name: d.name.trim(), start: hour(d.start), end: hour(d.end), visible: d.visible }); return `Momento «${label(d.id)}» cambiado`; },
  },
};

// ---------- Assistant: deciding proposals ----------

// Pending proposals of this turn: the assistant loop waits for the user to save or discard them.
const resolvers = new Map();
let chatEpoch = 0, awaiting = false;
const pendingProposals = () => chatView.filter(v => v.who === 'proposal' && v.status === 'pending');
// The assistant is answered in text, never JSON, so it does not echo it to the user.
const pushToolResult = (callId, content) => { if (!chat.some(m => m.role === 'tool' && m.tool_call_id === callId)) chat.push({ role: 'tool', tool_call_id: callId, content }); };
function decide(v, saved) {
  if (v.status !== 'pending') return; // already decided (e.g. double tap on «Guardar»): never applied twice
  const form = FORMS[v.tool];
  if (saved) {
    const summary = form.apply(v.draft);
    Object.assign(state, clean(state)); commit(); // normalise after an assistant write (timing orders, sorted schedules and records)
    v.status = 'saved'; v.text = summary ?? 'No se ha podido aplicar';
    pushToolResult(v.id, summary ? `Has guardado la propuesta. ${summary}. Datos finales (con los cambios que hayas hecho): ${form.describe(v.draft)}.` : 'No se ha podido aplicar: ya no existe.');
  } else {
    v.status = 'discarded'; v.text = `${form.title(v.draft)}: propuesta descartada`;
    pushToolResult(v.id, 'Has descartado la propuesta; no se ha cambiado nada.');
  }
  resolvers.get(v.id)?.(); resolvers.delete(v.id);
}
// Saves a proposal if its data is valid; otherwise marks the failing fields red with their message below. The message
// (errorText) is set only then and cleared on typing: with it fixed, Ionic draws a section below the field with
// its own border even when the message is hidden, and the field shows two lines.
const FIELD_ERRORS = { name: 'Pon un nombre', cost: 'Número entero, o vacío', units: 'Número entero, o vacío', day: 'Pon el día', time: 'Hora HH:MM, o vacía', start: 'De 0 a 24', end: 'De 0 a 24', from: 'Pon el día', to: 'Día igual o posterior a «Desde»', dose: 'Empieza por un número, o vacía' };
const SCHEDULE_ERRORS = { dose: 'Empieza por un número', start: 'Pon la fecha', days: 'Días, un número entero' };
// The input of a failing check in a card: «@key» of a ui element, «field» or «field:row» of a schedule.
const badField = (card, f) => { const [field, row] = f.split(':'); return !card ? null : f.startsWith('@') ? card.querySelector(`[data-ui="${f.slice(1)}"]`) : row === undefined ? card.querySelector(`[data-field="${field}"]`) : card.querySelector(`[data-schedule-field="${field}"][data-row="${row}"]`); };
function trySave(v, card) {
  if (v.status !== 'pending') return false;
  const bad = FORMS[v.tool].validate(v.draft);
  for (const f of bad) if (f.startsWith('timings:')) v.draft.schedules[Number(f.split(':')[1])].bad = true;
  if (card && bad.some(f => f.startsWith('timings:'))) { const parent = card.parentElement, key = card.dataset.proposal; refreshCard(card, v); card = parent.querySelector(`[data-proposal="${key}"]`); }
  for (const f of bad.filter(f => !f.startsWith('timings:'))) {
    const [field, row] = f.split(':'), el = badField(card, f);
    if (!el) continue;
    el.errorText = f.startsWith('@') ? 'Obligatorio' : (row === undefined ? FIELD_ERRORS : SCHEDULE_ERRORS)[field] ?? 'Revisa este dato';
    el.classList.add('ion-invalid', 'ion-touched');
  }
  if (bad.length) return false;
  decide(v, true);
  return true;
}

// ---------- Assistant: Markdown and charts ----------

// Markdown (marked) and charts (Chart.js) in replies: loaded from the CDN the first time the assistant opens.
// The Markdown lets no HTML nor non-http(s) links through; a ```chart block with JSON
// { "type": "bar" | "line" | "pie" | "doughnut", "labels": [...], "datasets": [{ "label": "...", "data": [...] }] }
// is drawn as a chart. If they fail to load, the text is shown as is.
const MARKED = 'https://cdn.jsdelivr.net/npm/marked@18.0.14/lib/marked.esm.js';
const CHARTJS = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/auto/+esm';
const CHART_COLORS = ['#6dd0f9', '#78b7af', '#e47969', '#f5a142', '#9b8bd6', '#7cc576'];
let marked = null, Chart = null, charts = [], libs = null;
const loadLibs = () => libs ??= Promise.all([import(MARKED), import(CHARTJS)]).then(([m, c]) => {
  marked = new m.Marked({ gfm: true, breaks: true, renderer: {
    html: ({ text }) => esc(text),
    heading(token) { return `<h2 class="medium">${this.parser.parseInline(token.tokens)}</h2>`; },
    paragraph(token) { return `<div class="md-p">${this.parser.parseInline(token.tokens)}</div>`; }, // a <p> inside ion-label renders grey and small
    image: ({ text }) => esc(text),
    link(token) { const inner = this.parser.parseInline(token.tokens); return /^https?:\/\//.test(token.href) ? `<a href="${esc(token.href)}" target="_blank" rel="noopener">${inner}</a>` : inner; },
    code: ({ text, lang }) => lang === 'chart' ? `<div class="md-chart"><canvas data-chart="${esc(text)}"></canvas></div>` : false,
  } });
  Chart = c.default;
}).catch(() => {});
const markdown = text => marked ? marked.parse(String(text)) : linkify(text);

// Draws the charts of ```chart blocks; invalid JSON leaves a notice in its place.
function drawCharts() {
  if (!Chart) return;
  Chart.defaults.color = getComputedStyle(chatBody).color;
  for (const canvas of chatBody.querySelectorAll('canvas[data-chart]')) {
    try {
      const spec = JSON.parse(canvas.dataset.chart);
      const round = ['pie', 'doughnut'].includes(spec.type);
      if (!['bar', 'line', 'pie', 'doughnut'].includes(spec.type) || !Array.isArray(spec.labels) || !Array.isArray(spec.datasets)) throw new Error();
      charts.push(new Chart(canvas, {
        type: spec.type,
        data: { labels: spec.labels.map(String), datasets: spec.datasets.map((d, i) => ({
          label: String(d.label ?? ''), data: (d.data ?? []).map(Number),
          backgroundColor: round ? spec.labels.map((_, j) => CHART_COLORS[j % CHART_COLORS.length]) : CHART_COLORS[i % CHART_COLORS.length],
          borderColor: round ? undefined : CHART_COLORS[i % CHART_COLORS.length],
        })) },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: round || spec.datasets.length > 1 } } },
      }));
    } catch {
      canvas.parentElement.outerHTML = '<ion-text color="medium">(Gráfica no válida)</ion-text>';
    }
  }
}

// ---------- Assistant: suggestions ----------

// Suggestions: proposed by the model itself with a separate request (no tools) that gets all the data, the time
// of day, the chat and what it can do. Stored in this browser and requested the first time (if none is stored;
// also on app load, in the background), after each reply (cleared on send; half of the new ones follow the thread
// of the reply, the other half are free), on «Más» or after «Limpiar». If the service fails or takes over 25 s, they are picked at random from a local pool built from the data (suggestionPool).
const SUGGEST_KEY = 'dosify-suggestions';
let suggested = (() => { const v = load(SUGGEST_KEY); return Array.isArray(v?.list) ? v.list.filter(q => typeof q === 'string') : []; })();
let suggestLoading = null; // promise of the request in flight
function suggestionPool() {
  const products = state.products.filter(m => !paused(m)), day = today(), h = new Date().getHours();
  const timing = timingNow(), timingName = timing ? label(timing) : 'ahora';
  const pendingNow = dayRows(timing, day).pending;
  const recorded = products.filter(m => recordsOfProduct(m.id).length), priced = products.filter(m => m.cost !== ''), ending = products.filter(m => m.schedules.length && scheduleEnd(m.schedules.at(-1)) <= addDays(day, 7));
  const week = state.records.filter(e => e.day >= addDays(day, -7)).length, pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const some = products.length ? pick(products) : null, withRecords = recorded.length ? pick(recorded) : null;
  return [
    // Right now
    ...(pendingNow.length ? [`Hazme una lista con check para marcar lo que me toca en ${timingName}.`, `¿Qué me queda por tomar en ${timingName}?`] : []),
    ...(products.length ? ['¿Qué me falta por tomar hoy?', h >= 20 ? '¿Me queda algo pendiente de hoy antes de dormir?' : h < 12 ? '¿Qué tengo que tomar a lo largo del día de hoy?' : '¿Qué me queda por tomar en lo que falta de día?'] : []),
    // Containers and purchases
    ...products.filter(m => figures(m).end).map(m => `¿Cuándo se me acaba ${m.name} y cuántas dosis me quedan del envase?`),
    ...(products.some(m => figures(m).end) ? [`¿Qué tengo que comprar en los próximos ${SHOP_DAYS} días? Hazme la lista con precios.`, '¿Qué envase se me acaba antes?'] : []),
    ...(products.some(m => m.units === '' || m.cost === '') ? ['Hazme un formulario para completar el coste y las dosis por envase de los productos que no lo tienen.'] : []),
    // Costs
    ...(priced.length ? ['¿Cuánto me gasto al mes y en qué? Hazme una tabla por producto.', '¿Qué producto me sale más caro al día?', 'Hazme una gráfica de tarta con el reparto del gasto mensual por producto.'] : []),
    ...(priced.length && state.records.length ? ['¿Cuánto me he gastado este mes según las tomas registradas?'] : []),
    // History
    ...(state.records.length ? ['¿Cómo he cumplido las tomas esta semana? Hazme una tabla por día.', '¿Qué tomas se me olvidaron en los últimos 7 días?', 'Hazme una gráfica de las tomas por día de los últimos 14 días.'] : []),
    ...(week > 7 ? ['¿Qué día de la semana se me olvidan más tomas?', '¿En qué momento cumplo peor?'] : []),
    ...(withRecords ? [`Resume el registro de ${withRecords.name} en una tabla.`, `¿A qué hora suelo tomar ${withRecords.name}?`, `¿Cuántas dosis de ${withRecords.name} llevo tomadas en total?`] : []),
    // Schedules
    ...products.filter(m => m.schedules.length > 1).map(m => `¿Cómo ha cambiado la dosis de ${m.name} según sus pautas?`),
    ...(ending.length ? [`¿Qué productos terminan esta semana y cuándo?`] : []),
    ...(state.products.some(paused) ? ['¿Qué productos tengo pausados y por qué?'] : []),
    // Changes through a form
    ...(some ? [`Quiero cambiar los momentos de la pauta de ${some.name}.`, `Añade una pauta nueva a ${some.name}.`, `Quiero cambiar el coste y las dosis por envase de ${some.name}.`] : []),
    ...(products.length ? ['Hazme una tabla con mis productos: dosis de hoy, momentos, coste y fin del envase.', 'Revisa mis productos y dime si ves algo raro o incompleto.', 'Quiero añadir un producto nuevo.'] : ['Ayúdame a crear mi primer producto.', 'Crea un producto de ejemplo para ver cómo funciona.']),
    // More
    ...(state.timings.some(ti => ti.visible && (ti.start === '' || ti.end === '')) ? ['Quiero poner horas a mis momentos.'] : []),
    '¿Qué puedes hacer por mí?',
  ];
}
const localSuggestions = (count, exclude = []) => { const asked = new Set([...chat.filter(m => m.role === 'user').map(m => m.content), ...exclude]); return [...new Set(suggestionPool())].filter(q => !asked.has(q)).sort(() => Math.random() - 0.5).slice(0, count); };
// Stored ones are shown as is; if none, they are requested (and only the loading row shows meanwhile).
function suggestions(count) {
  if (!suggested.length && !suggestLoading) requestSuggestions(count);
  return suggested.length ? suggested : null;
}
// One request at a time: a reply to a superseded request is ignored; if the service takes over 25 s
// or fails, the local pool is used.
let suggestRequest = 0;
const suggestCount = () => chatView.length ? 3 : 4;
const resetSuggestions = () => { suggested = []; suggestRequest++; suggestLoading = null; };
function requestSuggestions(count, exclude = []) {
  const id = ++suggestRequest;
  suggestLoading = askSuggestions(count, exclude).catch(() => localSuggestions(count, exclude)).then(list => {
    if (id !== suggestRequest) return;
    suggestLoading = null;
    suggested = list;
    try { localStorage.setItem(SUGGEST_KEY, JSON.stringify({ list })); } catch {}
    if (!chatBusy && !awaiting) renderChat();
  });
}
// The request: the same context as a question, no tools, and the reply as a JSON array of strings.
async function askSuggestions(count, exclude) {
  const recent = chat.filter(m => (m.role === 'user' || m.role === 'assistant') && m.content).slice(-6).map(m => ({ role: m.role, content: m.content }));
  const asked = chat.filter(m => m.role === 'user').map(m => m.content);
  const linked = recent.some(m => m.role === 'assistant') ? ` La mitad de ellas (${Math.ceil(count / 2)}) deben seguir el hilo de tu última respuesta y de la conversación: profundizar, detallar o actuar sobre lo que acabas de decir (por ejemplo, si has mostrado una tabla, pedir una gráfica, un detalle o un cambio sobre esos mismos datos); la otra mitad, libres: otras cosas útiles ahora mismo con sus datos.` : '';
  const question = `Propón ${count} sugerencias de lo que quien usa la app podría pedirte ahora mismo, escritas como las escribiría esa persona, en primera persona y de tú («¿Qué me falta por tomar hoy?», «Hazme una lista con check para marcar las tomas de la mañana»), breves (menos de 90 caracteres), variadas, concretas con sus datos (nombres de productos, momentos, envases, costes, historial) y útiles según la hora del día y la conversación.${linked} Combina tipos: consultas con tablas o gráficas, interacciones que lleven a una interfaz (marcar tomas, elegir, rellenar o editar con formulario) y cambios de datos. No propongas nada que no se pueda hacer con los datos o las herramientas, ni lo ya preguntado${asked.length ? ` (${asked.slice(-8).map(q => `«${q}»`).join(', ')})` : ''}${exclude.length ? `, ni estas: ${exclude.map(q => `«${q}»`).join(', ')}` : ''}. Responde solo con un array JSON de ${count} strings, sin nada más.`;
  const message = await complete({ messages: [{ role: 'system', content: systemPrompt() }, ...recent, { role: 'user', content: question }] }, AbortSignal.timeout(25000));
  const text = str(message?.content), json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  const list = [...new Set(JSON.parse(json).filter(q => typeof q === 'string').map(q => q.trim()).filter(q => q && q.length <= 140))].slice(0, count);
  if (!list.length) throw new Error('vacío');
  return list;
}
// While new suggestions are requested the old ones are not shown: only the loading row.
const suggestionList = qs => `
  <ion-list-header><ion-label>Sugerencias</ion-label>${qs ? '<ion-button id="suggest-more" fill="clear" size="small"><ion-icon slot="start" name="shuffle-outline"></ion-icon>Más</ion-button>' : ''}</ion-list-header>
  <ion-list inset="true">${(qs ?? []).map(q => `<ion-item button="true" detail="false" data-suggest="${esc(q)}"><ion-icon slot="start" name="sparkles-outline" color="teal"></ion-icon><ion-label class="ion-text-wrap" color="teal">${esc(q)}</ion-label></ion-item>`).join('')
    }${suggestLoading || !qs ? '<ion-item lines="none"><ion-spinner slot="start" name="dots" color="medium"></ion-spinner><ion-label color="medium">Proponiendo sugerencias…</ion-label></ion-item>' : ''}</ion-list>`;

// ---------- Assistant: chat rendering ----------

// Status line of a proposal or action (saved / discarded), as a row or as its own list.
const statusItem = (ok, text, attrs = '') => `<ion-item ${attrs}><ion-icon slot="start" name="${ok ? 'checkmark-circle' : 'close-circle'}" color="${ok ? 'success' : 'medium'}"></ion-icon><ion-label class="ion-text-wrap" color="medium">${esc(text)}</ion-label></ion-item>`;
const actionLine = (ok, text) => `<ion-list inset="true">${statusItem(ok, text, 'lines="none"')}</ion-list>`;
// Body and save button of a proposal form, shared by the card and the edit view.
const formBody = (form, d) => form.blocks ? form.blocks(d) : `<ion-list inset="true">${form.fields(d)}</ion-list>`;
const saveText = (form, d) => form.danger ?? form.button?.(d) ?? 'Guardar';
// Proposal card: title, editable fields and «Descartar» / «Guardar» (or «Borrar»); once saved or discarded,
// it stays as a single line.
const proposalCard = (v, i) => {
  const form = FORMS[v.tool];
  if (v.status !== 'pending') return actionLine(v.status === 'saved', v.text);
  return `<div data-proposal="${i}">
    <ion-list-header><ion-label>${esc(form.title(v.draft))}</ion-label></ion-list-header>
    ${formBody(form, v.draft)}
    <div class="proposal-actions">
      <ion-button fill="outline" color="medium" data-act="discard">Descartar</ion-button>
      <ion-button ${form.danger ? 'color="danger"' : ''} data-act="save">${saveText(form, v.draft)}</ion-button>
    </div>
  </div>`;
};
const BLOCKS = {
  user: (v, i) => `<ion-list inset="true"><ion-item lines="none"><ion-label class="ion-text-wrap ion-text-end"><ion-text color="teal" class="medium">${linkify(v.text)}</ion-text></ion-label></ion-item>${messageBar(i, true)}</ion-list>`,
  assistant: (v, i) => `<ion-list inset="true"><ion-item lines="none"><ion-label class="ion-text-wrap">${markdown(v.text)}</ion-label></ion-item>${messageBar(i, false)}</ion-list>`,
  action: (v, i) => actionLine(v.ok, v.text),
  error: (v, i) => `<ion-list inset="true"><ion-item lines="none"><ion-label class="ion-text-wrap" color="danger">${esc(v.text)}</ion-label></ion-item></ion-list>`,
  proposal: (v, i) => proposalCard(v, i),
};
const block = (v, i) => BLOCKS[v.who](v, i);
// Several consecutive proposals (e.g. several products) are shown as a list: one row per proposal, which opens
// in an edit view; saved or discarded ones stay as lines.
const proposalRow = (v, i) => {
  const form = FORMS[v.tool];
  if (v.status !== 'pending') return statusItem(v.status === 'saved', v.text);
  return `<ion-item button="true" data-open="${i}"><ion-icon slot="start" name="${v.bad ? 'alert-circle-outline' : 'create-outline'}" color="${v.bad ? 'danger' : 'primary'}"></ion-icon><ion-label class="ion-text-wrap"><h2 class="medium">${esc(form.title(v.draft))}</h2><p>${esc(form.brief(v.draft))}</p>${v.bad ? '<p><ion-text color="danger">Falta algún dato: ábrela para completarlo</ion-text></p>' : ''}</ion-label></ion-item>`;
};
const proposalList = idx => `
  <ion-list-header><ion-label>Propuestas (${idx.length})</ion-label></ion-list-header>
  <ion-list inset="true">${idx.map(i => proposalRow(chatView[i], i)).join('')}</ion-list>`;
// The chat blocks, grouping consecutive proposals into a list when several are pending.
function chatBlocks() {
  const out = [];
  for (let i = 0; i < chatView.length; i++) {
    if (chatView[i].who === 'proposal') {
      const idx = [];
      for (; i < chatView.length && chatView[i].who === 'proposal'; i++) idx.push(i);
      i--;
      // A list only when several are pending; otherwise each one as a card or a line.
      out.push(idx.filter(j => chatView[j].status === 'pending').length > 1 ? proposalList(idx) : idx.map(j => block(chatView[j], j)).join(''));
    } else out.push(block(chatView[i], i));
  }
  return out.join('');
}

// Edit view of a proposal from the list: works on a copy of the draft; «Guardar» applies it,
// «Cancelar» leaves the proposal pending as it was and «Descartar propuesta» discards it.
const proposalEditor = $('#proposal-editor');
let proposalEdit = null; // { i, v } with v a copy of the proposal
const editBlock = (v, i) => `<div data-proposal="${i}" data-edit="">
  ${formBody(FORMS[v.tool], v.draft)}
  <ion-list inset="true"><ion-item button="true" detail="false" id="proposal-discard"><ion-label color="danger" class="ion-text-center">Descartar propuesta</ion-label></ion-item></ion-list>
</div>`;
// The proposal (card or edit view) an element belongs to, and its re-render in place.
const proposalOf = el => { const card = el.closest('[data-proposal]'); return card && { card, v: 'edit' in card.dataset ? proposalEdit.v : chatView[Number(card.dataset.proposal)] }; };
const refreshCard = (card, v) => { card.outerHTML = ('edit' in card.dataset ? editBlock : proposalCard)(v, Number(card.dataset.proposal)); };
function openProposalEditor(i) {
  const v = chatView[i], form = FORMS[v.tool];
  proposalEdit = { i, v: { ...v, draft: structuredClone(v.draft) } };
  $('#proposal-title').textContent = form.title(v.draft);
  Object.assign($('#proposal-save'), { textContent: saveText(form, v.draft), color: form.danger ? 'danger' : '' });
  proposalBody.innerHTML = editBlock(proposalEdit.v, i);
  proposalEditor.present();
}

// With several pending proposals, a row to save or discard them all.
const allRow = () => pendingProposals().length > 1 ? `<div class="proposal-actions"><ion-button fill="outline" color="medium" data-act="discard-all">Descartar todas</ion-button><ion-button data-act="save-all">Guardar todas (${pendingProposals().length})</ion-button></div>` : '';
function renderChat() {
  saveChat();
  const ready = aiReady();
  charts.forEach(c => c.destroy()); charts = [];
  chatBody.innerHTML = (chatView.length ? chatBlocks() + allRow()
    : emptyList(ready ? 'Pregunta sobre tus productos, tomas, consumos o costes. También puedo crear o cambiar datos: te lo propongo en un formulario que revisas y guardas.' : 'Configura el asistente en Productos › Asistente (URL base, API key y modelo).'))
    + (chatBusy ? '<ion-list inset="true"><ion-item lines="none"><ion-spinner name="dots"></ion-spinner></ion-item></ion-list>'
      : awaiting ? emptyList('Guarda o descarta las propuestas para continuar; si envías otro mensaje, se descartan.')
      : ready ? suggestionList(suggestions(suggestCount())) : '');
  $('#chat-send').disabled = chatBusy || !ready;
  drawCharts();
  chatBody.scrollToBottom(200);
}

// ---------- Assistant: requests and the tool loop ----------

// One request to the service; the reply's message, or an error with the status and the start of its text.
async function complete(body, signal) {
  const res = await fetch(`${ai.url.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` }, signal, body: JSON.stringify({ model: ai.model, ...body }) });
  if (!res.ok) throw new Error(`El servicio respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).choices?.[0]?.message;
}
async function askModel() {
  const message = await complete({ messages: [{ role: 'system', content: systemPrompt() }, ...chat], tools: tools() });
  if (!message) throw new Error('El servicio no devolvió ninguna respuesta.');
  return message;
}

// Consistent history for the service: every assistant message with tool calls must be followed by one
// result per call. A missing one (an interrupted chat) counts as discarded; a stray result is removed.
function repairChat() {
  const out = []; let open = new Map(); // calls of the last assistant message: id → answered
  const close = () => { for (const [id, done] of open) if (!done) out.push({ role: 'tool', tool_call_id: id, content: 'Has descartado la propuesta; no se ha cambiado nada.' }); open = new Map(); };
  for (const m of chat) {
    if (m.role === 'tool') { if (open.get(m.tool_call_id) === false) { open.set(m.tool_call_id, true); out.push(m); } continue; }
    close();
    out.push(m);
    if (m.role === 'assistant' && m.tool_calls?.length) open = new Map(m.tool_calls.map(c => [c.id, false]));
  }
  close();
  chat = out;
}
// What exists right now, so the assistant corrects itself when it refers to something missing.
const existingTimings = () => `Los momentos que hay ahora son: ${state.timings.map(ti => `«${label(ti.id)}» (id ${ti.id})`).join(', ')}.`;
const existing = () => state.products.length ? `Los productos que hay ahora son: ${state.products.map(m => `«${m.name}» (id ${m.id})`).join(', ')}.` : 'Ahora mismo no hay ningún producto: si hace falta, créalo.';
// ---------- Assistant: message bar and «Texto» ----------

// Last row of each message: icons to copy it, view it on a screen where text can be selected (on mobile
// Ionic prevents it in the app) and, if it is yours, edit it (moves to the input box). Yours on the right,
// the assistant's on the left.
const textModal = $('#text-view');
const copyText = text => navigator.clipboard.writeText(text).catch(() => {});
const messageButton = (i, act, icon, title) => `<ion-button color="medium" data-msg="${i}" data-msg-act="${act}" aria-label="${title}" title="${title}"><ion-icon slot="icon-only" name="${icon}"></ion-icon></ion-button>`;
const messageBar = (i, mine) => `<ion-item lines="none" class="msg-actions"><ion-buttons slot="${mine ? 'end' : 'start'}">${messageButton(i, 'copy', 'copy-outline', 'Copiar')}${messageButton(i, 'select', 'text-outline', 'Seleccionar texto')}${mine ? messageButton(i, 'edit', 'create-outline', 'Editar') : ''}</ion-buttons></ion-item>`;
const MESSAGE_ACTIONS = {
  copy: v => copyText(v.text),
  // The «Texto» screen opens with all the text already selected.
  select: v => {
    $('#text-body').innerHTML = `<ion-list inset="true"><ion-item lines="none"><ion-label class="ion-text-wrap" id="text-content">${lines(v.text)}</ion-label></ion-item></ion-list>`;
    textModal.present().then(() => { const range = document.createRange(); range.selectNodeContents($('#text-content')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); });
  },
  edit: v => { chatInput.value = v.text; chatInput.setFocus(); },
};

// Sends the question and serves the tools the assistant asks for until it replies with text.
async function sendChat() {
  const question = String(chatInput.value ?? '').trim();
  if (!question || chatBusy || !aiReady()) return;
  chatInput.value = '';
  // Pending proposals (from this turn or another session) count as discarded before going on, and the loop
  // waiting for them, if any, is cancelled: bumping the epoch makes it end without asking for another reply.
  chatEpoch++; awaiting = false;
  for (const v of pendingProposals()) decide(v, false);
  resolvers.clear();
  repairChat();
  chat.push({ role: 'user', content: question });
  chatView.push({ who: 'user', text: question });
  // Suggestions are cleared; new ones are requested when the reply ends, so half of them follow its thread.
  resetSuggestions();
  const epoch = chatEpoch;
  chatBusy = true; renderChat();
  try {
    for (let turn = 0; turn < 8; turn++) {
      const message = await askModel();
      if (epoch !== chatEpoch) return;
      chat.push({ role: 'assistant', content: message.content ?? '', ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) });
      if (message.content) chatView.push({ who: 'assistant', text: message.content });
      if (!message.tool_calls?.length) break;
      // Each tool call becomes an editable proposal; wait until the user decides on all of them.
      const waits = [], seen = new Set();
      for (const call of message.tool_calls) {
        let args = {}; try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
        const form = FORMS[call.function.name], key = `${call.function.name} ${form?.key?.(args) ?? [args.id, args.timing, args.day, args.from, args.to].map(str).join('|')}`;
        if (seen.has(key)) { pushToolResult(call.id, 'Llamada repetida: ya has propuesto ese mismo cambio en este turno, no se propone otra vez.'); continue; }
        seen.add(key);
        const draft = form?.draft(args);
        if (!draft) { pushToolResult(call.id, `No se ha podido proponer: ${!form ? 'herramienta desconocida.' : form.missing?.() ?? `no existe ningún producto con ese id. ${existing()}`}`); continue; }
        chatView.push({ who: 'proposal', id: call.id, tool: call.function.name, draft, status: 'pending' });
        waits.push(new Promise(resolve => resolvers.set(call.id, resolve)));
      }
      chatBusy = false; awaiting = true; renderChat();
      await Promise.all(waits);
      awaiting = false;
      if (epoch !== chatEpoch) return;
      chatBusy = true; renderChat();
    }
  } catch (err) {
    chatView.push({ who: 'error', text: err.message });
  }
  if (epoch === chatEpoch) requestSuggestions(3);
  chatBusy = false; renderChat();
}

// ---------- Wiring ----------

// Close buttons of every modal.
for (const [btn, modal] of [['#text-close', textModal], ['#close', manager], ['#shopping-close', shoppingModal], ['#paused-close', pausedModal], ['#history-close', historyModal], ['#view-close', viewModal], ['#schedule-cancel', scheduleEditor], ['#timing-cancel', timingEditor], ['#cancel', editor], ['#chat-close', chatModal], ['#proposal-cancel', proposalEditor]]) $(btn).onclick = () => modal.dismiss();

function render() {
  renderTimingTabs();
  renderDays();
  renderHome();
  keepScroll(managerContent, () => { renderProducts(); renderCosts(); renderTimingRows(); renderPdfMonths(); });
}

$('#day').addEventListener('ionChange', () => { renderTimingTabs(); renderHome(); });
$('#timing').addEventListener('ionChange', renderHome);
// Name of a home row: if already taken that day, as taken; otherwise the product's.
const rowName = id => (recordOf(id, selectedTiming(), selectedDay()) ?? productOf(id)).name;
// Checking or unchecking is confirmed in an action sheet; if cancelled, the checkbox goes back.
$('#home').addEventListener('ionChange', e => {
  const { id, timing } = e.target.dataset;
  const { checked } = e.detail;
  sheet(rowName(id), [{ text: checked ? 'Marcar como tomado' : 'Marcar como pendiente', handler: () => toggle(id, timing, checked) }], renderHome);
});
// The (i) of a row opens the product view; from home, with that day and timing's record if already taken.
const viewFrom = (e, fromHome) => {
  const id = e.target.closest('[data-view]')?.dataset.view;
  if (id) openView(id, fromHome ? recordOf(id, selectedTiming(), selectedDay()) : undefined);
  return !!id;
};
$('#home').addEventListener('click', e => {
  if (viewFrom(e, true)) return;
  // The text sits outside the checkbox (to fill the row); tapping it also checks or unchecks.
  if (e.target.closest('ion-label')) e.target.closest('ion-item').querySelector('ion-checkbox')?.click();
  if (e.target.closest('#taken-sort')) chooseSort();
  if (e.target.closest('#pending-sort')) { sortingPending = !sortingPending; renderHome(); }
});
// On drop, complete() leaves the row where it is on screen: only the order is saved, no re-render nor scroll.
$('#home').addEventListener('ionReorderEnd', e => {
  const timing = selectedTiming();
  reorderPending(timing, move([...e.target.children].map(el => productOf(el.dataset.id)), e.detail));
  e.detail.complete();
});

$('#manage').onclick = () => { snapshotUpdated(); renderProducts(); manager.present(); };
$('#sort').onclick = () => {
  $('#list').disabled = !$('#list').disabled;
  $('#sort ion-icon').name = $('#list').disabled ? 'swap-vertical-outline' : 'checkmark-outline';
};
$('#add').onclick = () => openEditor();
$('#open-paused').onclick = () => pausedModal.present();
$('#costs').addEventListener('click', e => { if (e.target.closest('#open-shopping')) openShopping(); });
$('#shopping-body').addEventListener('click', e => viewFrom(e, false));
$('#paused-list').addEventListener('click', e => {
  const id = e.target.closest('ion-item')?.dataset.id;
  if (id) openEditor(productOf(id));
});
$('#list').addEventListener('click', e => {
  if (e.target.closest('ion-reorder')) return;
  const id = e.target.closest('ion-item')?.dataset.id;
  if (id) openEditor(productOf(id));
});
// Same in Products: the list being sorted is not re-rendered; only home, which sits behind the modal.
$('#list').addEventListener('ionReorderEnd', e => {
  // Active ones (those in the list) are sorted; paused ones stay behind.
  state.products = [...move(state.products.filter(m => !paused(m)), e.detail), ...state.products.filter(paused)];
  e.detail.complete();
  save();
  renderHome();
});

// Timings: the checkbox toggles visibility; tapping the row (outside the checkbox) opens its editor.
$('#timings').addEventListener('ionChange', e => {
  timingOf(e.target.dataset.timing).visible = e.detail.checked;
  save();
  render();
});
$('#timings').addEventListener('click', e => {
  if (e.target.closest('ion-checkbox')) return;
  const id = e.target.closest('ion-item')?.dataset.timing;
  if (id) openTimingEditor(id);
});
$('#open-history').onclick = () => openHistory(editing);
$('#view-edit').onclick = () => { viewModal.dismiss(); openEditor(productOf(viewing)); };
$('#view-body').addEventListener('click', e => { if (e.target.closest('#view-history')) openHistory(viewing); });
$('#schedule-list').addEventListener('click', e => {
  const i = e.target.closest('[data-schedule]')?.dataset.schedule;
  if (i) openSchedule(i === 'new' ? null : Number(i));
});
$('#schedule-save').onclick = saveSchedule;
$('#schedule-delete').onclick = () => { schedules.splice(editingSchedule, 1); renderSchedules(); scheduleEditor.dismiss(); };
timingEditor.addEventListener('ionModalDidDismiss', restoreScroll);
$('#timing-save').onclick = saveTimingEditor;
for (const f of ['start', 'end']) timingField(f).addEventListener('ionInput', () => timingField(f).classList.remove('ion-invalid'));

$('#import').onclick = () => $('#file').click();
$('#file').onchange = e => { importCSV(e.target.files[0]); e.target.value = ''; };
$('#export').onclick = () => download('dosify.csv', exportCSV());
$('#export-pdf').onclick = () => exportPDF(pdfMonth.value);
$('#clear-records').onclick = () => ask('¿Borrar todas las tomas registradas?', () => { state.records = []; commit(); });

editor.addEventListener('ionModalDidDismiss', restoreScroll);
$('#save').onclick = saveEditor;
$('#delete').onclick = () => ask('¿Eliminar este producto?', () => { deleteProduct(editing); commit(); editor.dismiss(); });

$('#assistant').onclick = () => { renderChat(); chatModal.present(); loadLibs().then(renderChat); };
$('#chat-new').onclick = () => { chatEpoch++; resetSuggestions(); for (const r of resolvers.values()) r(); resolvers.clear(); chat = []; chatView = []; chatBusy = false; awaiting = false; renderChat(); };
$('#chat-send').onclick = sendChat;
// Interaction with the chat: suggestions and «Más», message icons, proposal rows (open the edit view), proposal fields
// (written to the draft), chips (timings, schedules, visible, ui elements) and buttons (ui buttons, save, discard, all).
// UI elements: checkboxes, toggles, radios and selects write their value to the draft.
for (const root of chatRoots) root.addEventListener('ionChange', e => {
  const p = proposalOf(e.target), key = e.target.dataset.ui; if (!p || p.v.tool !== 'ui' || key === undefined) return;
  p.v.draft.values[key] = 'checked' in e.detail ? e.detail.checked : String(e.detail.value ?? '');
  saveChat();
});
for (const root of chatRoots) root.addEventListener('ionInput', e => {
  const p = proposalOf(e.target); if (!p) return;
  const { field, scheduleField, row, ui } = e.target.dataset, value = String(e.target.value ?? '');
  if (ui !== undefined) p.v.draft.values[ui] = value;
  if (field) { p.v.draft[field] = value; const live = p.card.querySelector('[data-live]'); if (live && FORMS[p.v.tool].live) live.textContent = FORMS[p.v.tool].live(p.v.draft); }
  if (scheduleField) p.v.draft.schedules[Number(row)][scheduleField] = value;
  e.target.classList.remove('ion-invalid'); e.target.errorText = undefined;
  saveChat();
});
for (const root of chatRoots) root.addEventListener('click', e => {
  if (e.target.closest('#suggest-more')) { if (!suggestLoading) { const prev = suggested; resetSuggestions(); requestSuggestions(suggestCount(), prev); } return renderChat(); }
  const msg = e.target.closest('[data-msg-act]');
  if (msg) return MESSAGE_ACTIONS[msg.dataset.msgAct](chatView[Number(msg.dataset.msg)]);
  const q = e.target.closest('[data-suggest]')?.dataset.suggest;
  if (q) { chatInput.value = q; return sendChat(); }
  const open = e.target.closest('[data-open]')?.dataset.open;
  if (open) return openProposalEditor(Number(open));
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'save-all') { for (const v of pendingProposals()) { const card = chatBody.querySelector(`[data-proposal="${chatView.indexOf(v)}"]`); v.bad = !trySave(v, card); } return renderChat(); }
  if (act === 'discard-all') { for (const v of pendingProposals()) decide(v, false); return renderChat(); }
  const p = proposalOf(e.target); if (!p) return;
  // UI button: applies at once (in the edit view, through its «Guardar», which commits the copy).
  const uiButton = e.target.closest('[data-ui-button]')?.dataset.uiButton;
  if (uiButton !== undefined) { p.v.draft.pressed = uiButton; if ('edit' in p.card.dataset) $('#proposal-save').click(); else if (trySave(p.v, p.card)) renderChat(); else p.v.draft.pressed = null; return; }
  if (act === 'save') { if (trySave(p.v, p.card)) renderChat(); return; }
  if (act === 'discard') { decide(p.v, false); return renderChat(); }
  const chip = e.target.closest('ion-chip[data-chip]'); if (!chip) return;
  const { chip: kind, value, row } = chip.dataset, d = p.v.draft;
  if (kind === 'pick-timing') { d.timing = value; refreshCard(p.card, p.v); }
  if (kind === 'ui') { const k = chip.dataset.ui, multi = uiElements(d).find(x => x.key === k)?.multiple, cur = d.values[k]; d.values[k] = multi ? (cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value]) : cur === value ? '' : value; refreshCard(p.card, p.v); }
  if (kind === 'visible') { d.visible = !d.visible; chip.outline = !d.visible; chip.color = d.visible ? 'primary' : 'medium'; }
  if (kind === 'add-schedule') { d.schedules.push({ dose: d.schedules.at(-1)?.dose ?? '', start: today(), days: '', timings: d.schedules.at(-1)?.timings ?? [] }); refreshCard(p.card, p.v); }
  if (kind === 'schedule-timing') { const ps = d.schedules[Number(row)]; ps.timings = ps.timings.includes(value) ? ps.timings.filter(x => x !== value) : timingIds().filter(id => id === value || ps.timings.includes(id)); delete ps.bad; refreshCard(p.card, p.v); }
  if (kind === 'remove-schedule') { d.schedules.splice(Number(row), 1); refreshCard(p.card, p.v); }
  saveChat();
});
$('#proposal-save').onclick = () => {
  const real = chatView[proposalEdit.i], card = $('#proposal-body [data-proposal]');
  if (!trySave(proposalEdit.v, card)) { proposalEdit.v.draft.pressed = null; return; }
  real.draft = proposalEdit.v.draft; real.status = proposalEdit.v.status; real.text = proposalEdit.v.text; delete real.bad;
  proposalEditor.dismiss(); renderChat();
};
proposalBody.addEventListener('click', e => { if (e.target.closest('#proposal-discard')) { decide(chatView[proposalEdit.i], false); proposalEditor.dismiss(); renderChat(); } });
// Enter sends; Shift + Enter inserts a line break.
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && render());
// Keyboard in the browser (iOS): Ionic does not notice and Safari scrolls the page to show the field, so the header
// and half the screen disappear. With visualViewport, the app shrinks to the visible area (--keyboard), the page goes
// back to the top and, in the assistant, the chat stays at the end.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height));
    document.documentElement.style.setProperty('--keyboard', `${kb}px`);
    if (kb) { window.scrollTo(0, 0); if (chatModal.classList.contains('show-modal')) chatBody.scrollToBottom(0); }
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', () => { if (vv.offsetTop > 0 && window.innerHeight - vv.height > 0) window.scrollTo(0, 0); });
}
$('#day').setAttribute('value', today());
renderTimingTabs();
$('#timing').value = timingNow();
render();
// On load, if the assistant is configured and no suggestions are stored, they are requested in the background.
if (aiReady()) setTimeout(() => { if (!suggestLoading && !suggested.length) requestSuggestions(suggestCount()); }, 1500);
// On load, today (the last day) is always in view.
$('#day').componentOnReady().then(() => requestAnimationFrame(() => { $('#day').scrollLeft = $('#day').scrollWidth; }));
