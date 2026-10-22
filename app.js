const KEY = 'dosify';
// Modelo:
// · intervals: los de DEFAULT_INTERVALS (para tener más basta añadir otro allí), en su orden:
//   { id, name, start, end (horas), visible, order: [ids de pauta en el orden de tomas] }
// · meds: pautas, en el orden de pautas: { id, name, notes (indicaciones), refs (referencias), memo (notas),
//   slots: [ids de intervalo], cost (€ por envase) y units (dosis por envase), enteros o vacíos, y
//   plan: [programaciones { dose (empieza por la cantidad de cada toma), start, days }] }
// · log: tomas: { at, day, id (de la pauta), slot (id de intervalo), name, dose, notes (la pauta tal como se tomó) }
const DEFAULT_INTERVALS = [
  { id: 'i1', name: 'Desayuno', start: 6, end: 12, visible: true, order: [] },
  { id: 'i2', name: 'Almuerzo', start: 12, end: 18, visible: true, order: [] },
  { id: 'i3', name: 'Cena', start: 18, end: 24, visible: true, order: [] },
];
const IDS = DEFAULT_INTERVALS.map(iv => iv.id);
const newId = () => crypto.randomUUID().slice(0, 8);
const TEXT = ['name', 'notes', 'refs', 'memo'];
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
// Entero ≥ min o '' (vacío); null si se escribió algo que no lo es.
const int = (v, min = 0) => { const t = String(v ?? '').trim(); return t === '' ? '' : /^\d+$/.test(t) && Number(t) >= min ? Number(t) : null; };
// Cantidad de cada toma: el número con que empieza la dosis («1 comprimido», «0,5 ml»); 0 si no empieza por número.
const amount = dose => Number(String(dose).match(/^\s*(\d+(?:[.,]\d+)?)/)?.[1].replace(',', '.')) || 0;
// Programaciones válidas (dosis con número, fecha y duración), en orden de fecha de inicio y, a igual fecha, de duración.
const cleanPlan = v => (Array.isArray(v) ? v : []).filter(p => p && amount(p.dose) && date(p.start) && Number.isInteger(p.days) && p.days >= 1)
  .map(p => ({ dose: p.dose, start: p.start, days: p.days })).sort((a, b) => a.start.localeCompare(b.start) || a.days - b.days);
function clean(raw) {
  const arr = v => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
  const meds = arr(raw?.meds).filter(m => text(m.id) && text(m.name)).map(m => ({
    id: m.id, name: m.name, notes: text(m.notes), refs: text(m.refs), memo: text(m.memo),
    slots: IDS.filter(id => list(m.slots).includes(id)), cost: int(m.cost) ?? '', units: int(m.units, 1) ?? '',
    plan: cleanPlan(m.plan),
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

const addDays = (key, n) => { const d = fromKey(key); d.setDate(d.getDate() + n); return dayKey(d); };
const selectedDay = () => $('#day').value || today();
// Orden de tomas de un intervalo: su lista «order»; las pautas que no están en ella van detrás, en el orden de pautas.
const pos = (m, slot) => { const i = interval(slot).order.indexOf(m.id); return i < 0 ? Infinity : i; };
const bySlot = (meds, slot) => [...meds].sort((a, b) => pos(a, slot) - pos(b, slot));
// Programación de un día: la última que empezó ese día o antes (una fecha de inicio posterior corta a la anterior),
// si su duración llega a ese día. Una pauta con programaciones solo sale en la toma los días que alguna cubre, y con
// su dosis; sin programaciones, todos los días, sin dosis.
const planEnd = p => addDays(p.start, p.days - 1);
const planOn = (m, day) => { const p = m.plan.filter(p => p.start <= day).at(-1); return p && day <= planEnd(p) ? p : null; };
const onDay = (m, day) => !m.plan.length || !!planOn(m, day);
const doseOn = (m, day) => planOn(m, day)?.dose ?? '';
const doses = (slot, day = selectedDay()) => bySlot(state.meds.filter(m => m.slots.includes(slot) && onDay(m, day)).map(m => ({ ...m, dose: doseOn(m, day) })), slot);
// Cada toma guarda nombre, dosis e indicaciones de la pauta al tomarla; así el registro muestra lo que se tomó aunque la
// pauta cambie o se borre.
const SNAP = ['name', 'dose', 'notes'];
const EDITED = ['name', 'notes']; // lo que el editor de pauta cambia de lo que guarda cada toma
const snap = m => Object.fromEntries(SNAP.map(k => [k, m[k]]));
const snapOn = (m, day) => ({ ...snap(m), dose: doseOn(m, day) }); // la pauta tal como se toma ese día
const takenAs = e => { const m = state.meds.find(x => x.id === e.id); return { refs: m?.refs ?? '', memo: m?.memo ?? '', id: e.id, ...snap(e) }; };
// Filas de un día e intervalo: pendientes (pautas vigentes sin toma) y tomadas (sus tomas, también las de pautas que ya
// no están en el intervalo o se borraron).
function dayRows(slot, day) {
  const entries = state.log.filter(e => e.day === day && e.slot === slot);
  const pending = doses(slot, day).filter(m => !entries.some(e => e.id === m.id));
  return { pending, taken: entries.map(e => ({ ...takenAs(e), entry: e })) };
}

// ---------- Toma ----------

const ring = (done, total, label, size = 44, font = 11, color = 'primary') => `
  <ion-text color="${color}">
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
        <ion-icon slot="icon-only" name="information-circle" color="${supplyColor(m.id)}" size="large"></ion-icon>
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

// Ficha de la pauta (dosis, indicaciones, referencias y notas) para leerla con calma; los enlaces se pueden pulsar.
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
  $('#info-body').innerHTML = section('Dosis', m.dose) + section('Indicaciones', m.notes) + section('Referencias', m.refs) + section('Notas', m.memo);
  info.present();
}

function toggle(id, slot, checked) {
  const day = selectedDay();
  if (checked) {
    state.log.unshift({ at: new Date().toISOString(), day, id, slot, ...snapOn(state.meds.find(m => m.id === id), day) });
    state.log.length = Math.min(state.log.length, LOG_MAX);
  } else {
    state.log = state.log.filter(e => !(e.day === day && String(e.id) === id && e.slot === slot));
  }
  save();
  render();
}

// ---------- Pautas ----------

const manager = $('#manager');
// Una pauta con programaciones está terminada si ya acabaron todas (ni vigente ni futura): sale en gris, sin costes.
const finished = m => m.plan.length > 0 && !planOn(m, today()) && !m.plan.some(p => p.start > today());
const chip = (m, slot) => m.slots.includes(slot)
  ? `<ion-chip color="${finished(m) ? 'medium' : 'primary'}"><ion-label>${esc(label(slot))}</ion-label></ion-chip>`
  : `<ion-chip outline="true" color="medium"><ion-label>${esc(label(slot))}</ion-label></ion-chip>`;

// Fila de una pauta: nombre (con el fin del envase a la derecha), costes, la dosis de hoy (la de su programación), las
// indicaciones y sus intervalos.
const pautaRow = m => finished(m) ? `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap" color="medium">
      <h2 class="medium">${esc(m.name)}</h2>
      ${doseLine(m.plan.at(-1).dose, false)}
      ${notesLine(m)}
      <p>${visibleIntervals().map(iv => chip(m, iv.id)).join('')}</p>
    </ion-label>
    <ion-reorder slot="end"></ion-reorder>
  </ion-item>` : `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap">
      ${endNote(m.id)}
      <h2 class="medium">${esc(m.name)}</h2>
      ${costLine(m) ? `<p><ion-text color="teal" class="medium">${costLine(m)}</ion-text></p>` : ''}
      ${doseLine(doseOn(m, today()))}
      ${notesLine(m)}
      <p>${visibleIntervals().map(iv => chip(m, iv.id)).join('')}</p>
    </ion-label>
    <ion-reorder slot="end"></ion-reorder>
  </ion-item>`;

// Costes y envase. Las dosis al día son la cantidad de la dosis de hoy (la de su programación, si la hay) por cada
// intervalo visible de la pauta.
const perDayUnits = m => amount(doseOn(m, today())) * m.slots.filter(id => interval(id).visible).length;
const perDay = m => m.cost / m.units * perDayUnits(m);
const monthDays = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
const euros = (n, digits = 2) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });
const per = (n, unit) => `${euros(n, Number.isInteger(n) ? 0 : 2).replace(/\s*€/, '')} €/${unit}`;
// Hasta cuándo dura el envase actual. Se suman todas las dosis registradas de la pauta y, cada vez que completan un
// envase, se empieza otro: lo que queda del actual es el resto. Se descuentan las que faltan hoy y se reparte lo que
// queda entre las dosis al día (las de la programación vigente). Si el envase no llega a cubrir hoy, se acaba hoy.
function runsOut(m) {
  const daily = perDayUnits(m);
  if (!m.units || !daily) return '';
  const taken = state.log.filter(e => e.id === m.id);
  const sum = list => list.reduce((n, e) => n + amount(e.dose), 0);
  const pendingToday = Math.max(0, daily - sum(taken.filter(e => e.day === today())));
  const left = m.units - sum(taken) % m.units - pendingToday;
  return addDays(today(), left < 0 ? 0 : Math.floor(left / daily));
}
// Aviso de que el envase se acaba: menos de 7 días. Pone en rosa el (i) de la toma y la fecha de fin de la pauta.
const daysLeft = end => Math.round((fromKey(end) - fromKey(today())) / 864e5);
const runningOut = m => { const end = runsOut(m); return !!end && daysLeft(end) < 7; };
const supplyColor = id => { const m = state.meds.find(x => x.id === id); return m && runningOut(m) ? 'rose' : 'teal'; };
// Fin del envase («5/01») a la derecha de la fila de la pauta, a la altura del nombre: en gris; si se acaba, en rosa y peso medio.
const endNote = id => {
  const m = state.meds.find(x => x.id === id), end = m && runsOut(m);
  if (!end) return '';
  return `<ion-note ${runningOut(m) ? 'class="ion-float-right medium" color="rose"' : 'class="ion-float-right"'}>${Number(end.slice(8))}/${end.slice(5, 7)}</ion-note>`;
};
// Línea de costes de la fila de una pauta: «30 €/ud · 15 €/mes · 1 €/día», con lo que se pueda calcular.
function costLine(m) {
  const parts = [];
  if (m.cost !== '') parts.push(per(m.cost, 'ud'));
  if (m.cost !== '' && m.units && perDayUnits(m)) parts.push(per(perDay(m) * monthDays(), 'mes'), per(perDay(m), 'día'));
  return parts.join(' · ');
}
function renderCosts() {
  const meds = state.meds.filter(m => !finished(m)), priced = meds.filter(m => m.cost !== ''), full = priced.filter(m => m.units !== '');
  const row = (title, text) => `<ion-item><ion-label><h2 class="medium">${title}</h2><p>${text}</p></ion-label></ion-item>`;
  const daily = full.reduce((sum, m) => sum + perDay(m), 0);
  // Costes del conjunto: total de los envases y, con las dosis por envase, al día y al mes (los días del mes actual).
  $('#costs').innerHTML = priced.length ? `
    <ion-list-header><ion-label>Costes</ion-label></ion-list-header>
    <ion-list inset="true">
      ${row(`${euros(priced.reduce((sum, m) => sum + m.cost, 0), 0)} en total`, `${priced.length} de ${meds.length} productos con coste`)}
      ${row(`${euros(daily * monthDays())} al mes`, `${euros(daily)} al día · ${full.length} de ${meds.length} productos con coste y dosis por envase`)}
    </ion-list>` : '';
}

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
// · pauta: id, nombre, intervalos (ids separados por espacios), indicaciones, referencias, notas, coste (€ por envase) y
//   envase (dosis por envase). En el orden de pautas, cada una seguida de sus filas «programacion»: id de la pauta,
//   dosis, desde (fecha de inicio) y dias (duración).
// · toma: id de la pauta, intervalos (el de la toma), fecha («AAAA-MM-DD HH:MM») y la pauta como se tomó: nombre,
//   dosis e indicaciones.
const HEAD = ['tipo', 'id', 'nombre', 'intervalos', 'desde', 'hasta', 'fecha', 'dias', 'dosis', 'indicaciones', 'referencias', 'notas', 'coste', 'envase', 'visible', 'orden'];
const csvRow = (tipo, o) => HEAD.map(h => h === 'tipo' ? tipo : o[h] ?? '');

const exportCSV = () => csv([
  HEAD,
  ...state.intervals.map(iv => csvRow('intervalo', { id: iv.id, nombre: iv.name, desde: iv.start, hasta: iv.end, visible: iv.visible, orden: iv.order.join(' ') })),
  ...state.meds.flatMap(m => [csvRow('pauta', { id: m.id, nombre: m.name, intervalos: m.slots.join(' '), indicaciones: m.notes, referencias: m.refs, notas: m.memo, coste: m.cost, envase: m.units }),
    ...m.plan.map(p => csvRow('programacion', { id: m.id, dosis: p.dose, desde: p.start, dias: p.days }))]),
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
    if (c.tipo === 'pauta') raw.meds.push({ id: c.id || newId(), name: c.nombre, notes: c.indicaciones, refs: c.referencias, memo: c.notas, slots: words(c.intervalos), cost: c.coste, units: c.envase, plan: [] });
    if (c.tipo === 'programacion') raw.meds.find(m => m.id === c.id)?.plan.push({ dose: c.dosis, start: c.desde, days: int(c.dias, 1) });
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
  for (const f of ['cost', 'units']) { field(f).value = med[f] ?? ''; field(f).classList.remove('ion-invalid', 'ion-touched'); }
  $('#editor-slots').innerHTML = visibleIntervals().map(iv => `<ion-item><ion-checkbox name="${iv.id}" ${med.slots?.includes(iv.id) ? 'checked' : ''}>${esc(label(iv.id))}</ion-checkbox></ion-item>`).join('')
    || empty('No hay intervalos visibles.');
  plan = structuredClone(med.plan ?? []);
  renderPlan();
  $('#delete').classList.toggle('ion-hide', !editing);
  $('#record-section').classList.toggle('ion-hide', !editing);
  $('#record-count').textContent = editing ? `${state.log.filter(e => e.id === editing).length} tomas` : '';
  rememberScroll();
  editor.present();
}

function saveEditor() {
  const old = state.meds.find(m => m.id === editing);
  const med = Object.fromEntries(TEXT.map(f => [f, String(field(f).value ?? '').trim()]));
  med.slots = IDS.filter(id => interval(id).visible ? field(id).checked : old?.slots.includes(id));
  if (!med.name) return field('name').setFocus();
  // Coste y dosis por envase: enteros (las dosis, al menos 1) o vacíos; un valor no válido se marca en rojo.
  med.cost = int(field('cost').value); med.units = int(field('units').value, 1);
  for (const f of ['cost', 'units']) field(f).classList.toggle('ion-invalid', med[f] === null);
  const bad = ['cost', 'units'].find(f => med[f] === null);
  if (bad) return field(bad).classList.add('ion-touched'), field(bad).setFocus();
  med.plan = cleanPlan(plan);
  const done = () => { save(); render(); editor.dismiss(); };
  if (!old) return state.meds.push({ id: newId(), ...med }), done();
  // Cambiar la pauta: las tomas de hoy en adelante pasan a mostrarla nueva; si cambia lo que se ve en el registro
  // (nombre, indicaciones) y hay tomas anteriores, se elige si también se cambian esas. La dosis va en la programación.
  const apply = all => {
    Object.assign(old, med);
    for (const e of state.log) if (e.id === old.id && (all || e.day >= today())) Object.assign(e, snapOn(old, e.day));
    done();
  };
  const changed = EDITED.some(k => med[k] !== old[k]);
  if (!changed || !state.log.some(e => e.id === old.id && e.day < today())) return apply(false);
  sheet('¿A qué se aplican los cambios?', [
    { text: 'Aplicar a partir de hoy', handler: () => apply(false) },
    { text: 'Aplicar a todo el registro', handler: () => apply(true) },
  ]);
}

// ---------- Programaciones (dentro del editor de pauta) ----------

// Se editan sobre una copia («plan») que se guarda con la pauta; «Cancelar» en la pauta las descarta.
let plan = [], editingPlan = null;
const planEditor = $('#plan-editor');
const planField = name => $(`[name="${name}"]`, planEditor);
const shortDate = key => fromKey(key).toLocaleDateString('es');

// Cada programación con su fecha de inicio, duración y hasta cuándo vale (antes, si la siguiente empieza antes).
// Hasta qué día vale una programación: su último día o, si la siguiente empieza antes, la víspera de esta.
const planUntil = (plans, p) => { const next = plans.find(q => q.start > p.start); return next && next.start <= planEnd(p) ? addDays(next.start, -1) : planEnd(p); };

function renderPlan() {
  plan = cleanPlan(plan);
  $('#plan-list').innerHTML = plan.map((p, i) => {
    const end = planUntil(plan, p);
    return `<ion-item button="true" data-plan="${i}"><ion-label><h2>${esc(p.dose)}</h2><p>${shortDate(p.start)} – ${shortDate(end)} · ${p.days} ${p.days === 1 ? 'día' : 'días'}</p></ion-label></ion-item>`;
  }).join('') + `<ion-item button="true" detail="false" data-plan="new"><ion-icon slot="start" name="add-outline" color="primary"></ion-icon><ion-label color="primary">Añadir programación</ion-label></ion-item>`;
}

function openPlan(i) {
  editingPlan = i;
  const p = plan[i] ?? { dose: plan.at(-1)?.dose ?? '', start: today(), days: '' };
  for (const f of ['dose', 'start', 'days']) { planField(f).value = p[f]; planField(f).classList.remove('ion-invalid', 'ion-touched'); }
  $('#plan-delete').classList.toggle('ion-hide', i === null);
  planEditor.present();
}

// Dosis que empiece por un número, fecha de inicio y duración de al menos 1 día; si falta algo, se marca en rojo.
function savePlan() {
  const p = { dose: String(planField('dose').value ?? '').trim(), start: date(planField('start').value ?? ''), days: int(planField('days').value, 1) };
  const bad = [['dose', amount(p.dose)], ['start', p.start], ['days', p.days]].filter(([, ok]) => !ok).map(([f]) => f);
  for (const f of ['dose', 'start', 'days']) planField(f).classList.toggle('ion-invalid', bad.includes(f));
  if (bad.length) return bad.forEach(f => planField(f).classList.add('ion-touched')), planField(bad[0]).setFocus();
  if (editingPlan === null) plan.push(p); else plan[editingPlan] = p;
  renderPlan();
  planEditor.dismiss();
}

// ---------- Registro de una pauta ----------

// Todas las tomas de la pauta: resumen (desde cuándo, cuántas, dosis y coste estimado) y, debajo, agrupadas por la
// programación que valía cada día (de la más reciente a la más antigua; las que no tenían, en «Sin programación»).
const recordModal = $('#record');
function openRecord() {
  const m = state.meds.find(x => x.id === editing);
  const taken = state.log.filter(e => e.id === m.id).sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at));
  const units = taken.reduce((n, e) => n + amount(e.dose), 0);
  const item = (k, v) => `<ion-item><ion-label>${k}</ion-label><ion-note slot="end">${v}</ion-note></ion-item>`;
  const summary = [
    ['Desde', taken.length ? shortDate(taken.at(-1).day) : '—'],
    ['Tomas', taken.length],
    ['Dosis tomadas', units.toLocaleString('es')],
    ...(m.cost !== '' && m.units ? [['Coste estimado', euros(units * m.cost / m.units)]] : []),
  ];
  const groups = new Map();
  for (const e of taken) {
    const p = planOn(m, e.day), key = p ? `${p.start}|${p.days}` : '';
    if (!groups.has(key)) groups.set(key, { title: p ? `${esc(p.dose)} · ${shortDate(p.start)}` : 'Sin programación', rows: [] });
    groups.get(key).rows.push(e);
  }
  $('#record-title').textContent = m.name;
  $('#record-body').innerHTML = `
    <ion-list inset="true">${summary.map(([k, v]) => item(k, v)).join('')}</ion-list>
    ${[...groups.values()].map(g => `
      <ion-list-header><ion-label>${g.title} (${g.rows.length})</ion-label></ion-list-header>
      <ion-list inset="true">${g.rows.map(e => `<ion-item><ion-label><h2>${shortDate(e.day)} · ${esc(label(e.slot))}</h2><p>${time(e.at)} · ${esc(e.dose)}</p></ion-label></ion-item>`).join('')}</ion-list>`).join('')
    || '<ion-list inset="true">' + empty('Sin tomas registradas.') + '</ion-list>'}`;
  recordModal.present();
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
  keepScroll($('#manager ion-content'), () => { renderPautas(); renderCosts(); renderIntervals(); renderPdfMonths(); });
}

$('#day').addEventListener('ionChange', renderToma);
$('#slot').addEventListener('ionChange', renderToma);
// La pauta de una fila de la toma: si ese día ya está tomada, como se tomó; si no, la pauta actual.
const rowMed = id => {
  const e = state.log.find(e => e.day === selectedDay() && e.slot === selectedSlot() && String(e.id) === id), m = state.meds.find(m => m.id === id);
  return e ? takenAs(e) : { ...m, dose: doseOn(m, selectedDay()) };
};
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
$('#open-record').onclick = openRecord;
$('#record-close').onclick = () => recordModal.dismiss();
$('#plan-list').addEventListener('click', e => {
  const i = e.target.closest('[data-plan]')?.dataset.plan;
  if (i) openPlan(i === 'new' ? null : Number(i));
});
$('#plan-cancel').onclick = () => planEditor.dismiss();
$('#plan-save').onclick = savePlan;
$('#plan-delete').onclick = () => { plan.splice(editingPlan, 1); renderPlan(); planEditor.dismiss(); };
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
