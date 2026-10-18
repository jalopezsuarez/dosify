const KEY = 'dosify';
const SLOTS = { M: 'Mañana', T: 'Tarde', N: 'Noche' };
const TEXT = ['name', 'dose', 'notes', 'refs', 'days'];
const ORD = { M: 'oM', T: 'oT', N: 'oN' }; // posición de la pauta en la lista de tomas de cada franja (1, 2, 3…)
const COLS = ['name', 'dose', 'M', 'T', 'N', 'notes', 'refs', 'start', 'days', 'oM', 'oT', 'oN'];
const HEAD = ['tipo', 'nombre', 'dosis', 'mañana', 'tarde', 'noche', 'indicaciones', 'referencias', 'inicio', 'dias', 'orden mañana', 'orden tarde', 'orden noche', 'fecha', 'hora', 'momento'];
const SEP = ';';
const DAYS = 7; // días anteriores que siempre se muestran
const DAYS_MAX = 30; // hasta cuántos días atrás se muestran los que tienen tomas
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
for (const m of state.meds) { for (const s in SLOTS) m[s] = yes(m[s] ?? ''); m.start ??= ''; m.days ??= ''; for (const o of Object.values(ORD)) m[o] ??= ''; } // normaliza datos de versiones anteriores
for (const e of state.log) e.day ??= dayKey(new Date(e.at));
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

// Duración: la pauta está activa hasta cumplir los días desde «start»; sin duración, siempre.
const lastDay = m => { const d = fromKey(m.start); d.setDate(d.getDate() + Number(m.days) - 1); return d; };
const timed = m => Number(m.days) > 0 && m.start !== '';
const active = m => !timed(m) || today() <= dayKey(lastDay(m));
const selectedDay = () => $('#day').value || today();
// Orden de tomas de una franja: por su número (oM/oT/oN); las pautas sin número van detrás, en el orden de pautas.
const pos = (m, slot) => Number(m[ORD[slot]]) || Infinity;
const bySlot = (meds, slot) => [...meds].sort((a, b) => pos(a, slot) - pos(b, slot));
const doses = slot => bySlot(state.meds.filter(m => active(m) && m[slot]), slot);
const taken = (day, id, slot) => state.log.some(e => e.day === day && e.id === id && e.slot === slot);

// ---------- Toma ----------

const ring = (done, total, label, size = 44, font = 11) => `
  <ion-text color="primary">
    <svg width="${size}" height="${size}" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="15.915" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="4"></circle>
      <circle cx="22" cy="22" r="15.915" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="${total ? done / total * 100 : 0} 100" transform="rotate(-90 22 22)"></circle>
      <text x="22" y="22" text-anchor="middle" dominant-baseline="central" font-size="${font}" font-weight="bold" fill="currentColor">${label}</text>
    </svg>
  </ion-text>`;

// Siempre los últimos DAYS días y hoy (último y seleccionado al cargar); hasta DAYS_MAX días atrás, también los días
// con alguna toma. El día elegido se mantiene, para que no desaparezca al desmarcar su última toma.
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
function renderDays() {
  const all = Object.keys(SLOTS).flatMap(slot => doses(slot).map(m => ({ id: m.id, slot })));
  const recent = Array.from({ length: DAYS + 1 }, (_, i) => daysAgo(DAYS - i));
  const logged = state.log.map(e => e.day).filter(day => day >= daysAgo(DAYS_MAX));
  const keys = [...new Set([...logged, ...recent, $('#day').value].filter(Boolean))].sort();
  $('#day').innerHTML = keys.map(key => {
    const d = fromKey(key);
    const done = all.filter(x => taken(key, x.id, x.slot)).length;
    return `
      <ion-segment-button value="${key}" layout="icon-bottom">
        ${ring(done, all.length, `${done}/${all.length}`)}
        <ion-label>${d.toLocaleDateString('es', { weekday: 'narrow' })} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}</ion-label>
      </ion-segment-button>`;
  }).join('');
}

// Texto de una pauta: nombre (medio), dosis (texto principal) e indicaciones (gris, recortadas a unas dos líneas).
const brief = text => { const t = text.split('\n').slice(0, 2).join(' '); return t.length > 80 ? `${t.slice(0, 80).trimEnd()}…` : t; };
const doseLine = (text, on = true) => text ? `<p>${on ? `<ion-text color="dark">${esc(text)}</ion-text>` : esc(text)}</p>` : '';
const notesLine = m => m.notes ? `<p>${esc(brief(m.notes))}</p>` : '';

// Fila de una toma. Si ya está tomada, muestra la hora junto a la dosis; al ordenar, el (i) deja sitio al asa.
const doseItem = (m, slot, entry, sorting) => `
    <ion-item data-id="${m.id}">
      <ion-checkbox slot="start" aria-label="${esc(m.name)}" data-id="${m.id}" data-slot="${slot}" ${entry ? 'checked' : ''} ${sorting ? 'disabled' : ''}></ion-checkbox>
      <ion-label class="ion-text-wrap">
        <h2 class="medium">${esc(m.name)}</h2>
        ${doseLine([entry && time(entry.at), m.dose].filter(Boolean).join(' · '))}
        ${notesLine(m)}
      </ion-label>
      ${sorting ? '<ion-reorder slot="end"></ion-reorder>' : `
      <ion-button slot="end" fill="clear" data-info="${m.id}" aria-label="Información">
        <ion-icon slot="icon-only" name="information-circle" color="teal" size="large"></ion-icon>
      </ion-button>`}
    </ion-item>`;
// Cada toma va en su propia lista inset: filas independientes.
const doseRow = (m, slot, entry) => `<ion-list inset="true">${doseItem(m, slot, entry)}</ion-list>`;

// Botón de la cabecera de una sección (Pendiente, Tomas).
const headerButton = (id, icon, label) => `<ion-button id="${id}" fill="clear" aria-label="${label}"><ion-icon slot="icon-only" name="${icon}"></ion-icon></ion-button>`;

// «Pendiente»: su botón activa el modo ordenar; el orden que se fije vale para esa franja en cualquier día.
let sortingPending = false;

// «Tomas»: su botón abre un action sheet para elegir el orden; el icono muestra el elegido.
// No se guarda: al abrir la app siempre empieza en el orden de tomas.
const ORDERS = {
  tomas: { icon: 'reorder-three-outline', label: 'Orden de tomas' },
  recent: { icon: 'arrow-up-outline', label: 'Más reciente arriba' },
  oldest: { icon: 'arrow-down-outline', label: 'Más reciente abajo' },
  pautas: { icon: 'list-outline', label: 'Orden de pautas' },
};
let order = 'tomas';

// Action sheet compartido: opciones + «Cancelar»; onCancel se llama si se cierra sin elegir.
function sheet(header, buttons, onCancel) {
  const el = $('#sheet');
  el.header = header;
  el.buttons = [...buttons, { text: 'Cancelar', role: 'cancel' }];
  el.present();
  if (onCancel) el.onDidDismiss().then(({ role }) => role === 'cancel' || role === 'backdrop' ? onCancel() : null);
}

const chooseOrder = () => sheet('Ordenar tomas', Object.entries(ORDERS).map(([key, o]) => (
  { text: o.label, role: key === order ? 'selected' : undefined, handler: () => { order = key; renderToma(); } })));
const sortTaken = (rows, entry) => order === 'tomas' ? rows
  : order === 'pautas' ? state.meds.filter(m => rows.includes(m))
  : [...rows].sort((a, b) => entry(a).at.localeCompare(entry(b).at) * (order === 'oldest' ? 1 : -1));

// Mueve un elemento de la posición «from» a «to» (detalle de ionReorderEnd; «to» falta si no se movió).
const move = (list, { from, to = from }) => { const l = [...list]; l.splice(to, 0, ...l.splice(from, 1)); return l; };

// Ordenar «Pendiente» mueve esas pautas entre los huecos que ocupan en la franja (las ya tomadas no se mueven)
// y renumera la franja entera: 1, 2, 3…
function reorderPending(slot, moved) {
  const all = bySlot(state.meds.filter(m => m[slot]), slot);
  const ids = new Set(moved.map(m => m.id));
  let i = 0;
  all.map(m => ids.has(m.id) ? moved[i++] : m).forEach((m, n) => { m[ORD[slot]] = n + 1; });
  save();
}

const emptyList = text => `<ion-list inset="true">${empty(text)}</ion-list>`;

async function renderToma() {
  const day = selectedDay();
  const slot = $('#slot').value || slotNow();
  const rows = doses(slot);
  const entry = m => state.log.find(e => e.day === day && e.id === m.id && e.slot === slot);
  const pending = rows.filter(m => !entry(m));
  const taken = sortTaken(rows.filter(m => entry(m)), entry);
  const done = taken.length;
  const date = fromKey(day).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

  // Conserva la posición del scroll al volver a pintar (p. ej. al marcar una toma al final de la lista).
  const scroller = await $('#toma').getScrollElement?.();
  const y = scroller?.scrollTop ?? 0;
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
    <ion-list-header>
      <ion-label>Pendiente</ion-label>
      ${headerButton('pending-sort', sortingPending ? 'checkmark-outline' : 'swap-vertical-outline', sortingPending ? 'Terminar de ordenar' : 'Ordenar')}
    </ion-list-header>
    ${!pending.length ? emptyList('Nada pendiente.') : sortingPending
      ? `<ion-list inset="true"><ion-reorder-group id="pending-list" disabled="false">${pending.map(m => doseItem(m, slot, null, true)).join('')}</ion-reorder-group></ion-list>`
      : pending.map(m => doseRow(m, slot)).join('')}
    <ion-list-header>
      <ion-label>Tomas</ion-label>
      ${headerButton('toma-sort', ORDERS[order].icon, ORDERS[order].label)}
    </ion-list-header>
    ${taken.map(m => doseRow(m, slot, entry(m))).join('') || emptyList('Sin tomas.')}`;
  if (scroller) { scroller.scrollTop = y; requestAnimationFrame(() => { scroller.scrollTop = y; }); }
}

// Ficha de la pauta (dosis, indicaciones y referencias) para leerla con calma; los enlaces se pueden pulsar.
const info = $('#info');
const linkify = text => esc(text)
  .replace(/\n/g, '<br>')
  .replace(/(https?:\/\/|www\.)[^\s<]*[^\s<.,;:)]/g, url => `<a href="${url.startsWith('http') ? url : `https://${url}`}" target="_blank" rel="noopener">${url}</a>`);
const section = (title, text) => `
  <ion-list-header><ion-label>${title}</ion-label></ion-list-header>
  <ion-list inset="true">
    <ion-item lines="none"><ion-label class="ion-text-wrap">${linkify(text) || '—'}</ion-label></ion-item>
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
const chip = (m, slot) => m[slot]
  ? `<ion-chip color="${active(m) ? 'primary' : 'medium'}"><ion-label>${SLOTS[slot]}</ion-label></ion-chip>`
  : `<ion-chip outline="true" color="medium"><ion-label>${SLOTS[slot]}</ion-label></ion-chip>`;

const pautaRow = m => `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap" ${active(m) ? '' : 'color="medium"'}>
      <h2 class="medium">${esc(m.name)}</h2>
      ${timed(m) ? `<p><ion-text color="rose" class="medium">${active(m) ? `${Number(m.days)} días · hasta el` : 'Finalizada el'} ${lastDay(m).toLocaleDateString('es')}</ion-text></p>` : ''}
      ${doseLine(m.dose, active(m))}
      ${notesLine(m)}
      <p>${Object.keys(SLOTS).map(slot => chip(m, slot)).join('')}</p>
    </ion-label>
    <ion-reorder slot="end"></ion-reorder>
  </ion-item>`;

function renderPautas() {
  $('#list-title').textContent = `Pautas (${state.meds.length})`;
  $('#list').innerHTML = state.meds.map(pautaRow).join('') || empty('Sin pautas. Pulsa «Añadir» para crear una.');
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

// Un solo CSV: primero las filas «pauta» (nombre … orden noche) y después las filas «toma» (nombre, fecha, hora, momento).
const exportCSV = () => csv([
  HEAD,
  ...state.meds.map(m => ['pauta', ...COLS.map(c => m[c]), '', '', '']),
  ...[...state.log].sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at)).map(e => ['toma', e.name, ...Array(COLS.length - 1).fill(''), e.day, time(e.at), SLOTS[e.slot]]),
]);

async function importCSV(file) {
  const rows = parseCSV(await file.text());
  // Las columnas se buscan por su nombre en la cabecera, así un CSV con columnas de menos o en otro orden también vale.
  const head = rows[0]?.[0].toLowerCase() === HEAD[0] ? rows.shift().map(h => h.toLowerCase()) : HEAD;
  const get = (r, i) => r[head.indexOf(HEAD[i])] ?? '';
  const meds = [], log = [], ids = new Map();
  for (const r of rows) {
    const tipo = r[0];
    if (tipo === 'pauta') {
      const m = { id: crypto.randomUUID(), ...Object.fromEntries(COLS.map((c, i) => [c, c in SLOTS ? yes(get(r, i + 1)) : get(r, i + 1)])) };
      meds.push(m);
      if (!ids.has(m.name)) ids.set(m.name, m.id);
    } else if (tipo === 'toma') {
      const [name, fecha, hora, momento] = [get(r, 1), get(r, COLS.length + 1), get(r, COLS.length + 2), get(r, COLS.length + 3)];
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
  const old = state.meds.find(m => m.id === editing);
  med.start = med.days === (old?.days ?? '') ? old?.start ?? '' : med.days ? today() : ''; // una duración nueva empieza hoy
  if (old) Object.assign(old, med);
  else state.meds.push({ id: crypto.randomUUID(), ...med });
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
// Marcar o desmarcar se confirma en un action sheet; si se cancela, la casilla vuelve a como estaba.
$('#toma').addEventListener('ionChange', e => {
  const { id, slot } = e.target.dataset;
  const { checked } = e.detail;
  const { name } = state.meds.find(m => m.id === id);
  sheet(name, [{ text: checked ? 'Marcar como tomado' : 'Marcar como pendiente', handler: () => toggle(id, slot, checked) }], renderToma);
});
$('#toma').addEventListener('click', e => {
  const id = e.target.closest('[data-info]')?.dataset.info;
  if (id) openInfo(state.meds.find(m => m.id === id));
  // El texto va fuera de la casilla (para ocupar toda la fila); pulsarlo también la marca o desmarca.
  if (e.target.closest('ion-label')) e.target.closest('ion-item').querySelector('ion-checkbox')?.click();
  if (e.target.closest('#toma-sort')) chooseOrder();
  if (e.target.closest('#pending-sort')) { sortingPending = !sortingPending; renderToma(); }
});
// Al soltar, complete() deja la fila en su sitio en pantalla: solo se guarda el orden, sin repintar ni mover el scroll.
$('#toma').addEventListener('ionReorderEnd', e => {
  const slot = $('#slot').value || slotNow();
  reorderPending(slot, move([...e.target.children].map(el => state.meds.find(m => m.id === el.dataset.id)), e.detail));
  e.detail.complete();
});
$('#info-close').onclick = () => info.dismiss();

$('#manage').onclick = () => manager.present();
$('#close').onclick = () => manager.dismiss();
$('#sort').onclick = () => {
  $('#list').disabled = !$('#list').disabled;
  $('#sort ion-icon').name = $('#list').disabled ? 'swap-vertical-outline' : 'checkmark-outline';
};
$('#add').onclick = () => openEditor();
$('#list').addEventListener('click', e => {
  if (e.target.closest('ion-reorder')) return;
  const id = e.target.closest('ion-item')?.dataset.id;
  if (id) openEditor(state.meds.find(m => m.id === id));
});
// Igual en Pautas: no se repinta la lista que se está ordenando; solo la toma, que queda detrás del modal.
$('#list').addEventListener('ionReorderEnd', e => {
  state.meds = move(state.meds, e.detail);
  e.detail.complete();
  save();
  renderToma();
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
// Al cargar, hoy (el último día) siempre a la vista.
$('#day').componentOnReady().then(() => requestAnimationFrame(() => { $('#day').scrollLeft = $('#day').scrollWidth; }));
