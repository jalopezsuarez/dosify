const KEY = 'dosify';
const SLOTS = { M: 'Mañana', T: 'Tarde', N: 'Noche' };
const TEXT = ['name', 'dose', 'notes', 'refs'];
const COLS = ['name', 'dose', 'M', 'T', 'N', 'notes', 'refs', 'enabled'];
const HEAD = ['tipo', 'nombre', 'dosis', 'mañana', 'tarde', 'noche', 'indicaciones', 'referencias', 'activa', 'fecha', 'hora', 'momento'];
const SEP = ';';
const DAYS = 30;
const LOG_MAX = 1000;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const yes = v => !['', '0', 'no', 'false'].includes(String(v).toLowerCase());
const dayKey = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const fromKey = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => dayKey(new Date());
const time = iso => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
const empty = text => `<ion-item lines="none"><ion-label color="medium" class="ion-text-center">${text}</ion-label></ion-item>`;
const slotNow = () => { const h = new Date().getHours(); return h >= 6 && h < 12 ? 'M' : h >= 12 && h < 18 ? 'T' : 'N'; };

const state = { meds: [], log: [], ...JSON.parse(localStorage.getItem(KEY)) };
for (const m of state.meds) for (const s in SLOTS) m[s] = yes(m[s] ?? ''); // normaliza datos de versiones anteriores
for (const e of state.log) e.day ??= dayKey(new Date(e.at));
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const selectedDay = () => $('#day').value || today();
const doses = slot => state.meds.filter(m => m.enabled && m[slot]);
const taken = (day, id, slot) => state.log.some(e => e.day === day && e.id === id && e.slot === slot);

// ---------- Toma ----------

const ring = (done, total, label, size = 44, font = 11) => `
  <ion-text color="${total && done === total ? 'success' : 'primary'}">
    <svg width="${size}" height="${size}" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="15.915" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="4"></circle>
      <circle cx="22" cy="22" r="15.915" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="${total ? done / total * 100 : 0} 100" transform="rotate(-90 22 22)"></circle>
      <text x="22" y="22" text-anchor="middle" dominant-baseline="central" font-size="${font}" font-weight="bold" fill="currentColor">${label}</text>
    </svg>
  </ion-text>`;

// Días pasados y hoy, seleccionables; los días futuros van deshabilitados y solo sirven para que hoy quede centrado.
function renderDays() {
  const all = Object.keys(SLOTS).flatMap(slot => doses(slot).map(m => ({ id: m.id, slot })));
  $('#day').innerHTML = Array.from({ length: 2 * DAYS + 1 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - DAYS + i);
    const key = dayKey(d);
    const future = i > DAYS;
    const done = all.filter(x => taken(key, x.id, x.slot)).length;
    return `
      <ion-segment-button value="${key}" layout="icon-bottom" ${future ? 'disabled="true"' : ''}>
        ${future ? ring(0, 0, '') : ring(done, all.length, `${done}/${all.length}`)}
        <ion-label>${d.toLocaleDateString('es', { weekday: 'narrow' })} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}</ion-label>
      </ion-segment-button>`;
  }).join('');
}

// Cada toma va en su propia lista inset: filas independientes, no agrupadas.
const doseRow = (m, slot, isTaken) => `
  <ion-list inset="true">
    <ion-item>
      <ion-checkbox helper-text="${esc(m.dose)}" data-id="${m.id}" data-slot="${slot}" ${isTaken ? 'checked' : ''}>${esc(m.name)}</ion-checkbox>
      <ion-button slot="end" fill="clear" data-info="${m.id}" aria-label="Información">
        <ion-icon slot="icon-only" name="medkit-outline"></ion-icon>
      </ion-button>
    </ion-item>
  </ion-list>`;

const logRow = e => `
  <ion-item>
    <ion-icon slot="start" name="checkmark-circle" color="success"></ion-icon>
    <ion-label>${esc(e.name)}<p>${SLOTS[e.slot]}</p></ion-label>
    <ion-note slot="end">${time(e.at)}</ion-note>
  </ion-item>`;

const emptyList = text => `<ion-list inset="true">${empty(text)}</ion-list>`;

function renderToma() {
  const day = selectedDay();
  const slot = $('#slot').value || slotNow();
  const rows = doses(slot);
  const done = rows.filter(m => taken(day, m.id, slot)).length;
  const date = fromKey(day).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const entries = state.log.filter(e => e.day === day).sort((a, b) => a.at.localeCompare(b.at));
  // Registro: un grupo por franja, de arriba abajo Noche, Tarde, Mañana.
  const registro = Object.keys(SLOTS).reverse().map(s => {
    const list = entries.filter(e => e.slot === s);
    return list.length ? `<ion-list inset="true">${list.map(logRow).join('')}</ion-list>` : emptyList(`${SLOTS[s]}: sin tomas`);
  }).join('');

  $('#toma').innerHTML = `
    <ion-list inset="true">
      <ion-item lines="none">
        <div slot="start">${ring(done, rows.length, `${rows.length ? Math.round(done / rows.length * 100) : 0}%`, 88, 8.5)}</div>
        <ion-label>
          <h2>${done} de ${rows.length} tomadas</h2>
          <p>${day === today() ? 'hoy, ' : ''}${date}</p>
        </ion-label>
      </ion-item>
    </ion-list>
    <ion-list-header><ion-label>Tomas</ion-label></ion-list-header>
    ${rows.map(m => doseRow(m, slot, taken(day, m.id, slot))).join('') || emptyList(`Sin tomas en ${SLOTS[slot]}.`)}
    <ion-list-header><ion-label>Registro</ion-label></ion-list-header>
    ${registro}`;
}

// Ficha de la pauta (dosis, indicaciones y referencias) para leerla con calma.
const info = $('#info');
const section = (title, text) => `
  <ion-list-header><ion-label>${title}</ion-label></ion-list-header>
  <ion-list inset="true">
    <ion-item lines="none"><ion-label class="ion-text-wrap">${esc(text).replace(/\n/g, '<br>') || '—'}</ion-label></ion-item>
  </ion-list>`;

function openInfo(m) {
  $('#info-title').textContent = m.name;
  $('#info-body').innerHTML = section('Dosis', m.dose) + section('Indicaciones', m.notes) + section('Referencias', m.refs);
  info.present();
}

function toggle(id, slot, checked) {
  const day = selectedDay();
  if (checked) {
    const { name } = state.meds.find(m => m.id === id);
    state.log.unshift({ at: new Date().toISOString(), day, id, name, slot });
    state.log.length = Math.min(state.log.length, LOG_MAX);
  } else {
    state.log = state.log.filter(e => !(e.day === day && e.id === id && e.slot === slot));
  }
  save();
  render();
}

// ---------- Pautas ----------

const manager = $('#manager');
const filterSlot = () => $('#filter').value || slotNow();
const visible = slot => state.meds.filter(m => m[slot]);

const chip = (m, slot) => m[slot]
  ? `<ion-chip color="${m.enabled ? 'primary' : 'medium'}"><ion-icon name="checkmark"></ion-icon><ion-label>${SLOTS[slot]}</ion-label></ion-chip>`
  : `<ion-chip outline="true" color="medium"><ion-label>${SLOTS[slot]}</ion-label></ion-chip>`;

const pautaRow = m => `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap" ${m.enabled ? '' : 'color="medium"'}>
      <h2>${esc(m.name)}</h2>
      ${m.dose ? `<p>${esc(m.dose)}</p>` : ''}
      <p>${Object.keys(SLOTS).map(slot => chip(m, slot)).join('')}</p>
      ${m.notes || m.refs ? `<p>${esc([m.notes, m.refs].filter(Boolean).join(' · '))}</p>` : ''}
    </ion-label>
    <ion-toggle slot="end" aria-label="Activa" ${m.enabled ? 'checked' : ''}></ion-toggle>
    <ion-reorder slot="end"></ion-reorder>
  </ion-item>`;

function renderPautas() {
  const slot = filterSlot();
  $('#list').innerHTML = visible(slot).map(pautaRow).join('')
    || empty(`Sin pautas en ${SLOTS[slot]}. Pulsa «Añadir» para crear una.`);
}

function ask(header, handler) {
  const alert = $('#confirm');
  alert.header = header;
  alert.buttons = [{ text: 'Cancelar', role: 'cancel' }, { text: 'Aceptar', role: 'destructive', handler }];
  alert.present();
}

// ---------- CSV ----------

const cell = v => typeof v === 'boolean' ? (v ? 'sí' : 'no') : v;
const csv = rows => '﻿' + rows.map(r => r.map(v => `"${String(cell(v)).replace(/"/g, '""')}"`).join(SEP)).join('\r\n');

function parseCSV(text) {
  const sep = text.slice(0, text.indexOf('\n')).includes(';') ? ';' : ',';
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
    else if (c === sep) { rows.at(-1).push(cell); cell = ''; }
    else if (c === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); }
    else if (c !== '\r') cell += c;
  }
  rows.at(-1).push(cell);
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

function download(name, text) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href));
}

// Un solo CSV: primero las filas «pauta» (nombre … activa) y después las filas «toma» (nombre, fecha, hora, momento).
const exportCSV = () => csv([
  HEAD,
  ...state.meds.map(m => ['pauta', ...COLS.map(c => m[c]), '', '', '']),
  ...[...state.log].sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at)).map(e => ['toma', e.name, '', '', '', '', '', '', '', e.day, time(e.at), SLOTS[e.slot]]),
]);

async function importCSV(file) {
  const rows = parseCSV(await file.text());
  if (rows[0]?.[0].toLowerCase() === HEAD[0]) rows.shift();
  const meds = [], log = [], ids = new Map();
  for (const [tipo, ...r] of rows) {
    if (tipo === 'pauta') {
      const m = { id: crypto.randomUUID(), ...Object.fromEntries(COLS.map((c, i) => [c, c in SLOTS ? yes(r[i] ?? '') : r[i] ?? ''])), enabled: r[7] === undefined || yes(r[7]) };
      meds.push(m);
      if (!ids.has(m.name)) ids.set(m.name, m.id);
    } else if (tipo === 'toma') {
      const [name, fecha, hora, momento] = [r[0], r[8], r[9], r[10] ?? ''];
      const slot = Object.keys(SLOTS).find(s => s === momento.toUpperCase() || SLOTS[s].toLowerCase() === momento.toLowerCase());
      const at = new Date(`${fecha}T${hora || '00:00'}`);
      if (slot && !isNaN(at)) log.push({ at: at.toISOString(), day: fecha, id: ids.get(name) ?? null, name, slot });
    }
  }
  if (!meds.length && !log.length) return;
  const apply = () => { state.meds = meds; state.log = log.sort((a, b) => b.at.localeCompare(a.at)); save(); render(); };
  state.meds.length || state.log.length ? ask('¿Reemplazar las pautas y las tomas actuales?', apply) : apply();
}

// ---------- Editor ----------

const editor = $('#editor');
const field = name => $(`[name="${name}"]`, editor);
let editing = null;

function openEditor(med = {}) {
  editing = med.id ?? null;
  TEXT.forEach(f => field(f).value = med[f] ?? '');
  Object.keys(SLOTS).forEach(s => field(s).checked = !!med[s]);
  $('#delete').classList.toggle('ion-hide', !editing);
  editor.present();
}

function saveEditor() {
  const med = Object.fromEntries([
    ...TEXT.map(f => [f, String(field(f).value ?? '').trim()]),
    ...Object.keys(SLOTS).map(s => [s, field(s).checked]),
  ]);
  if (!med.name) return field('name').setFocus();
  if (editing) Object.assign(state.meds.find(m => m.id === editing), med);
  else state.meds.push({ id: crypto.randomUUID(), enabled: true, ...med });
  save();
  render();
  editor.dismiss();
}

// ---------- Wiring ----------

function render() {
  renderDays();
  renderToma();
  renderPautas();
}

$('#day').addEventListener('ionChange', renderToma);
$('#slot').addEventListener('ionChange', renderToma);
$('#toma').addEventListener('ionChange', e => toggle(e.target.dataset.id, e.target.dataset.slot, e.detail.checked));
$('#toma').addEventListener('click', e => {
  const id = e.target.closest('[data-info]')?.dataset.info;
  if (id) openInfo(state.meds.find(m => m.id === id));
});
$('#info-close').onclick = () => info.dismiss();

$('#manage').onclick = () => { $('#filter').value = $('#slot').value || slotNow(); renderPautas(); manager.present(); };
$('#close').onclick = () => manager.dismiss();
$('#filter').addEventListener('ionChange', renderPautas);
$('#add').onclick = () => openEditor();
$('#list').addEventListener('click', e => {
  if (e.target.closest('ion-toggle, ion-reorder')) return;
  const id = e.target.closest('ion-item')?.dataset.id;
  if (id) openEditor(state.meds.find(m => m.id === id));
});
$('#list').addEventListener('ionChange', e => {
  state.meds.find(m => m.id === e.target.closest('ion-item').dataset.id).enabled = e.detail.checked;
  save();
  render();
});
$('#list').addEventListener('ionItemReorder', e => {
  const shown = visible(filterSlot());
  const moved = e.detail.complete([...shown]);
  let i = 0;
  state.meds = state.meds.map(m => shown.includes(m) ? moved[i++] : m);
  save();
  render();
});

$('#import').onclick = () => $('#file').click();
$('#file').onchange = e => { importCSV(e.target.files[0]); e.target.value = ''; };
$('#export').onclick = () => download('dosify.csv', exportCSV());
$('#clear-log').onclick = () => ask('¿Borrar todas las tomas registradas?', () => { state.log = []; save(); render(); });

$('#cancel').onclick = () => editor.dismiss();
$('#save').onclick = saveEditor;
$('#delete').onclick = () => ask('¿Eliminar esta pauta?', () => {
  state.meds = state.meds.filter(m => m.id !== editing);
  save();
  render();
  editor.dismiss();
});

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && render());
$('#day').setAttribute('value', today());
$('#slot').setAttribute('value', slotNow());
render();
