const KEY = 'dosify';
// Modelo:
// · intervals: los de DEFAULT_INTERVALS (para tener más basta añadir otro allí), en su orden:
//   { id, name, start, end (horas), visible, order: [ids de pauta en el orden de tomas] }
// · meds: pautas, en el orden de pautas: { id, name, dose, notes, refs, slots: [ids de intervalo], from, to (días de vigencia) }
// · log: tomas: { at, day, id (de la pauta), slot (id de intervalo), name, dose, notes (la pauta tal como se tomó) }
const DEFAULT_INTERVALS = [
  { id: 'i1', name: 'Desayuno', start: 6, end: 12, visible: true, order: [] },
  { id: 'i2', name: 'Almuerzo', start: 12, end: 18, visible: true, order: [] },
  { id: 'i3', name: 'Cena', start: 18, end: 24, visible: true, order: [] },
];
const IDS = DEFAULT_INTERVALS.map(iv => iv.id);
const newId = () => crypto.randomUUID().slice(0, 8);
const TEXT = ['name', 'dose', 'notes', 'refs'];
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
// Hora entera de 0 a 24 o '' (sin hora); null si no es válida.
const hour = v => { const t = String(v ?? '').trim(); return t === '' ? '' : /^\d{1,2}$/.test(t) && Number(t) <= 24 ? Number(t) : null; };

// Limpia datos guardados o importados: lo que falte o no cuadre toma su valor por defecto y las tomas que no se
// entienden se descartan. No hay compatibilidad con formatos anteriores.
const text = v => typeof v === 'string' ? v : '';
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
const list = v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
function clean(raw) {
  const arr = v => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
  const meds = arr(raw?.meds).filter(m => text(m.id) && text(m.name)).map(m => ({
    id: m.id, name: m.name, dose: text(m.dose), notes: text(m.notes), refs: text(m.refs),
    slots: IDS.filter(id => list(m.slots).includes(id)), from: date(m.from), to: date(m.to),
  }));
  const saved = arr(raw?.intervals);
  const intervals = DEFAULT_INTERVALS.map(d => {
    const iv = saved.find(x => x.id === d.id) ?? d;
    const at = saved.indexOf(iv);
    return { at: at < 0 ? Infinity : at, id: d.id, name: typeof iv.name === 'string' ? iv.name : d.name, start: hour(iv.start) ?? d.start,
      end: hour(iv.end) ?? d.end, visible: typeof iv.visible === 'boolean' ? iv.visible : d.visible, order: list(iv.order).filter(id => meds.some(m => m.id === id)) };
  }).sort((a, b) => a.at - b.at).map(({ at, ...iv }) => iv);
  const log = arr(raw?.log).filter(e => date(e.day) && IDS.includes(e.slot) && !isNaN(new Date(e.at)))
    .map(e => ({ at: new Date(e.at).toISOString(), day: e.day, id: text(e.id) || null, slot: e.slot, name: text(e.name), dose: text(e.dose), notes: text(e.notes) }))
    .sort((a, b) => b.at.localeCompare(a.at));
  return { intervals, meds, log };
}
const stored = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();
const state = clean(stored);
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

// ---------- Intervalos ----------

const interval = id => state.intervals.find(iv => iv.id === id);
const visibleIntervals = () => state.intervals.filter(iv => iv.visible);
const hours = iv => iv.start !== '' && iv.end !== '' ? `${iv.start}–${iv.end} h` : iv.start !== '' ? `desde las ${iv.start} h` : iv.end !== '' ? `hasta las ${iv.end} h` : '';
const label = id => { const iv = interval(id); return iv.name || hours(iv) || 'Sin nombre'; };
// ¿La hora h cae en el intervalo? Admite intervalos que pasan de medianoche (p. ej. 22–6).
const within = (iv, h) => iv.start === '' || iv.end === '' ? false : iv.start <= iv.end ? h >= iv.start && h < iv.end : h >= iv.start || h < iv.end;
// Intervalo que se abre al cargar: el visible que incluye la hora actual; si ninguno, el próximo en empezar; si no, el primero.
function intervalNow() {
  const h = new Date().getHours(), list = visibleIntervals();
  const next = list.filter(iv => iv.start !== '').sort((a, b) => (a.start - h + 24) % 24 - (b.start - h + 24) % 24)[0];
  return (list.find(iv => within(iv, h)) ?? next ?? list[0])?.id ?? '';
}
const selectedSlot = () => $('#slot').value;

// Duración: la pauta está activa hasta cumplir los días desde «start»; sin duración, siempre.
// Vigencia: una pauta vale desde «from» hasta «to» (días incluidos; vacíos, sin límite). Cada día muestra las vigentes ese día.
const activeOn = (m, day) => (!m.from || m.from <= day) && (!m.to || day <= m.to);
const active = m => activeOn(m, today());
const addDays = (key, n) => { const d = fromKey(key); d.setDate(d.getDate() + n); return dayKey(d); };
const span = m => m.from && m.to ? Math.round((fromKey(m.to) - fromKey(m.from)) / 864e5) + 1 : ''; // duración en días
const selectedDay = () => $('#day').value || today();
// Orden de tomas de un intervalo: su lista «order»; las pautas que no están en ella van detrás, en el orden de pautas.
const pos = (m, slot) => { const i = interval(slot).order.indexOf(m.id); return i < 0 ? Infinity : i; };
const bySlot = (meds, slot) => [...meds].sort((a, b) => pos(a, slot) - pos(b, slot));
const doses = (slot, day = selectedDay()) => bySlot(state.meds.filter(m => activeOn(m, day) && m.slots.includes(slot)), slot);
// Cada toma guarda nombre, dosis e indicaciones de la pauta al tomarla; así el registro muestra lo que se tomó aunque la
// pauta cambie o se borre.
const SNAP = ['name', 'dose', 'notes'];
const snap = m => Object.fromEntries(SNAP.map(k => [k, m[k]]));
const takenAs = e => ({ refs: state.meds.find(m => m.id === e.id)?.refs ?? '', id: e.id, ...snap(e) });
// Filas de un día e intervalo: pendientes (pautas vigentes sin toma) y tomadas (sus tomas, también las de pautas que ya
// no están en el intervalo o se borraron).
function dayRows(slot, day) {
  const entries = state.log.filter(e => e.day === day && e.slot === slot);
  const pending = doses(slot, day).filter(m => !entries.some(e => e.id === m.id));
  return { pending, taken: entries.map(e => ({ ...takenAs(e), entry: e })) };
}

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
  const recent = Array.from({ length: DAYS + 1 }, (_, i) => daysAgo(DAYS - i));
  const logged = state.log.map(e => e.day).filter(day => day >= daysAgo(DAYS_MAX));
  const keys = [...new Set([...logged, ...recent, $('#day').value].filter(Boolean))].sort();
  $('#day').innerHTML = keys.map(key => {
    const d = fromKey(key);
    const rows = visibleIntervals().map(iv => dayRows(iv.id, key));
    const done = rows.reduce((n, r) => n + r.taken.length, 0), total = rows.reduce((n, r) => n + r.taken.length + r.pending.length, 0);
    return `
      <ion-segment-button value="${key}" layout="icon-bottom">
        ${ring(done, total, `${done}/${total}`)}
        <ion-label>${d.toLocaleDateString('es', { weekday: 'narrow' })} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}</ion-label>
      </ion-segment-button>`;
  }).join('');
}

// Pestañas de intervalos visibles, en su orden. Solo se repintan si cambian; si el elegido deja de verse, se abre el de ahora.
let slotsHtml = '';
function renderSlots() {
  const html = visibleIntervals().map(iv => `<ion-segment-button value="${iv.id}"><ion-label>${esc(label(iv.id))}</ion-label></ion-segment-button>`).join('');
  if (html !== slotsHtml) $('#slot').innerHTML = slotsHtml = html;
  if (!visibleIntervals().some(iv => iv.id === $('#slot').value)) $('#slot').value = intervalNow();
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

// «Pendiente»: su botón activa el modo ordenar; el orden que se fije vale para ese intervalo en cualquier día.
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
// Posición en el orden de pautas; las tomas de pautas borradas van al final.
const medIndex = id => { const i = state.meds.findIndex(m => m.id === id); return i < 0 ? Infinity : i; };
const byPautas = (a, b) => (medIndex(a.id) - medIndex(b.id)) || 0;
const sortTaken = (rows, slot) => [...rows].sort(
  order === 'tomas' ? (a, b) => (pos(a, slot) - pos(b, slot)) || byPautas(a, b)
  : order === 'pautas' ? byPautas
  : (a, b) => a.entry.at.localeCompare(b.entry.at) * (order === 'oldest' ? 1 : -1));

// Mueve un elemento de la posición «from» a «to» (detalle de ionReorderEnd; «to» falta si no se movió).
const move = (list, { from, to = from }) => { const l = [...list]; l.splice(to, 0, ...l.splice(from, 1)); return l; };

// Ordenar «Pendiente» mueve esas pautas entre los huecos que ocupan en el intervalo (las ya tomadas no se mueven)
// y guarda el orden completo del intervalo.
function reorderPending(slot, moved) {
  const all = bySlot(state.meds.filter(m => m.slots.includes(slot)), slot);
  const ids = new Set(moved.map(m => m.id));
  let i = 0;
  interval(slot).order = all.map(m => ids.has(m.id) ? moved[i++].id : m.id);
  save();
}

// Conserva el scroll de un ion-content al repintarlo: lo guarda, pinta y lo restaura cuando Ionic ha dibujado las filas.
async function keepScroll(content, paint) {
  const scroller = await content.getScrollElement();
  const y = scroller.scrollTop;
  paint();
  await Promise.all([...content.querySelectorAll('ion-item')].map(el => el.componentOnReady?.()));
  scroller.scrollTop = y;
  requestAnimationFrame(() => { scroller.scrollTop = y; });
}

const emptyList = text => `<ion-list inset="true">${empty(text)}</ion-list>`;

async function renderToma() {
  const day = selectedDay();
  const slot = selectedSlot();
  if (!slot) { $('#toma').innerHTML = emptyList('No hay intervalos visibles. Actívalos en Pautas › Intervalos.'); return; }
  const { pending, taken: takenRows } = dayRows(slot, day);
  const taken = sortTaken(takenRows, slot);
  const done = taken.length, total = pending.length + taken.length;
  const date = fromKey(day).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

  // Conserva la posición del scroll al volver a pintar (p. ej. al marcar una toma al final de la lista).
  await keepScroll($('#toma'), () => { $('#toma').innerHTML = `
    <ion-list inset="true">
      <ion-item lines="none">
        <div slot="start">${ring(done, total, `${total ? Math.round(done / total * 100) : 0}%`, 88, 8.5)}</div>
        <ion-label>
          <h2>${done} de ${total} tomadas</h2>
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
    ${taken.map(m => doseRow(m, slot, m.entry)).join('') || emptyList('Sin tomas.')}`; });
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
    state.log.unshift({ at: new Date().toISOString(), day, id, slot, ...snap(state.meds.find(m => m.id === id)) });
    state.log.length = Math.min(state.log.length, LOG_MAX);
  } else {
    state.log = state.log.filter(e => !(e.day === day && String(e.id) === id && e.slot === slot));
  }
  save();
  render();
}

// ---------- Pautas ----------

const manager = $('#manager');
const chip = (m, slot) => m.slots.includes(slot)
  ? `<ion-chip color="${active(m) ? 'primary' : 'medium'}"><ion-label>${esc(label(slot))}</ion-label></ion-chip>`
  : `<ion-chip outline="true" color="medium"><ion-label>${esc(label(slot))}</ion-label></ion-chip>`;

const pautaRow = m => `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap" ${active(m) ? '' : 'color="medium"'}>
      <h2 class="medium">${esc(m.name)}</h2>
      ${m.to ? `<p><ion-text color="rose" class="medium">${active(m) ? `${span(m) ? `${span(m)} días · ` : ''}hasta el` : 'Finalizada el'} ${fromKey(m.to).toLocaleDateString('es')}</ion-text></p>` : ''}
      ${doseLine(m.dose, active(m))}
      ${notesLine(m)}
      <p>${visibleIntervals().map(iv => chip(m, iv.id)).join('')}</p>
    </ion-label>
    <ion-reorder slot="end"></ion-reorder>
  </ion-item>`;

function renderPautas() {
  $('#list-count').textContent = state.meds.length;
  $('#list').innerHTML = state.meds.map(pautaRow).join('') || empty('Sin pautas. Pulsa «Añadir» para crear una.');
}

// Intervalos: casilla de visible a la izquierda, asa de ordenar a la derecha; tocar la fila abre su editor.
const intervalRow = iv => `
  <ion-item detail="false" data-interval="${iv.id}">
    <ion-checkbox slot="start" aria-label="Visible" data-interval="${iv.id}" ${iv.visible ? 'checked' : ''}></ion-checkbox>
    <ion-label ${iv.visible ? '' : 'color="medium"'}>
      <h2 class="medium">${esc(label(iv.id))}</h2>
      <p>${hours(iv) || 'Sin horas'}</p>
    </ion-label>
    <ion-reorder slot="end"></ion-reorder>
  </ion-item>`;

const renderIntervals = () => { $('#intervals').innerHTML = state.intervals.map(intervalRow).join(''); };

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

// Un solo CSV con columnas compartidas; cada tipo de fila usa las suyas:
// · intervalo: id, nombre, desde y hasta (horas), visible y orden (ids de pauta separados por espacios). En su orden.
// · pauta: id, nombre, intervalos (ids separados por espacios), desde y hasta (días de vigencia), dosis, indicaciones
//   y referencias. En el orden de pautas.
// · toma: id de la pauta, intervalos (el de la toma), fecha («AAAA-MM-DD HH:MM») y la pauta como se tomó: nombre,
//   dosis e indicaciones.
const HEAD = ['tipo', 'id', 'nombre', 'intervalos', 'desde', 'hasta', 'fecha', 'dosis', 'indicaciones', 'referencias', 'visible', 'orden'];
const csvRow = (tipo, o) => HEAD.map(h => h === 'tipo' ? tipo : o[h] ?? '');

const exportCSV = () => csv([
  HEAD,
  ...state.intervals.map(iv => csvRow('intervalo', { id: iv.id, nombre: iv.name, desde: iv.start, hasta: iv.end, visible: iv.visible, orden: iv.order.join(' ') })),
  ...state.meds.map(m => csvRow('pauta', { id: m.id, nombre: m.name, intervalos: m.slots.join(' '), desde: m.from, hasta: m.to, dosis: m.dose, indicaciones: m.notes, referencias: m.refs })),
  ...[...state.log].sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at))
    .map(e => csvRow('toma', { id: e.id ?? '', nombre: e.name, intervalos: e.slot, fecha: `${e.day} ${time(e.at)}`, dosis: e.dose, indicaciones: e.notes })),
]);

// Lee las filas a objetos y los limpia con clean(), como los datos guardados.
async function importCSV(file) {
  const rows = parseCSV(await file.text());
  const head = rows.shift()?.map(h => h.toLowerCase()) ?? [];
  const raw = { intervals: [], meds: [], log: [] };
  const words = v => v.split(/\s+/).filter(Boolean);
  for (const r of rows) {
    const c = Object.fromEntries(HEAD.map(h => [h, r[head.indexOf(h)] ?? '']));
    if (c.tipo === 'intervalo') raw.intervals.push({ id: c.id, name: c.nombre, start: c.desde, end: c.hasta, visible: c.visible === '' ? null : yes(c.visible), order: words(c.orden) });
    if (c.tipo === 'pauta') raw.meds.push({ id: c.id || newId(), name: c.nombre, dose: c.dosis, notes: c.indicaciones, refs: c.referencias, slots: words(c.intervalos), from: c.desde, to: c.hasta });
    if (c.tipo === 'toma') { const [day, hhmm = '00:00'] = c.fecha.split(' '); raw.log.push({ at: `${day}T${hhmm}`, day, id: c.id, slot: c.intervalos, name: c.nombre, dose: c.dosis, notes: c.indicaciones }); }
  }
  if (!raw.intervals.length && !raw.meds.length && !raw.log.length) return;
  const apply = () => { Object.assign(state, clean(raw)); save(); render(); };
  state.meds.length || state.log.length ? ask('¿Reemplazar los intervalos, las pautas y las tomas actuales?', apply) : apply();
}

// ---------- PDF ----------

// Registro mensual en PDF con la plantilla «Medication log»: título, mes y tabla de 5 columnas con filas fijas.
// Se escribe el PDF a mano (sin librerías) con las fuentes estándar Helvetica y Helvetica-Bold, que no hace falta incrustar.
const A4 = { w: 595.28, h: 841.89 };
// Anchos de Helvetica (caracteres 32–126, en milésimas de em) para medir y recortar texto; Helvetica-Bold solo para el título.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELV_BOLD_CAPS = { ' ': 278, A: 722, C: 722, D: 722, E: 667, I: 278, M: 833, N: 722, O: 778, T: 611 };
const textWidth = (text, size) => [...text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
  .reduce((w, c) => w + (HELV[c.charCodeAt(0) - 32] ?? 556), 0) * size / 1000;
const fit = (text, size, max) => { let t = String(text ?? ''); if (textWidth(t, size) <= max) return t; while (t && textWidth(`${t}…`, size) > max) t = t.slice(0, -1); return `${t.trimEnd()}…`; };
// Reparte el texto en como mucho «lines» líneas que quepan en «max»; lo que sobre se recorta con «…» en la última.
function wrap(text, size, max, lines = 2) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), out = [];
  while (words.length && out.length < lines) {
    let line = words.shift();
    while (words.length && textWidth(`${line} ${words[0]}`, size) <= max) line += ` ${words.shift()}`;
    if (textWidth(line, size) > max && out.length < lines - 1) { // palabra más larga que la celda: se parte
      let cut = line.length; while (cut > 1 && textWidth(line.slice(0, cut), size) > max) cut--;
      words.unshift(line.slice(cut)); line = line.slice(0, cut);
    }
    out.push(line);
  }
  if (words.length) out[lines - 1] = `${out[lines - 1]} ${words.join(' ')}`;
  if (out.length) out[out.length - 1] = fit(out.at(-1), size, max);
  return out;
}
// Texto de PDF en WinAnsi (latin-1): se escapan \ ( ) y lo que no cabe en latin-1 pasa a «?».
const pdfText = t => [...t].map(c => c === '…' ? '\\205' : c.charCodeAt(0) > 255 ? '?' : c.replace(/[\\()]/g, '\\$&')).join('');

function pdfPages(month, rows) {
  // Medidas de la plantilla (908 px de ancho) pasadas a puntos de A4.
  const k = A4.w / 908, X = px => px * k, Y = px => A4.h - px * k;
  const cols = [67, 153, 247, 545, 647, 835];
  const head = ['DATE', 'TIME', 'MEDICATION / SUPPLEMENT', 'DOSE', 'NOTES'];
  const rowH = 38.4, top = 126, headH = 38;
  const perPage = Math.floor((A4.h / k - 56 - top - headH) / rowH);
  const pages = [];
  for (let p = 0; p === 0 || p * perPage < rows.length; p++) {
    const c = [];
    const text = (font, size, x, y, t, gray = 0.13) => c.push(`BT /${font} ${size} Tf ${gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(t)}) Tj ET`);
    // Título y mes
    const title = 26;
    text('F2', title, X(67), Y(85), 'MEDICATION');
    const bold = [...'MEDICATION '].reduce((w, ch) => w + HELV_BOLD_CAPS[ch], 0) * title / 1000;
    text('F1', title, X(67) + bold, Y(85), 'LOG');
    text('F1', 8.5, X(610), Y(75), 'MONTH');
    text('F1', 10, X(684), Y(73), month);
    c.push(`0.55 G 0.6 w [0.8 1.2] 0 d ${X(678).toFixed(2)} ${Y(77).toFixed(2)} m ${X(835).toFixed(2)} ${Y(77).toFixed(2)} l S [] 0 d`);
    // Cabecera gris de la tabla
    c.push(`0.85 g ${X(67).toFixed(2)} ${Y(top + headH).toFixed(2)} ${(X(835) - X(67)).toFixed(2)} ${(headH * k).toFixed(2)} re f`);
    head.forEach((h, i) => { const mid = (X(cols[i]) + X(cols[i + 1])) / 2; text('F1', 8.5, mid - textWidth(h, 8.5) / 2, Y(top + headH / 2) - 3, h); });
    // Filas de la página
    const pageRows = rows.slice(p * perPage, (p + 1) * perPage);
    pageRows.forEach((r, n) => {
      // Cada celda, hasta dos líneas centradas en vertical en la fila.
      const mid = Y(top + headH + rowH * n + rowH / 2) - 3, lead = 9.5;
      r.forEach((v, i) => {
        const left = X(cols[i]), w = X(cols[i + 1]) - left, lines = wrap(v, 8.5, w - 8);
        lines.forEach((t, j) => text('F1', 8.5, i < 2 ? left + (w - textWidth(t, 8.5)) / 2 : left + 4, mid + ((lines.length - 1) / 2 - j) * lead, t));
      });
    });
    // Rejilla
    const bottom = top + headH + rowH * perPage;
    c.push('0.45 G 0.6 w');
    for (let n = 0; n <= perPage + 1; n++) { const y = n === 0 ? top : top + headH + rowH * (n - 1); c.push(`${X(67).toFixed(2)} ${Y(y).toFixed(2)} m ${X(835).toFixed(2)} ${Y(y).toFixed(2)} l S`); }
    for (const x of cols) c.push(`${X(x).toFixed(2)} ${Y(top).toFixed(2)} m ${X(x).toFixed(2)} ${Y(bottom).toFixed(2)} l S`);
    pages.push(c.join('\n'));
  }
  return pages;
}

// Ensambla el fichero PDF: catálogo, páginas, dos fuentes estándar y un contenido por página; luego la tabla xref.
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

const monthName = (y, m) => { const t = new Date(y, m, 1).toLocaleDateString('es', { month: 'long' }); return `${t[0].toUpperCase()}${t.slice(1)} ${y}`; };

// Tomas del mes por fecha y hora: fecha, hora, y la pauta tal como se tomó: nombre, dosis y, en notas, indicaciones.
function exportPDF(y, m) {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const rows = state.log.filter(e => e.day.startsWith(prefix)).sort((a, b) => a.at.localeCompare(b.at)).map(e => {
    return [e.day.slice(8) + '/' + e.day.slice(5, 7), time(e.at), e.name, e.dose, e.notes];
  });
  download(`dosify-${prefix}.pdf`, pdfFile(pdfPages(monthName(y, m), rows)), 'application/pdf');
}

// Mes del PDF (ion-select en action sheet): de los últimos 6 meses, solo los que tienen alguna toma, del más reciente
// al más antiguo; por defecto, el más reciente. Sin tomas en ese tiempo, la fila y el botón quedan desactivados.
const pdfMonth = $('#pdf-month');
function renderPdfMonths() {
  const now = new Date(), logged = new Set(state.log.map(e => e.day.slice(0, 7)));
  const months = Array.from({ length: 6 }, (_, i) => dayKey(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7)).filter(k => logged.has(k));
  pdfMonth.innerHTML = months.map(k => `<ion-select-option value="${k}">${monthName(Number(k.slice(0, 4)), Number(k.slice(5)) - 1)}</ion-select-option>`).join('');
  if (!months.includes(pdfMonth.value)) pdfMonth.value = months[0];
  pdfMonth.disabled = $('#export-pdf').disabled = !months.length;
  pdfMonth.placeholder = 'Sin tomas';
}
const exportPdfMonth = () => exportPDF(Number(pdfMonth.value.slice(0, 4)), Number(pdfMonth.value.slice(5)) - 1);

// ---------- Editor ----------

// Al cerrar un editor (guardar o cancelar), la lista de Pautas vuelve a la posición en que estaba al abrirlo.
let managerY = 0;
const managerScroller = () => $('#manager ion-content').getScrollElement();
const rememberScroll = async () => { managerY = (await managerScroller()).scrollTop; };
const restoreScroll = async () => { const sc = await managerScroller(); sc.scrollTop = managerY; requestAnimationFrame(() => { sc.scrollTop = managerY; }); };

const editor = $('#editor');
const field = name => $(`[name="${name}"]`, editor);
let editing = null;

// En «Tomas» del editor solo salen los intervalos visibles; los ocultos conservan su valor.
function openEditor(med = {}) {
  editing = med.id ?? null;
  TEXT.forEach(f => field(f).value = med[f] ?? '');
  field('days').value = span(med);
  $('#editor-slots').innerHTML = visibleIntervals().map(iv => `<ion-item><ion-checkbox name="${iv.id}" ${med.slots?.includes(iv.id) ? 'checked' : ''}>${esc(label(iv.id))}</ion-checkbox></ion-item>`).join('')
    || empty('No hay intervalos visibles.');
  $('#delete').classList.toggle('ion-hide', !editing);
  rememberScroll();
  editor.present();
}

function saveEditor() {
  const old = state.meds.find(m => m.id === editing);
  const med = Object.fromEntries(TEXT.map(f => [f, String(field(f).value ?? '').trim()]));
  med.slots = IDS.filter(id => interval(id).visible ? field(id).checked : old?.slots.includes(id));
  if (!med.name) return field('name').setFocus();
  // Duración: si cambia, empieza hoy (vacía, sin fin); si no, se conservan las fechas.
  const days = Number(field('days').value) || '';
  Object.assign(med, days === span(old ?? {}) ? { from: old?.from ?? '', to: old?.to ?? '' } : { from: days ? today() : old?.from ?? '', to: days ? addDays(today(), days - 1) : '' });
  const done = () => { save(); render(); editor.dismiss(); };
  if (!old) return state.meds.push({ id: newId(), ...med }), done();
  // Cambiar la pauta: las tomas de hoy en adelante pasan a mostrarla nueva; si cambia lo que se ve en el registro
  // (nombre, dosis, indicaciones) y hay tomas anteriores, se elige si también se cambian esas.
  const apply = all => {
    Object.assign(old, med);
    for (const e of state.log) if (e.id === old.id && (all || e.day >= today())) Object.assign(e, snap(old));
    done();
  };
  const changed = SNAP.some(k => med[k] !== old[k]);
  if (!changed || !state.log.some(e => e.id === old.id && e.day < today())) return apply(false);
  sheet('¿A qué se aplican los cambios?', [
    { text: 'Aplicar a partir de hoy', handler: () => apply(false) },
    { text: 'Aplicar a todo el registro', handler: () => apply(true) },
  ]);
}

// ---------- Editor de intervalo ----------

const intervalEditor = $('#interval-editor');
const ivField = name => $(`[name="${name}"]`, intervalEditor);
let editingInterval = null;

function openIntervalEditor(id) {
  editingInterval = id;
  const iv = interval(id);
  ivField('name').value = iv.name;
  for (const f of ['start', 'end']) { ivField(f).value = iv[f]; ivField(f).classList.remove('ion-invalid', 'ion-touched'); }
  rememberScroll();
  intervalEditor.present();
}

// Las horas son opcionales; si se ponen, enteras de 0 a 24. Una hora no válida se marca en rojo (Ionic) y recibe el foco.
function saveIntervalEditor() {
  const [start, end] = ['start', 'end'].map(f => hour(ivField(f).value));
  for (const [f, v] of [['start', start], ['end', end]]) ivField(f).classList.toggle('ion-invalid', v === null);
  const bad = ['start', 'end'].find((f, i) => [start, end][i] === null);
  if (bad) return ['start', 'end'].forEach(f => ivField(f).classList.add('ion-touched')), ivField(bad).setFocus();
  Object.assign(interval(editingInterval), { name: String(ivField('name').value ?? '').trim(), start, end });
  save();
  render();
  intervalEditor.dismiss();
}

// ---------- Wiring ----------

function render() {
  renderSlots();
  renderDays();
  renderToma();
  keepScroll($('#manager ion-content'), () => { renderPautas(); renderIntervals(); renderPdfMonths(); });
}

$('#day').addEventListener('ionChange', renderToma);
$('#slot').addEventListener('ionChange', renderToma);
// La pauta de una fila de la toma: si ese día ya está tomada, como se tomó; si no, la pauta actual.
const rowMed = id => { const e = state.log.find(e => e.day === selectedDay() && e.slot === selectedSlot() && String(e.id) === id); return e ? takenAs(e) : state.meds.find(m => m.id === id); };
// Marcar o desmarcar se confirma en un action sheet; si se cancela, la casilla vuelve a como estaba.
$('#toma').addEventListener('ionChange', e => {
  const { id, slot } = e.target.dataset;
  const { checked } = e.detail;
  const { name } = rowMed(id);
  sheet(name, [{ text: checked ? 'Marcar como tomado' : 'Marcar como pendiente', handler: () => toggle(id, slot, checked) }], renderToma);
});
$('#toma').addEventListener('click', e => {
  const id = e.target.closest('[data-info]')?.dataset.info;
  if (id) openInfo(rowMed(id));
  // El texto va fuera de la casilla (para ocupar toda la fila); pulsarlo también la marca o desmarca.
  if (e.target.closest('ion-label')) e.target.closest('ion-item').querySelector('ion-checkbox')?.click();
  if (e.target.closest('#toma-sort')) chooseOrder();
  if (e.target.closest('#pending-sort')) { sortingPending = !sortingPending; renderToma(); }
});
// Al soltar, complete() deja la fila en su sitio en pantalla: solo se guarda el orden, sin repintar ni mover el scroll.
$('#toma').addEventListener('ionReorderEnd', e => {
  const slot = selectedSlot();
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

// Intervalos: la casilla cambia si es visible; tocar la fila (fuera de la casilla y del asa) abre su editor.
$('#intervals').addEventListener('ionChange', e => {
  interval(e.target.dataset.interval).visible = e.detail.checked;
  save();
  render();
});
$('#intervals').addEventListener('click', e => {
  if (e.target.closest('ion-checkbox, ion-reorder')) return;
  const id = e.target.closest('ion-item')?.dataset.interval;
  if (id) openIntervalEditor(id);
});
// Al soltar no se repinta la lista de intervalos (el scroll no salta); sí lo que depende de su orden.
$('#intervals').addEventListener('ionReorderEnd', e => {
  state.intervals = move(state.intervals, e.detail);
  e.detail.complete();
  save();
  renderSlots();
  renderToma();
  renderPautas();
});
$('#interval-cancel').onclick = () => intervalEditor.dismiss();
intervalEditor.addEventListener('ionModalDidDismiss', restoreScroll);
$('#interval-save').onclick = saveIntervalEditor;
for (const f of ['start', 'end']) ivField(f).addEventListener('ionInput', () => ivField(f).classList.remove('ion-invalid'));

$('#import').onclick = () => $('#file').click();
$('#file').onchange = e => { importCSV(e.target.files[0]); e.target.value = ''; };
$('#export').onclick = () => download('dosify.csv', exportCSV());
$('#export-pdf').onclick = exportPdfMonth;
$('#clear-log').onclick = () => ask('¿Borrar todas las tomas registradas?', () => { state.log = []; save(); render(); });

$('#cancel').onclick = () => editor.dismiss();
editor.addEventListener('ionModalDidDismiss', restoreScroll);
$('#save').onclick = saveEditor;
$('#delete').onclick = () => ask('¿Eliminar esta pauta?', () => {
  state.meds = state.meds.filter(m => m.id !== editing);
  for (const iv of state.intervals) iv.order = iv.order.filter(id => id !== editing);
  save();
  render();
  editor.dismiss();
});

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && render());
$('#day').setAttribute('value', today());
renderSlots();
$('#slot').value = intervalNow();
render();
// Al cargar, hoy (el último día) siempre a la vista.
$('#day').componentOnReady().then(() => requestAnimationFrame(() => { $('#day').scrollLeft = $('#day').scrollWidth; }));
