const KEY = 'dosify';
// Tres intervalos fijos, identificados por su código. Su nombre, horas, orden y visibilidad se configuran en Pautas › Intervalos.
const IDS = ['i1', 'i2', 'i3'];
const ORD = { i1: 'o1', i2: 'o2', i3: 'o3' }; // posición de la pauta en la lista de tomas de cada intervalo (1, 2, 3…)
const DEFAULT_INTERVALS = [
  { id: 'i1', name: 'Desayuno', start: 6, end: 12, visible: true },
  { id: 'i2', name: 'Almuerzo', start: 12, end: 18, visible: true },
  { id: 'i3', name: 'Cena', start: 18, end: 24, visible: true },
];
const TEXT = ['name', 'dose', 'notes', 'refs', 'days'];
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

const state = { meds: [], log: [], intervals: structuredClone(DEFAULT_INTERVALS), ...JSON.parse(localStorage.getItem(KEY)) };
// Compatibilidad con datos guardados por versiones anteriores: lo que falte toma un valor por defecto (no se convierte nada).
for (const m of state.meds) { for (const id of IDS) { m[id] = yes(m[id] ?? ''); m[ORD[id]] ??= ''; } m.start ??= ''; m.days ??= ''; }
for (const e of state.log) e.day ??= dayKey(new Date(e.at));
for (const iv of DEFAULT_INTERVALS) if (!state.intervals.some(x => x.id === iv.id)) state.intervals.push({ ...iv });
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
const lastDay = m => { const d = fromKey(m.start); d.setDate(d.getDate() + Number(m.days) - 1); return d; };
const timed = m => Number(m.days) > 0 && m.start !== '';
const active = m => !timed(m) || today() <= dayKey(lastDay(m));
const selectedDay = () => $('#day').value || today();
// Orden de tomas de un intervalo: por su número (o1/o2/o3); las pautas sin número van detrás, en el orden de pautas.
const pos = (m, slot) => Number(m[ORD[slot]]) || Infinity;
const bySlot = (meds, slot) => [...meds].sort((a, b) => pos(a, slot) - pos(b, slot));
// Historial: al guardar cambios «a partir de hoy», la pauta guarda cómo era hasta ayer en «versions» ([{ to, …campos }],
// de la más antigua a la más reciente; «to» es su último día). Cada día se pinta con la versión que tocaba.
const VERSIONED = ['name', 'dose', 'notes', 'refs', ...IDS];
const asOf = (m, day) => { const v = m.versions?.find(v => day <= v.to); return v ? { ...m, ...v } : m; };
const doses = (slot, day = selectedDay()) => bySlot(state.meds.map(m => asOf(m, day)).filter(m => active(m) && m[slot]), slot);
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
  const recent = Array.from({ length: DAYS + 1 }, (_, i) => daysAgo(DAYS - i));
  const logged = state.log.map(e => e.day).filter(day => day >= daysAgo(DAYS_MAX));
  const keys = [...new Set([...logged, ...recent, $('#day').value].filter(Boolean))].sort();
  $('#day').innerHTML = keys.map(key => {
    const d = fromKey(key);
    const all = visibleIntervals().flatMap(iv => doses(iv.id, key).map(m => ({ id: m.id, slot: iv.id })));
    const done = all.filter(x => taken(key, x.id, x.slot)).length;
    return `
      <ion-segment-button value="${key}" layout="icon-bottom">
        ${ring(done, all.length, `${done}/${all.length}`)}
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
const sortTaken = (rows, entry) => order === 'tomas' ? rows
  : order === 'pautas' ? state.meds.map(m => rows.find(r => r.id === m.id)).filter(Boolean)
  : [...rows].sort((a, b) => entry(a).at.localeCompare(entry(b).at) * (order === 'oldest' ? 1 : -1));

// Mueve un elemento de la posición «from» a «to» (detalle de ionReorderEnd; «to» falta si no se movió).
const move = (list, { from, to = from }) => { const l = [...list]; l.splice(to, 0, ...l.splice(from, 1)); return l; };

// Ordenar «Pendiente» mueve esas pautas entre los huecos que ocupan en el intervalo (las ya tomadas no se mueven)
// y renumera el intervalo entero: 1, 2, 3…
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
  const slot = selectedSlot();
  if (!slot) { $('#toma').innerHTML = emptyList('No hay intervalos visibles. Actívalos en Pautas › Intervalos.'); return; }
  const rows = doses(slot, day);
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
    const { name } = asOf(state.meds.find(m => m.id === id), day);
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
  ? `<ion-chip color="${active(m) ? 'primary' : 'medium'}"><ion-label>${esc(label(slot))}</ion-label></ion-chip>`
  : `<ion-chip outline="true" color="medium"><ion-label>${esc(label(slot))}</ion-label></ion-chip>`;

const pautaRow = m => `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap" ${active(m) ? '' : 'color="medium"'}>
      <h2 class="medium">${esc(m.name)}</h2>
      ${timed(m) ? `<p><ion-text color="rose" class="medium">${active(m) ? `${Number(m.days)} días · hasta el` : 'Finalizada el'} ${lastDay(m).toLocaleDateString('es')}</ion-text></p>` : ''}
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

function download(name, data, type = 'text/csv') {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href));
}

// Un solo CSV con todo: filas «intervalo» (en su orden), «pauta» (en el orden de pautas, cada una seguida de sus
// filas «version», las versiones anteriores) y «toma».
// Cada tipo usa sus columnas: [campo interno, columna del CSV].
const CSV_COLS = {
  intervalo: [['name', 'nombre'], ['id', 'intervalo'], ['start', 'hora inicio'], ['end', 'hora fin'], ['visible', 'visible']],
  pauta: [['name', 'nombre'], ['dose', 'dosis'], ...IDS.map(id => [id, id]), ['notes', 'indicaciones'], ['refs', 'referencias'],
    ['start', 'inicio'], ['days', 'dias'], ...IDS.map(id => [ORD[id], `orden ${id}`])],
  version: [['name', 'nombre'], ['dose', 'dosis'], ...IDS.map(id => [id, id]), ['notes', 'indicaciones'], ['refs', 'referencias'], ['to', 'hasta']],
  toma: [['name', 'nombre'], ['day', 'fecha'], ['time', 'hora'], ['slot', 'intervalo']],
};
const HEAD = ['tipo', ...new Set(Object.values(CSV_COLS).flat().map(([, col]) => col))];
const csvRow = (tipo, obj) => HEAD.map(col => col === 'tipo' ? tipo : obj[CSV_COLS[tipo].find(([, c]) => c === col)?.[0]] ?? '');

const exportCSV = () => csv([
  HEAD,
  ...state.intervals.map(iv => csvRow('intervalo', iv)),
  ...state.meds.flatMap(m => [csvRow('pauta', m), ...(m.versions ?? []).map(v => csvRow('version', v))]),
  ...[...state.log].sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at)).map(e => csvRow('toma', { ...e, time: time(e.at) })),
]);

async function importCSV(file) {
  const rows = parseCSV(await file.text());
  // Las columnas se buscan por su nombre en la cabecera, así un CSV con columnas de menos o en otro orden también vale.
  const head = rows[0]?.[0].toLowerCase() === HEAD[0] ? rows.shift().map(h => h.toLowerCase()) : HEAD;
  const read = (tipo, r) => Object.fromEntries(CSV_COLS[tipo].map(([key, col]) => [key, r[head.indexOf(col)] ?? '']));
  const intervals = [], meds = [], log = [], ids = new Map();
  for (const r of rows) {
    const tipo = r[0];
    if (tipo === 'intervalo') {
      const iv = read(tipo, r);
      if (IDS.includes(iv.id) && !intervals.some(x => x.id === iv.id)) intervals.push({ ...iv, start: hour(iv.start) ?? '', end: hour(iv.end) ?? '', visible: yes(iv.visible) });
    } else if (tipo === 'pauta') {
      const m = { id: crypto.randomUUID(), ...read(tipo, r) };
      for (const id of IDS) m[id] = yes(m[id]);
      meds.push(m);
      if (!ids.has(m.name)) ids.set(m.name, m.id);
    } else if (tipo === 'version' && meds.length) {
      // Versión anterior de la pauta de la fila «pauta» que la precede.
      const v = read(tipo, r);
      for (const id of IDS) v[id] = yes(v[id]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(v.to)) (meds.at(-1).versions ??= []).push(v), meds.at(-1).versions.sort((a, b) => a.to.localeCompare(b.to));
    } else if (tipo === 'toma') {
      const t = read(tipo, r);
      const at = new Date(`${t.day}T${t.time || '00:00'}`);
      if (IDS.includes(t.slot) && !isNaN(at)) log.push({ at: at.toISOString(), day: t.day, id: ids.get(t.name) ?? null, name: t.name, slot: t.slot });
    }
  }
  if (!intervals.length && !meds.length && !log.length) return;
  // Los intervalos que falten en el CSV se completan con los actuales.
  for (const iv of state.intervals) if (!intervals.some(x => x.id === iv.id)) intervals.push(iv);
  const apply = () => { state.intervals = intervals; state.meds = meds; state.log = log.sort((a, b) => b.at.localeCompare(a.at)); save(); render(); };
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

// Tomas del mes por fecha y hora: fecha, hora, pauta, y de la pauta su dosis y, en notas, sus indicaciones.
function exportPDF(y, m) {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const rows = state.log.filter(e => e.day.startsWith(prefix)).sort((a, b) => a.at.localeCompare(b.at)).map(e => {
    const found = state.meds.find(x => x.id === e.id) ?? state.meds.find(x => x.name === e.name);
    const med = found && asOf(found, e.day);
    return [e.day.slice(8) + '/' + e.day.slice(5, 7), time(e.at), e.name, med?.dose ?? '', med?.notes ?? ''];
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

const editor = $('#editor');
const field = name => $(`[name="${name}"]`, editor);
let editing = null;

// En «Tomas» del editor solo salen los intervalos visibles; los ocultos conservan su valor.
function openEditor(med = {}) {
  editing = med.id ?? null;
  TEXT.forEach(f => field(f).value = med[f] ?? '');
  $('#editor-slots').innerHTML = visibleIntervals().map(iv => `<ion-item><ion-checkbox name="${iv.id}" ${med[iv.id] ? 'checked' : ''}>${esc(label(iv.id))}</ion-checkbox></ion-item>`).join('')
    || empty('No hay intervalos visibles.');
  $('#delete').classList.toggle('ion-hide', !editing);
  editor.present();
}

function saveEditor() {
  const med = Object.fromEntries([
    ...TEXT.map(f => [f, String(field(f).value ?? '').trim()]),
    ...visibleIntervals().map(iv => [iv.id, field(iv.id).checked]),
  ]);
  if (!med.name) return field('name').setFocus();
  const old = state.meds.find(m => m.id === editing);
  med.start = med.days === (old?.days ?? '') ? old?.start ?? '' : med.days ? today() : ''; // una duración nueva empieza hoy
  const apply = fromToday => {
    if (old && fromToday) {
      // Guarda cómo era la pauta hasta ayer, salvo que ya haya una versión hasta ayer (otro cambio hecho hoy).
      const to = daysAgo(1);
      old.versions ??= [];
      if (!old.versions.some(v => v.to >= to)) old.versions.push({ to, ...Object.fromEntries(VERSIONED.map(k => [k, old[k]])) });
    }
    if (old && fromToday === false) delete old.versions;
    if (old) Object.assign(old, med);
    else state.meds.push({ id: crypto.randomUUID(), ...Object.fromEntries(IDS.flatMap(id => [[id, false], [ORD[id], '']])), ...med });
    save();
    render();
    editor.dismiss();
  };
  // Si cambia algo de lo que se ve en el registro, se elige si vale desde hoy o para todo el registro.
  if (old && VERSIONED.some(k => (k in med) && med[k] !== old[k])) {
    sheet('¿A qué se aplican los cambios?', [
      { text: 'Aplicar a partir de hoy', handler: () => apply(true) },
      { text: 'Aplicar a todo el registro', handler: () => apply(false) },
    ]);
  } else apply(null); // sin cambios en lo que se ve en el registro: se guarda tal cual, sin tocar el historial
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
  intervalEditor.present();
}

// Las horas son opcionales; si se ponen, enteras de 0 a 24. Una hora no válida se marca con el error de Ionic.
function saveIntervalEditor() {
  const [start, end] = ['start', 'end'].map(f => hour(ivField(f).value));
  for (const [f, v] of [['start', start], ['end', end]]) ivField(f).classList.toggle('ion-invalid', v === null);
  if (start === null || end === null) return ['start', 'end'].forEach(f => ivField(f).classList.add('ion-touched'));
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
  renderPautas();
  renderIntervals();
  renderPdfMonths();
}

$('#day').addEventListener('ionChange', renderToma);
$('#slot').addEventListener('ionChange', renderToma);
// Marcar o desmarcar se confirma en un action sheet; si se cancela, la casilla vuelve a como estaba.
$('#toma').addEventListener('ionChange', e => {
  const { id, slot } = e.target.dataset;
  const { checked } = e.detail;
  const { name } = asOf(state.meds.find(m => m.id === id), selectedDay());
  sheet(name, [{ text: checked ? 'Marcar como tomado' : 'Marcar como pendiente', handler: () => toggle(id, slot, checked) }], renderToma);
});
$('#toma').addEventListener('click', e => {
  const id = e.target.closest('[data-info]')?.dataset.info;
  if (id) openInfo(asOf(state.meds.find(m => m.id === id), selectedDay()));
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
$('#interval-save').onclick = saveIntervalEditor;
for (const f of ['start', 'end']) ivField(f).addEventListener('ionInput', () => ivField(f).classList.remove('ion-invalid'));

$('#import').onclick = () => $('#file').click();
$('#file').onchange = e => { importCSV(e.target.files[0]); e.target.value = ''; };
$('#export').onclick = () => download('dosify.csv', exportCSV());
$('#export-pdf').onclick = exportPdfMonth;
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
renderSlots();
$('#slot').value = intervalNow();
render();
// Al cargar, hoy (el último día) siempre a la vista.
$('#day').componentOnReady().then(() => requestAnimationFrame(() => { $('#day').scrollLeft = $('#day').scrollWidth; }));
