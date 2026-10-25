const KEY = 'dosify';
// Modelo:
// · moments: momentos de toma, en el orden guardado (no se reordenan): { id (aleatorio), name, start, end (horas),
//   visible, order: [ids de producto en el orden de tomas] }. Si no hay ninguno válido, los de DEFAULT_MOMENTS (para
//   tener más por defecto basta añadir otro allí) con ids nuevos.
// · products: productos, en el orden de productos: { id, name, notes (indicaciones), refs (referencias), memo (notas),
//   cost (€ por envase) y units (dosis por envase), enteros o vacíos, y plans: [pautas { dose (empieza por la
//   cantidad de cada toma), start, days, moments: [ids de los momentos en que se toma; al menos uno] }]. Sin
//   pautas, un producto no sale en la toma.
// · log: tomas: { at, day, id (del producto), moment (id de momento), name, dose, notes (el producto tal como se tomó) }
const DEFAULT_MOMENTS = [
  { name: 'Desayuno', start: 6, end: 12 },
  { name: 'Almuerzo', start: 12, end: 18 },
  { name: 'Cena', start: 18, end: 24 },
  { name: 'Demanda', start: '', end: '' },
];
// Todos los ids (momentos, productos) son aleatorios.
const newId = () => crypto.randomUUID().slice(0, 8);
const defaultMoments = () => DEFAULT_MOMENTS.map(d => ({ id: newId(), ...d, visible: true, order: [] }));
const momentIds = () => state.moments.map(mo => mo.id);
const TEXT = ['name', 'notes', 'refs', 'memo'];
const SEP = ';';
const DAYS = 7; // días anteriores que siempre se muestran
const DAYS_MAX = 30; // hasta cuántos días atrás se muestran los que tienen tomas
const LOG_MAX = 1000;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Texto plano con saltos de línea y enlaces (http, https o www.) pulsables, que se abren en otra pestaña.
const linkify = text => esc(text).replace(/\n/g, '<br>').replace(/(https?:\/\/|www\.)[^\s<]*[^\s<.,;:)]/g, url => `<a href="${url.startsWith('http') ? url : `https://${url}`}" target="_blank" rel="noopener">${url}</a>`);
const yes = v => ['1', 'yes', 'true', 'sí', 'si'].includes(String(v).trim().toLowerCase());
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
// Pautas válidas (dosis con número, fecha, duración y al menos un momento de los que existen), en orden de fecha de
// inicio y, a igual fecha, de duración; las incompletas se descartan.
const cleanPlans = (v, ids = momentIds()) => (Array.isArray(v) ? v : []).map(p => p && typeof p === 'object' ? { dose: p.dose, start: p.start, days: p.days, moments: ids.filter(id => list(p.moments).includes(id)) } : null)
  .filter(p => p && amount(p.dose) && date(p.start) && Number.isInteger(p.days) && p.days >= 1 && p.moments.length).sort((a, b) => a.start.localeCompare(b.start) || a.days - b.days);
function clean(raw) {
  const arr = v => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
  // Momentos: los guardados con id, en su orden (nombre, horas y visibilidad con valor por defecto si faltan); si no
  // queda ninguno, los de por defecto con ids nuevos.
  const saved = arr(raw?.moments).filter(mo => text(mo.id)).map(mo => ({ id: mo.id, name: text(mo.name), start: hour(mo.start) ?? '', end: hour(mo.end) ?? '',
    visible: typeof mo.visible === 'boolean' ? mo.visible : true, order: list(mo.order) }));
  const moments = saved.length ? saved : defaultMoments();
  const ids = moments.map(mo => mo.id);
  // Productos: sin nombre se descartan; sin id, uno nuevo; sus pautas, solo las válidas con momentos que existen.
  const products = arr(raw?.products).filter(m => text(m.name)).map(m => ({
    id: text(m.id) || newId(), name: m.name, notes: text(m.notes), refs: text(m.refs), memo: text(m.memo),
    cost: int(m.cost) ?? '', units: int(m.units, 1) ?? '', plans: cleanPlans(m.plans, ids),
  }));
  for (const mo of moments) mo.order = mo.order.filter(id => products.some(m => m.id === id));
  // Tomas: con día, momento existente y fecha válidos; las demás se descartan.
  const log = arr(raw?.log).filter(e => date(e.day) && ids.includes(e.moment) && !isNaN(new Date(e.at)))
    .map(e => ({ at: new Date(e.at).toISOString(), day: e.day, id: text(e.id) || null, moment: e.moment, name: text(e.name), dose: text(e.dose), notes: text(e.notes) }))
    .sort((a, b) => b.at.localeCompare(a.at));
  return { moments, products, log };
}
const stored = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();
const state = clean(stored);
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

// ---------- Momentos ----------

const momentOf = id => state.moments.find(mo => mo.id === id);
const productOf = id => state.products.find(m => m.id === id);
const visibleMoments = () => state.moments.filter(mo => mo.visible);
const hours = mo => mo.start !== '' && mo.end !== '' ? `${mo.start}–${mo.end} h` : mo.start !== '' ? `desde las ${mo.start} h` : mo.end !== '' ? `hasta las ${mo.end} h` : '';
const label = id => { const mo = momentOf(id); return mo.name || hours(mo) || 'Sin nombre'; };
// ¿La hora h cae en el momento? Admite momentos que pasan de medianoche (p. ej. 22–6).
const within = (mo, h) => mo.start === '' || mo.end === '' ? false : mo.start <= mo.end ? h >= mo.start && h < mo.end : h >= mo.start || h < mo.end;
// De una lista de momentos, el de ahora: el que incluye la hora actual; si ninguno, el próximo en empezar; si no
// tienen horas, el primero.
function momentNow(list = visibleMoments()) {
  const h = new Date().getHours();
  const next = list.filter(mo => mo.start !== '').sort((a, b) => (a.start - h + 24) % 24 - (b.start - h + 24) % 24)[0];
  return (list.find(mo => within(mo, h)) ?? next ?? list[0])?.id ?? '';
}
const selectedMoment = () => $('#moment').value;

const addDays = (key, n) => { const d = fromKey(key); d.setDate(d.getDate() + n); return dayKey(d); };
const selectedDay = () => $('#day').value || today();
// Orden de tomas de un momento: su lista «order»; los productos que no están en ella van detrás, en el orden de productos.
const pos = (m, moment) => { const i = momentOf(moment).order.indexOf(m.id); return i < 0 ? Infinity : i; };
const byMoment = (products, moment) => [...products].sort((a, b) => pos(a, moment) - pos(b, moment));
// Pauta de un día: la última que empezó ese día o antes (una fecha de inicio posterior corta a la anterior),
// si su duración llega a ese día. Un producto solo sale en la toma los días que cubre alguna pauta, en sus momentos
// y con su dosis; sin pautas, no sale.
const planEnd = p => addDays(p.start, p.days - 1);
const planOn = (m, day) => { const p = m.plans.filter(p => p.start <= day).at(-1); return p && day <= planEnd(p) ? p : null; };
const onDay = (m, day) => !!planOn(m, day);
const doseOn = (m, day) => planOn(m, day)?.dose ?? '';
// Momentos que valen un día: los de la pauta de ese día (o, si ninguna vale, los de la última); sin
// pautas, ninguno.
const momentsOn = (m, day) => (planOn(m, day) ?? m.plans.at(-1))?.moments ?? [];
const doses = (moment, day = selectedDay()) => byMoment(state.products.filter(m => momentsOn(m, day).includes(moment) && onDay(m, day)).map(m => ({ ...m, dose: doseOn(m, day) })), moment);
// Cada toma guarda nombre, dosis e indicaciones del producto al tomarla; así el registro muestra lo que se tomó aunque
// el producto cambie o se borre.
const SNAP = ['name', 'dose', 'notes'];
const EDITED = ['name', 'notes']; // lo que el editor de producto cambia de lo que guarda cada toma
const snap = m => Object.fromEntries(SNAP.map(k => [k, m[k]]));
const snapOn = (m, day) => ({ ...snap(m), dose: doseOn(m, day) }); // el producto tal como se toma ese día
const takenAs = e => ({ id: e.id, ...snap(e) });
// Filas de un día y momento: pendientes (productos vigentes sin toma) y tomadas (sus tomas, también las de productos que ya
// no están en el momento o se borraron).
function dayRows(moment, day) {
  const entries = state.log.filter(e => e.day === day && e.moment === moment);
  const pending = doses(moment, day).filter(m => !entries.some(e => e.id === m.id));
  return { pending, taken: entries.map(e => ({ ...takenAs(e), entry: e })) };
}

// ---------- Toma ----------

// Marcar una toma la añade al registro con el producto tal como está ese día; desmarcarla la quita.
function toggle(id, moment, checked) {
  const day = selectedDay();
  if (checked) {
    state.log.unshift({ at: new Date().toISOString(), day, id, moment, ...snapOn(productOf(id), day) });
    state.log.length = Math.min(state.log.length, LOG_MAX);
  } else {
    state.log = state.log.filter(e => !(e.day === day && String(e.id) === id && e.moment === moment));
  }
  save();
  render();
}

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
    const rows = visibleMoments().map(mo => dayRows(mo.id, key));
    const done = rows.reduce((n, r) => n + r.taken.length, 0), total = rows.reduce((n, r) => n + r.taken.length + r.pending.length, 0);
    return `
      <ion-segment-button value="${key}" layout="icon-bottom">
        ${ring(done, total, `${done}/${total}`)}
        <ion-label>${d.toLocaleDateString('es', { weekday: 'narrow' })} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}</ion-label>
      </ion-segment-button>`;
  }).join('');
}

let momentTabsHtml = '';
// Pestañas de la toma: solo los momentos visibles con algo ese día (algún producto pendiente o toma hecha). Si el
// seleccionado deja de estar, pasa al de ahora entre los que quedan.
const dayMoments = day => visibleMoments().filter(mo => { const r = dayRows(mo.id, day); return r.pending.length || r.taken.length; });
function renderMomentTabs() {
  const moments = dayMoments(selectedDay());
  const html = moments.map(mo => `<ion-segment-button value="${mo.id}"><ion-label>${esc(label(mo.id))}</ion-label></ion-segment-button>`).join('');
  if (html !== momentTabsHtml) $('#moment').innerHTML = momentTabsHtml = html;
  if (!moments.some(mo => mo.id === $('#moment').value)) $('#moment').value = momentNow(moments);
}

// Texto de un producto: nombre (medio), dosis (texto principal) e indicaciones (gris, recortadas a unas dos líneas).
const brief = text => { const t = text.split('\n').slice(0, 2).join(' '); return t.length > 80 ? `${t.slice(0, 80).trimEnd()}…` : t; };
const doseLine = text => text ? `<p><ion-text color="dark">${esc(text)}</ion-text></p>` : '';
const notesLine = m => m.notes ? `<p>${esc(brief(m.notes))}</p>` : '';

// El (i) de una fila abre la ficha del producto (solo lectura); su color avisa del fin del envase, o es gris si el
// producto se borró.
const viewButton = id => `
      <ion-button slot="end" fill="clear" data-view="${id}" aria-label="Ver producto">
        <ion-icon slot="icon-only" name="information-circle" color="${productOf(id) ? supplyColor(id) : 'medium'}" size="large"></ion-icon>
      </ion-button>`;
// Fila de una toma. Si ya está tomada, muestra la hora junto a la dosis; al ordenar, el (i) deja sitio al asa.
const doseItem = (m, moment, entry, sorting) => `
    <ion-item data-id="${m.id}">
      <ion-checkbox slot="start" aria-label="${esc(m.name)}" data-id="${m.id}" data-moment="${moment}" ${entry ? 'checked' : ''} ${sorting ? 'disabled' : ''}></ion-checkbox>
      <ion-label class="ion-text-wrap">
        <h2 class="medium">${esc(m.name)}</h2>
        ${doseLine([entry && time(entry.at), m.dose].filter(Boolean).join(' · '))}
        ${notesLine(m)}
      </ion-label>
      ${sorting ? '<ion-reorder slot="end"></ion-reorder>' : viewButton(m.id)}
    </ion-item>`;
// Cada toma va en su propia lista inset: filas independientes.
const doseRow = (m, moment, entry) => `<ion-list inset="true">${doseItem(m, moment, entry)}</ion-list>`;

// Botón de la cabecera de una sección (Pendiente, Tomas).
const headerButton = (id, icon, label) => `<ion-button id="${id}" fill="clear" aria-label="${label}"><ion-icon slot="icon-only" name="${icon}"></ion-icon></ion-button>`;

// «Pendiente»: su botón activa el modo ordenar; el orden que se fije vale para ese momento en cualquier día.
let sortingPending = false;

// «Tomas»: su botón abre un action sheet para elegir el orden; el icono muestra el elegido.
// No se guarda: al abrir la app siempre empieza en el orden de tomas.
const ORDERS = {
  tomas: { icon: 'reorder-three-outline', label: 'Orden de tomas' },
  recent: { icon: 'arrow-up-outline', label: 'Más reciente arriba' },
  oldest: { icon: 'arrow-down-outline', label: 'Más reciente abajo' },
  productos: { icon: 'list-outline', label: 'Orden de productos' },
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
// Posición en el orden de productos; las tomas de productos borrados van al final.
const productIndex = id => { const i = state.products.findIndex(m => m.id === id); return i < 0 ? Infinity : i; };
const byProducts = (a, b) => (productIndex(a.id) - productIndex(b.id)) || 0;
const sortTaken = (rows, moment) => [...rows].sort(
  order === 'tomas' ? (a, b) => (pos(a, moment) - pos(b, moment)) || byProducts(a, b)
  : order === 'productos' ? byProducts
  : (a, b) => a.entry.at.localeCompare(b.entry.at) * (order === 'oldest' ? 1 : -1));

// Mueve un elemento de la posición «from» a «to» (detalle de ionReorderEnd; «to» falta si no se movió).
const move = (list, { from, to = from }) => { const l = [...list]; l.splice(to, 0, ...l.splice(from, 1)); return l; };

// Ordenar «Pendiente» mueve esos productos entre los huecos que ocupan en el momento (las ya tomadas no se mueven)
// y guarda el orden completo del momento.
function reorderPending(moment, moved) {
  const all = byMoment(state.products.filter(m => momentsOn(m, selectedDay()).includes(moment)), moment);
  const ids = new Set(moved.map(m => m.id));
  let i = 0;
  momentOf(moment).order = all.map(m => ids.has(m.id) ? moved[i++].id : m.id);
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
  const moment = selectedMoment();
  if (!moment) { $('#toma').innerHTML = emptyList(visibleMoments().length ? 'Nada que tomar este día.' : 'No hay momentos visibles. Actívalos en Productos › Momentos.'); return; }
  const { pending, taken: takenRows } = dayRows(moment, day);
  const taken = sortTaken(takenRows, moment);
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
      ? `<ion-list inset="true"><ion-reorder-group id="pending-list" disabled="false">${pending.map(m => doseItem(m, moment, null, true)).join('')}</ion-reorder-group></ion-list>`
      : pending.map(m => doseRow(m, moment)).join('')}
    <ion-list-header>
      <ion-label>Tomas</ion-label>
      ${headerButton('toma-sort', ORDERS[order].icon, ORDERS[order].label)}
    </ion-list-header>
    ${taken.map(m => doseRow(m, moment, m.entry)).join('') || emptyList('Sin tomas.')}`; });
}

// ---------- Productos ----------

const manager = $('#manager');
// Un producto está inactivo si no tiene pauta vigente ni futura (también si no tiene ninguna): va en la lista
// de inactivos, en gris, sin costes.
const inactive = m => !planOn(m, today()) && !m.plans.some(p => p.start > today());
// Línea de la pauta en la lista: la dosis y los momentos visibles, separados por puntos («1 cápsula ·
// Desayuno · Almuerzo»), de la pauta de hoy (o de la última); sin pautas, «Sin pauta».
const planText = m => { const p = planOn(m, today()) ?? m.plans.at(-1); return p ? [p.dose, ...p.moments.filter(id => momentOf(id).visible).map(label)].map(esc).join(' · ') : 'Sin pauta'; };

// Fila de un producto: nombre (con el fin del envase a la derecha), la pauta de hoy (dosis y momentos), las
// indicaciones en gris y los costes.
const productRow = m => inactive(m) ? `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap" color="medium">
      <h2 class="medium">${esc(m.name)}</h2>
      <p>${planText(m)}</p>
      ${notesLine(m)}
    </ion-label>
    <ion-reorder slot="end"></ion-reorder>
  </ion-item>` : `
  <ion-item button="true" detail="false" data-id="${m.id}">
    <ion-label class="ion-text-wrap">
      ${endNote(m.id)}
      <h2 class="medium">${esc(m.name)}</h2>
      <p><ion-text color="dark">${planText(m)}</ion-text></p>
      ${notesLine(m)}
      ${costLine(m) ? `<p><ion-text color="teal" class="medium">${costLine(m)}</ion-text></p>` : ''}
    </ion-label>
    <ion-reorder slot="end"></ion-reorder>
  </ion-item>`;

// Costes y envase. Las dosis al día son la cantidad de la dosis de hoy (la de su pauta, si la hay) por cada
// momento visible del producto.
const perDayUnits = m => amount(doseOn(m, today())) * momentsOn(m, today()).filter(id => momentOf(id).visible).length;
const perDay = m => m.cost / m.units * perDayUnits(m);
const monthDays = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
const euros = (n, digits = 2) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });
const per = (n, unit) => `${euros(n, Number.isInteger(n) ? 0 : 2).replace(/\s*€/, '')} €/${unit}`;
// Hasta cuándo dura el envase actual. Se suman todas las dosis registradas del producto y, cada vez que completan un
// envase, se empieza otro: lo que queda del actual es el resto. Se descuentan las que faltan hoy y se reparte lo que
// queda entre las dosis al día (las de la pauta vigente). Si el envase no llega a cubrir hoy, se acaba hoy.
function runsOut(m) {
  const daily = perDayUnits(m);
  if (!m.units || !daily) return '';
  const taken = state.log.filter(e => e.id === m.id);
  const sum = list => list.reduce((n, e) => n + amount(e.dose), 0);
  const pendingToday = Math.max(0, daily - sum(taken.filter(e => e.day === today())));
  const left = m.units - sum(taken) % m.units - pendingToday;
  return addDays(today(), left < 0 ? 0 : Math.floor(left / daily));
}
const dayMonth = key => `${Number(key.slice(8))}/${key.slice(5, 7)}`; // «5/01», sin año
const dayMonthYear = key => key.slice(0, 4) === today().slice(0, 4) ? dayMonth(key) : `${dayMonth(key)}/${key.slice(0, 4)}`; // con año solo si no es el actual
// Aviso de que el envase se acaba: menos de 7 días. Pone en rosa el (i) de la toma y la fecha de fin del producto.
const daysLeft = end => Math.round((fromKey(end) - fromKey(today())) / 864e5);
const runningOut = m => { const end = runsOut(m); return !!end && daysLeft(end) < 7; };
const supplyColor = id => { const m = productOf(id); return m && runningOut(m) ? 'rose' : 'teal'; };
// Fin del envase («5/01») a la derecha de la fila del producto, a la altura del nombre: en gris; si se acaba, en rosa y peso medio.
const endNote = id => {
  const m = productOf(id), end = m && runsOut(m);
  if (!end) return '';
  return `<ion-note ${runningOut(m) ? 'class="ion-float-right medium" color="rose"' : 'class="ion-float-right"'}>${dayMonth(end)}</ion-note>`;
};
// Línea de costes de la fila de un producto: «30 €/ud · 15 €/mes · 1 €/día», con lo que se pueda calcular.
function costLine(m) {
  const parts = [];
  if (m.cost !== '') parts.push(per(m.cost, 'ud'));
  if (m.cost !== '' && m.units && perDayUnits(m)) parts.push(per(perDay(m) * monthDays(), 'mes'), per(perDay(m), 'día'));
  return parts.join(' · ');
}
// Próximas compras: los envases que se acaban en los próximos SHOP_DAYS días, del más urgente al menos.
const SHOP_DAYS = 14;
const shopping = () => state.products.filter(m => !inactive(m)).map(m => ({ m, end: runsOut(m) })).filter(x => x.end && daysLeft(x.end) <= SHOP_DAYS).sort((a, b) => a.end.localeCompare(b.end));
const inDays = n => n <= 0 ? 'Se acaba hoy' : n === 1 ? 'Queda 1 día' : `Quedan ${n} días`;

function renderCosts() {
  const products = state.products.filter(m => !inactive(m)), priced = products.filter(m => m.cost !== ''), full = priced.filter(m => m.units !== '');
  const row = (title, text, extra = '', icon = '') => `<ion-item${extra}>${icon}<ion-label><h2 class="medium">${title}</h2><p>${text}</p></ion-label></ion-item>`;
  const daily = full.reduce((sum, m) => sum + perDay(m), 0), shop = shopping();
  // Costes del conjunto: total de los envases y, con las dosis por envase, al día y al mes (los días del mes actual);
  // al final, la fila de próximas compras (sale aunque no haya costes si algo se acaba).
  $('#costs').innerHTML = priced.length || shop.length ? `
    <ion-list-header><ion-label>Costes</ion-label></ion-list-header>
    <ion-list inset="true">
      ${priced.length ? row(`${euros(priced.reduce((sum, m) => sum + m.cost, 0), 0)} en total`, `${priced.length} de ${products.length} productos con coste`)
      + row(`${euros(daily * monthDays())} al mes`, `${euros(daily)} al día · ${full.length} de ${products.length} productos con coste y dosis por envase`) : ''}
      ${row('Próximas compras', shop.length ? `${shop.length} ${shop.length === 1 ? 'producto se acaba' : 'productos se acaban'} en ${SHOP_DAYS} días` : `Nada se acaba en ${SHOP_DAYS} días`, ' button="true" id="open-shopping"',
        `<ion-icon slot="start" name="cart-outline" color="${shop.length ? 'primary' : 'medium'}"></ion-icon>`)}
    </ion-list>` : '';
}

// Lista de próximas compras: nombre, precio si lo tiene, días que quedan, fecha prevista y el (i) con la ficha del
// producto (como en la toma); al final, el total.
const shoppingModal = $('#shopping');
function openShopping() {
  const shop = shopping(), priced = shop.filter(x => x.m.cost !== '');
  $('#shopping-body').innerHTML = shop.length ? `
    <ion-list inset="true">
      ${shop.map(({ m, end }) => `
      <ion-item>
        <ion-label>
          <h2 class="medium">${esc(m.name)}</h2>
          <p><ion-text ${runningOut(m) ? 'color="rose"' : ''}>${inDays(daysLeft(end))} · ${shortDate(end)}</ion-text></p>
        </ion-label>
        ${m.cost !== '' ? `<ion-note slot="end">${euros(m.cost, 0)}</ion-note>` : ''}${viewButton(m.id)}
      </ion-item>`).join('')}
    </ion-list>
    ${priced.length ? `<ion-list inset="true"><ion-item lines="none"><ion-label><h2 class="medium">Total</h2><p>${priced.length} de ${shop.length} con precio</p></ion-label><ion-note slot="end">${euros(priced.reduce((sum, x) => sum + x.m.cost, 0), 0)}</ion-note></ion-item></ion-list>` : ''}`
    : `<ion-list inset="true">${empty(`Nada se acaba en los próximos ${SHOP_DAYS} días.`)}</ion-list>`;
  shoppingModal.present();
}

// Lista de productos: solo los activos; los inactivos van aparte, en la fila «Inactivos» (solo si hay alguno), que
// abre su propia lista. Desde allí se editan y, con una pauta nueva, vuelven a los activos.
const inactiveModal = $('#inactive');
function renderProducts() {
  const live = state.products.filter(m => !inactive(m)), off = state.products.filter(inactive);
  $('#list-count').textContent = live.length;
  $('#list').innerHTML = live.map(productRow).join('') || empty('Sin productos. Pulsa «Añadir» para crear uno.');
  $('#inactive-row').classList.toggle('ion-hide', !off.length);
  $('#inactive-count').textContent = off.length;
  $('#inactive-list').innerHTML = off.map(productRow).join('').replaceAll('<ion-reorder slot="end"></ion-reorder>', '') || empty('No hay productos inactivos.');
}

// Momentos: casilla de visible a la izquierda; tocar la fila abre su editor.
const momentRow = mo => `
  <ion-item detail="false" data-moment="${mo.id}">
    <ion-checkbox slot="start" aria-label="Visible" data-moment="${mo.id}" ${mo.visible ? 'checked' : ''}></ion-checkbox>
    <ion-label ${mo.visible ? '' : 'color="medium"'}>
      <h2 class="medium">${esc(label(mo.id))}</h2>
      <p>${hours(mo) || 'Sin horas'}</p>
    </ion-label>
  </ion-item>`;

const renderMomentRows = () => { $('#moments').innerHTML = state.moments.map(momentRow).join(''); };

function ask(header, handler) {
  const alert = $('#confirm');
  alert.header = header;
  alert.message = '';
  alert.buttons = [{ text: 'Cancelar', role: 'cancel' }, { text: 'Aceptar', role: 'destructive', handler }];
  alert.present();
}

// ---------- CSV ----------

const cell = v => typeof v === 'boolean' ? String(v) : v;
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

// Un solo CSV con columnas compartidas, con los nombres de los campos de los datos; cada tipo de fila usa las suyas:
// · moment: id, name, start y end (horas), visible (true/false) y order (ids de producto separados por espacios), en su orden.
// · product: id, name, notes, refs, memo, cost (€ por envase) y units (dosis por envase). En el orden de productos, cada
//   uno seguido de sus filas «plan»: id del producto, dose, start (fecha de inicio), days (duración) y moments (ids
//   separados por espacios).
// · intake: id del producto, moment (el de la toma), at («AAAA-MM-DD HH:MM», hora local) y el producto como se tomó: name, dose y notes.
// Cada columna es un campo de los datos con el mismo nombre; «day» de la toma va dentro de «at».
const HEAD = ['type', 'id', 'name', 'notes', 'refs', 'memo', 'cost', 'units', 'dose', 'start', 'end', 'days', 'moments', 'moment', 'visible', 'order', 'at'];
const csvRow = (type, o) => HEAD.map(h => h === 'type' ? type : o[h] ?? '');

const exportCSV = () => csv([
  HEAD,
  ...state.moments.map(mo => csvRow('moment', { id: mo.id, name: mo.name, start: mo.start, end: mo.end, visible: mo.visible, order: mo.order.join(' ') })),
  ...state.products.flatMap(m => [csvRow('product', { id: m.id, name: m.name, notes: m.notes, refs: m.refs, memo: m.memo, cost: m.cost, units: m.units }),
    ...m.plans.map(p => csvRow('plan', { id: m.id, dose: p.dose, start: p.start, days: p.days, moments: p.moments.join(' ') }))]),
  ...[...state.log].sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at))
    .map(e => csvRow('intake', { id: e.id ?? '', name: e.name, dose: e.dose, notes: e.notes, moment: e.moment, at: `${e.day} ${time(e.at)}` })),
]);

// Lee las filas a objetos y los limpia con clean(), como los datos guardados.
async function importCSV(file) {
  const rows = parseCSV(await file.text());
  const head = rows.shift()?.map(h => h.toLowerCase()) ?? [];
  const raw = { moments: [], products: [], log: [] };
  const words = v => v.split(/\s+/).filter(Boolean);
  for (const r of rows) {
    const c = Object.fromEntries(HEAD.map(h => [h, r[head.indexOf(h)] ?? '']));
    if (c.type === 'moment') raw.moments.push({ id: c.id, name: c.name, start: c.start, end: c.end, visible: c.visible === '' ? true : yes(c.visible), order: words(c.order) });
    if (c.type === 'product') raw.products.push({ id: c.id, name: c.name, notes: c.notes, refs: c.refs, memo: c.memo, cost: c.cost, units: c.units, plans: [] });
    if (c.type === 'plan') raw.products.find(m => m.id === c.id)?.plans.push({ dose: c.dose, start: c.start, days: int(c.days, 1), moments: words(c.moments) });
    if (c.type === 'intake') { const [day, hhmm = '00:00'] = c.at.split(' '); raw.log.push({ at: `${day}T${hhmm}`, day, id: c.id, moment: c.moment, name: c.name, dose: c.dose, notes: c.notes }); }
  }
  if (!raw.moments.length && !raw.products.length && !raw.log.length) return;
  const apply = () => { Object.assign(state, clean(raw)); save(); render(); };
  ask('¿Reemplazar los momentos, los productos y las tomas actuales?', apply);
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

// Tomas del mes por fecha y hora: fecha, hora, y el producto tal como se tomó: nombre, dosis y, en notas, indicaciones.
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

// Al cerrar un editor (guardar o cancelar), la lista de Productos vuelve a la posición en que estaba al abrirlo.
let managerY = 0;
const managerScroller = () => $('#manager ion-content').getScrollElement();
const rememberScroll = async () => { managerY = (await managerScroller()).scrollTop; };
const restoreScroll = async () => { const sc = await managerScroller(); sc.scrollTop = managerY; requestAnimationFrame(() => { sc.scrollTop = managerY; }); };

const editor = $('#editor');
const field = name => $(`[name="${name}"]`, editor);
let editing = null;

function openEditor(product = {}) {
  editing = product.id ?? null;
  TEXT.forEach(f => field(f).value = product[f] ?? '');
  for (const f of ['cost', 'units']) { field(f).value = product[f] ?? ''; field(f).classList.remove('ion-invalid', 'ion-touched'); }
  plans = structuredClone(product.plans ?? []);
  renderPlans();
  for (const id of ['#delete', '#delete-header']) $(id).classList.toggle('ion-hide', !editing);
  $('#record-section').classList.toggle('ion-hide', !editing);
  $('#record-count').textContent = editing ? `${state.log.filter(e => e.id === editing).length} tomas` : '';
  rememberScroll();
  editor.present();
}

function saveEditor() {
  const old = state.products.find(m => m.id === editing);
  const product = Object.fromEntries(TEXT.map(f => [f, String(field(f).value ?? '').trim()]));
  if (!product.name) return field('name').setFocus();
  // Coste y dosis por envase: enteros (las dosis, al menos 1) o vacíos; un valor no válido se marca en rojo.
  product.cost = int(field('cost').value); product.units = int(field('units').value, 1);
  for (const f of ['cost', 'units']) field(f).classList.toggle('ion-invalid', product[f] === null);
  const bad = ['cost', 'units'].find(f => product[f] === null);
  if (bad) return field(bad).classList.add('ion-touched'), field(bad).setFocus();
  product.plans = cleanPlans(plans);
  const done = () => { save(); render(); editor.dismiss(); };
  if (!old) return state.products.push({ id: newId(), ...product }), done();
  // Cambiar el producto: las tomas de hoy en adelante pasan a mostrarlo nuevo; si cambia lo que se ve en el registro
  // (nombre, indicaciones) y hay tomas anteriores, se elige si también se cambian esas. La dosis va en la pauta.
  const apply = all => {
    Object.assign(old, product);
    for (const e of state.log) if (e.id === old.id && (all || e.day >= today())) Object.assign(e, snapOn(old, e.day));
    done();
  };
  const changed = EDITED.some(k => product[k] !== old[k]);
  if (!changed || !state.log.some(e => e.id === old.id && e.day < today())) return apply(false);
  sheet('¿A qué se aplican los cambios?', [
    { text: 'Aplicar a partir de hoy', handler: () => apply(false) },
    { text: 'Aplicar a todo el registro', handler: () => apply(true) },
  ]);
}

// ---------- Pautas (dentro del editor de producto) ----------

// Se editan sobre una copia («plans») que se guarda con el producto; «Cancelar» en el producto las descarta.
let plans = [], editingPlan = null;
const planEditor = $('#plan-editor');
const planField = name => $(`[name="${name}"]`, planEditor);
const shortDate = key => fromKey(key).toLocaleDateString('es');

// Hasta qué día vale una pauta: su último día o, si la siguiente empieza antes, la víspera de esta.
const planUntil = (all, p) => { const next = all.find(q => q.start > p.start); return next && next.start <= planEnd(p) ? addDays(next.start, -1) : planEnd(p); };

// Fechas, duración y momentos de una pauta («24/10/2026 – 22/11/2026 · 30 días · Desayuno, Cena»).
const planLine = (all, p) => `${shortDate(p.start)} – ${shortDate(planUntil(all, p))} · ${p.days} ${p.days === 1 ? 'día' : 'días'} · ${p.moments.map(label).join(', ') || 'sin momentos'}`;
// Momentos de una pauta: una casilla por momento visible, con sus horas de subtítulo; los ocultos conservan su valor.
const momentBoxes = moments => visibleMoments().map(mo => `<ion-item><ion-checkbox name="moment-${mo.id}" ${moments.includes(mo.id) ? 'checked' : ''}><ion-label><h2>${esc(label(mo.id))}</h2><p>${hours(mo) || 'Sin horas'}</p></ion-label></ion-checkbox></ion-item>`).join('') || empty('No hay momentos visibles.');
const readMoments = old => momentIds().filter(id => momentOf(id).visible ? planField(`moment-${id}`).checked : old.includes(id));
function renderPlans() {
  plans = cleanPlans(plans);
  $('#plan-list').innerHTML = plans.map((p, i) => `<ion-item button="true" data-plan="${i}"><ion-label><h2>${esc(p.dose)}</h2><p>${esc(planLine(plans, p))}</p></ion-label></ion-item>`).join('')
    + `<ion-item button="true" detail="false" data-plan="new"><ion-icon slot="start" name="add-outline" color="primary"></ion-icon><ion-label color="primary">Añadir pauta</ion-label></ion-item>`;
}

// Una pauta nueva propone la dosis y los momentos de la última y hoy.
function openPlan(i) {
  editingPlan = i;
  const p = plans[i] ?? { dose: plans.at(-1)?.dose ?? '', start: today(), days: '', moments: plans.at(-1)?.moments ?? [] };
  for (const f of ['dose', 'start', 'days']) { planField(f).value = p[f]; planField(f).classList.remove('ion-invalid', 'ion-touched'); }
  $('#plan-moments').innerHTML = momentBoxes(p.moments);
  $('#plan-moments-error').classList.add('ion-hide');
  $('#plan-delete').classList.toggle('ion-hide', i === null);
  planEditor.present();
}

// Dosis que empiece por un número, fecha de inicio, duración de al menos 1 día y al menos un momento; si falta
// algo, se marca en rojo.
function savePlan() {
  const p = { dose: String(planField('dose').value ?? '').trim(), start: date(planField('start').value ?? ''), days: int(planField('days').value, 1), moments: readMoments(plans[editingPlan]?.moments ?? []) };
  const bad = [['dose', amount(p.dose)], ['start', p.start], ['days', p.days]].filter(([, ok]) => !ok).map(([f]) => f);
  for (const f of ['dose', 'start', 'days']) planField(f).classList.toggle('ion-invalid', bad.includes(f));
  $('#plan-moments-error').classList.toggle('ion-hide', p.moments.length > 0);
  if (bad.length) return bad.forEach(f => planField(f).classList.add('ion-touched')), planField(bad[0]).setFocus();
  if (!p.moments.length) return;
  if (editingPlan === null) plans.push(p); else plans[editingPlan] = p;
  renderPlans();
  planEditor.dismiss();
}

// ---------- Registro de un producto ----------

// Todas las tomas del producto: resumen (desde cuándo, cuántas, dosis y coste estimado) y, debajo, agrupadas por la
// pauta que valía cada día (de la más reciente a la más antigua; las que no tenían, en «Sin pauta»).
const recordModal = $('#record');
function openRecord(id) {
  const taken = state.log.filter(e => e.id === id).sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at));
  const m = productOf(id) ?? { name: taken[0]?.name ?? '', plans: [], cost: '', units: '' }; // producto borrado: solo sus tomas
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
    if (!groups.has(key)) groups.set(key, { title: p ? `${dayMonthYear(p.start)} · ${esc(p.dose)}` : 'Sin pauta', rows: [] });
    groups.get(key).rows.push(e);
  }
  $('#record-title').textContent = m.name;
  $('#record-body').innerHTML = `
    <ion-list inset="true">${summary.map(([k, v]) => item(k, v)).join('')}</ion-list>
    ${[...groups.values()].map(g => `
      <ion-list-header><ion-label>${g.title} (${g.rows.length})</ion-label></ion-list-header>
      <ion-list inset="true">${g.rows.map(e => `<ion-item><ion-label><h2>${dayMonthYear(e.day)} · ${esc(e.dose)}</h2><p>${time(e.at).replace(/^0/, '')} · ${esc(label(e.moment))}</p></ion-label></ion-item>`).join('')}</ion-list>`).join('')
    || '<ion-list inset="true">' + empty('Sin tomas registradas.') + '</ion-list>'}`;
  recordModal.present();
}

// ---------- Ficha del producto ----------

// Solo lectura, espejo del editor, exista el producto o no: Producto, Pautas (con los momentos de cada una),
// Otros datos y Registro; desde una toma ya hecha, además la sección Toma (día, hora, momento y dosis tal como se
// tomó). De un producto borrado se muestra lo que guarda la toma (nombre, indicaciones y la toma) y «—» en el resto.
// «Editar», solo si el producto existe, cierra la ficha y abre el editor.
const viewModal = $('#view');
let viewing = null;
const readRow = (name, value, links) => `<ion-item><ion-label class="ion-text-wrap"><p>${name}</p><h2>${(links ? linkify(value ?? '') : esc(value ?? '').replace(/\n/g, '<br>')) || '—'}</h2></ion-label></ion-item>`;
const readSection = (title, rows) => `<ion-list-header><ion-label>${title}</ion-label></ion-list-header><ion-list inset="true">${rows}</ion-list>`;
const longDate = key => fromKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function openView(id, entry) {
  const m = productOf(id), p = m ?? { name: entry.name, notes: entry.notes, refs: '', memo: '', cost: '', units: '', plans: [] };
  viewing = id;
  $('#view-title').textContent = p.name;
  $('#view-edit').classList.toggle('ion-hide', !m);
  $('#view-body').innerHTML = readSection('Producto', readRow('Nombre', p.name) + readRow('Indicaciones', p.notes))
    + readSection('Pautas', p.plans.map(x => `<ion-item><ion-label class="ion-text-wrap"><h2>${esc(x.dose)}</h2><p>${esc(planLine(p.plans, x))}</p></ion-label></ion-item>`).join('') || empty(m ? 'Sin pautas.' : '—'))
    + readSection('Otros datos', readRow('Referencias', p.refs, true) + readRow('Notas', p.memo, true))
    + `<ion-list inset="true">${readRow('Coste del envase', p.cost === '' ? '' : euros(p.cost, 0))}${readRow('Dosis por envase', p.units === '' ? '' : p.units.toLocaleString('es'))}</ion-list>`
    + (entry ? readSection('Toma', readRow('Día', longDate(entry.day)) + readRow('Hora', time(entry.at)) + readRow('Momento', label(entry.moment)) + readRow('Dosis', entry.dose)) : '')
    + readSection('Registro', `<ion-item button="true" id="view-record"><ion-label>Ver registro</ion-label><ion-note slot="end">${state.log.filter(e => e.id === id).length} tomas</ion-note></ion-item>`)
    + (m ? '' : `<ion-list inset="true">${empty('El producto se borró: se muestra lo que guarda la toma.')}</ion-list>`);
  viewModal.present();
}

// ---------- Editor de momento ----------

const momentEditor = $('#moment-editor');
const momentField = name => $(`[name="${name}"]`, momentEditor);
let editingMoment = null;

function openMomentEditor(id) {
  editingMoment = id;
  const mo = momentOf(id);
  momentField('name').value = mo.name;
  for (const f of ['start', 'end']) { momentField(f).value = mo[f]; momentField(f).classList.remove('ion-invalid', 'ion-touched'); }
  rememberScroll();
  momentEditor.present();
}

// Las horas son opcionales; si se ponen, enteras de 0 a 24. Una hora no válida se marca en rojo (Ionic) y recibe el foco.
function saveMomentEditor() {
  const [start, end] = ['start', 'end'].map(f => hour(momentField(f).value));
  for (const [f, v] of [['start', start], ['end', end]]) momentField(f).classList.toggle('ion-invalid', v === null);
  const bad = ['start', 'end'].find((f, i) => [start, end][i] === null);
  if (bad) return ['start', 'end'].forEach(f => momentField(f).classList.add('ion-touched')), momentField(bad).setFocus();
  Object.assign(momentOf(editingMoment), { name: String(momentField('name').value ?? '').trim(), start, end });
  save();
  render();
  momentEditor.dismiss();
}

// ---------- Asistente ----------

// Conversación con un modelo compatible con OpenAI (POST {url}/chat/completions). La configuración (URL base, API key y
// modelo) se guarda aparte de los datos, solo en este navegador, y no va en el CSV. En cada petición el asistente recibe
// todos los datos de la app; puede cambiarlos con herramientas, y cada cambio pide confirmación antes de aplicarse.
const AI_KEY = 'dosify-asistente';
// Sin valores por defecto: hasta rellenar los tres campos, el asistente no se puede usar.
const AI_FIELDS = ['url', 'key', 'model'];
const ai = (() => { let v = {}; try { v = JSON.parse(localStorage.getItem(AI_KEY)) ?? {}; } catch {} return Object.fromEntries(AI_FIELDS.map(k => [k, text(v[k]).trim()])); })();
const aiField = name => $(`#assistant-settings [name="${name}"]`);
// Se guarda al escribir (no solo al salir del campo, que en iOS puede no ocurrir al cerrar Productos) y los campos se
// rellenan con lo guardado cada vez que se abre Productos.
const showAi = () => AI_FIELDS.forEach(k => { aiField(k).value = ai[k]; });
for (const k of AI_FIELDS) aiField(k).addEventListener('ionInput', () => { ai[k] = String(aiField(k).value ?? '').trim(); localStorage.setItem(AI_KEY, JSON.stringify(ai)); });
showAi();
manager.addEventListener('ionModalWillPresent', showAi);

const chatModal = $('#chat'), chatBody = $('#chat-body'), chatInput = $('#chat-input');
// La conversación se guarda (aparte de los datos y fuera del CSV) hasta pulsar «Limpiar».
const CHAT_KEY = 'dosify-conversacion';
let { chat = [], chatView = [] } = (() => { try { const v = JSON.parse(localStorage.getItem(CHAT_KEY)); return Array.isArray(v?.chat) && Array.isArray(v?.chatView) ? v : {}; } catch { return {}; } })();
let chatBusy = false;
const saveChat = () => localStorage.setItem(CHAT_KEY, JSON.stringify({ chat, chatView }));

// Lo que sabe el asistente: qué es la app, cómo son los datos, cálculos ya hechos por producto y todos los datos en JSON.
function systemPrompt() {
  const now = new Date();
  const summary = state.products.map(m => ({ id: m.id, nombre: m.name, dosis_hoy: doseOn(m, today()), inactivo: inactive(m),
    tomas_hoy: onDay(m, today()) ? Object.fromEntries(momentsOn(m, today()).map(id => [id, state.log.some(e => e.id === m.id && e.day === today() && e.moment === id) ? 'tomada' : 'pendiente'])) : {},
    dosis_al_dia: perDayUnits(m), costes: costLine(m) || null, fin_del_envase: runsOut(m) || null, tomas_registradas: state.log.filter(e => e.id === m.id).length }));
  return `Eres el asistente de Dosify, una app para llevar productos de medicación y registrar las tomas. Responde en español, breve y claro, en Markdown: títulos, negritas, listas y, cuando ayuden a comparar o resumir, tablas. Para mostrar evolución o reparto puedes añadir una gráfica con un bloque de código \`\`\`chart que contenga solo JSON: {"type": "bar"|"line"|"pie"|"doughnut", "labels": [...], "datasets": [{"label": "...", "data": [números]}]}. Usa solo los datos que te doy; si algo no está, dilo. Habla siempre en lenguaje natural y de tú, en segunda persona («has guardado», «tienes», «te queda»): nunca muestres JSON, claves, ids ni datos en bruto. No das consejo médico: para dudas de salud, remite al médico o al farmacéutico.
Hoy es ${now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${today()}), y son las ${time(now.toISOString())}.
Datos:
- moments: momentos de toma, en su orden (no se reordenan; id aleatorio; name es el nombre que ve el usuario; start y end, horas, opcionales; visible, si sale en la app; order, ids de producto en el orden de tomas). Por defecto son ${DEFAULT_MOMENTS.map(d => d.name).join(', ')}, pero pueden haberse renombrado: usa siempre los ids y nombres que ves en los datos. En la toma de cada día solo se ven los momentos que ese día tienen algún producto pendiente o toma hecha.
- products: productos (id, name, notes = indicaciones, refs = referencias, memo = notas, cost = € por envase, units = dosis por envase, plans = pautas { dose, start AAAA-MM-DD, days, moments = ids de los momentos en que se toma con esa pauta, al menos uno }). Cada día vale la última pauta que haya empezado, si su duración llega a ese día, en sus moments y con su dose (que empieza por la cantidad de cada toma). Un producto sin pauta vigente ni futura (también sin ninguna) está inactivo: no sale en la toma y va en la lista «Inactivos» de Productos; para que se tome hay que darle una pauta. Para cambiar los momentos de un producto, cambia los moments de su pauta (o crea otra con otros). Al crear un producto, propón ya su pauta (dosis, inicio, duración y momentos).
- log: tomas registradas (at = cuándo se marcó, day = día de la toma, id = producto, moment = momento, name, dose y notes = el producto tal como se tomó).
Cálculos por producto (dosis de hoy, si está inactivo, qué tomas de hoy están tomadas o pendientes por momento, dosis al día, costes, fin del envase actual con reinicio automático al gastar cada envase, tomas registradas):
${JSON.stringify(summary)}
Datos completos:
${JSON.stringify({ moments: state.moments, products: state.products, log: state.log })}
Los datos de arriba son los únicos ciertos ahora mismo: lo que se dijera en mensajes anteriores puede haber cambiado. Comprueba en ellos si algo existe antes de hablar de ello; un producto con el mismo nombre que ya está en los datos se modifica, no se crea otro.
Interacción: siempre que quien usa la app quiera elegir, marcar varias cosas, repasar o confirmar una lista, rellenar o editar datos o responder entre opciones, no contestes con texto: llama a interfaz y compón la pantalla que haga falta con sus elementos (text, check, toggle, radio, chips, select, input de text/number/date/time, textarea y button), en una o varias secciones con título. Cada elemento tiene una clave (key): al aplicar recibes su valor y puedes usarlo en los argumentos de las acciones como {{clave}}. Las acciones son las otras herramientas: en un check, toggle, opción de radio, chips o select, se ejecuta si queda marcado o elegido; en un button, al pulsarlo; en actions (globales), siempre. Ejemplos: «una lista con check para marcar las tomas de esta mañana» → una sección con un check por producto pendiente del momento de la mañana, cada uno con action registrar_toma (id, moment, day); «cambia el coste y las dosis por envase de X» → inputs number con key coste y dosis, y en actions modificar_producto con id, cost "{{coste}}" y units "{{dosis}}"; «¿qué producto?» → radio o buttons con los candidatos; elegir momentos → chips multiple. Los elementos sin acción solo te devuelven su valor: sirven para preguntar. Texto, tablas y gráficas solo cuando no hay nada con lo que interactuar.
Regla principal: siempre que el mensaje implique crear, cambiar, borrar, marcar o quitar algo (lo pida como lo pida), llama a la herramienta en ese mismo turno, antes de nada: sin pedir datos, sin pedir confirmación y sin describir lo que harías. Cada llamada genera en la conversación un formulario editable con lo que propongas, que quien usa la app completa, guarda o descarta; recibirás el resultado con los datos finales. Si falta algún dato, no lo preguntes: llama igualmente con lo que tengas (basta con identificar el producto, la toma o el momento), el formulario sale con los valores actuales y quien usa la app lo rellena; si te dan el dato, ponlo en la llamada. Para varios elementos, una llamada por elemento (se muestran como una lista); nunca repitas una llamada igual ni vuelvas a proponer algo que el resultado ya te ha confirmado como guardado. Si no está claro a qué producto se refiere, propón una llamada por cada candidato. Usa los id que ves en los datos.`;
}

// Herramientas: qué puede cambiar el asistente. Cada llamada se convierte en una propuesta: una tarjeta editable en la
// conversación (campos, chips de momentos, filas de pauta) que el usuario guarda o descarta.
const stringProp = description => ({ type: 'string', description });
const productProps = () => ({
  name: stringProp('Nombre'), notes: stringProp('Indicaciones'), refs: stringProp('Referencias'), memo: stringProp('Notas'),
  cost: { type: 'integer', description: '€ por envase' }, units: { type: 'integer', description: 'Dosis por envase' },
  plans: { type: 'array', description: 'Pautas (sustituyen a las que haya); sin ellas el producto no sale en la toma', items: { type: 'object', required: ['dose', 'start', 'days', 'moments'],
    properties: { dose: stringProp('Dosis; empieza por un número'), start: stringProp('Fecha de inicio AAAA-MM-DD'), days: { type: 'integer', description: 'Duración en días' }, moments: { type: 'array', items: { type: 'string', enum: momentIds() }, description: 'Ids de los momentos en que se toma con esta pauta (al menos uno)' } } } },
});
const tool = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const ACTIONS = ['crear_producto', 'modificar_producto', 'borrar_producto', 'registrar_toma', 'quitar_toma', 'modificar_momento'];
const UI_TYPES = ['text', 'check', 'toggle', 'radio', 'chips', 'select', 'input', 'textarea', 'button'];
const ACTION = { type: 'object', description: 'Acción: una de las otras herramientas con sus argumentos; en los argumentos, {{clave}} se sustituye por el valor del elemento con esa clave', required: ['tool'], properties: { tool: { type: 'string', enum: ACTIONS }, args: { type: 'object', description: 'Argumentos de esa herramienta' } } };
const tools = () => [
  tool('interfaz', 'Úsala siempre que haga falta interacción (elegir, marcar, repasar o confirmar una lista, rellenar o editar datos, responder entre opciones): compone una interfaz con componentes de la app a partir de secciones y elementos (texto, casillas, interruptores, radios, chips, selector, campos de texto, número, fecha y hora, área de texto y botones). Al aplicar se ejecutan las acciones de los elementos marcados o elegidos y las acciones globales, y recibes el valor de cada elemento.', {
    title: stringProp('Título de la interfaz'), confirm: stringProp('Texto del botón de aplicar, p. ej. «Marcar» o «Guardar»'),
    sections: { type: 'array', description: 'Secciones: cada una, un bloque (lista) con título opcional y sus elementos', items: { type: 'object', required: ['elements'], properties: {
      title: stringProp('Título de la sección'),
      elements: { type: 'array', items: { type: 'object', required: ['type'], properties: {
        type: { type: 'string', enum: UI_TYPES, description: 'text: solo texto; check: casilla; toggle: interruptor; radio: elegir una opción; chips: chips (varias con multiple); select: selector; input: campo (text, number, date o time); textarea: texto largo; button: botón que aplica al instante' },
        key: stringProp('Clave única del elemento: con ella recibes su valor y puedes usarlo en las acciones como {{clave}}'),
        label: stringProp('Texto principal (o etiqueta del campo)'), detail: stringProp('Texto secundario'), placeholder: stringProp('Texto de ayuda del campo'),
        checked: { type: 'boolean', description: 'check o toggle: marcado de inicio' }, value: { description: 'Valor inicial: texto en input, textarea, radio, select o chips; lista de valores en chips multiple' },
        input: { type: 'string', enum: ['text', 'number', 'date', 'time'], description: 'input: tipo de campo' }, multiple: { type: 'boolean', description: 'chips: se pueden marcar varios' }, required: { type: 'boolean', description: 'input o textarea: obligatorio' },
        options: { type: 'array', description: 'radio, chips o select: opciones', items: { type: 'object', required: ['label'], properties: { value: stringProp('Valor (si no, el texto)'), label: stringProp('Texto'), detail: stringProp('Texto secundario'), action: ACTION } } },
        action: ACTION,
      } } },
    } } },
    actions: { type: 'array', description: 'Acciones globales al aplicar (p. ej. modificar_producto con los valores de los campos como {{clave}})', items: ACTION },
  }, ['title', 'sections']),
  tool('crear_producto', 'Úsala en cuanto pidan crear o añadir un producto (medicamento o suplemento), aunque falten datos: abre un formulario editable con lo que propongas y quien usa la app completa el resto', productProps()),
  tool('modificar_producto', 'Úsala en cuanto pidan modificar, cambiar o editar algo de un producto (dosis, pauta, momentos, coste…), aunque no digan el valor nuevo: abre un formulario con el producto y tus cambios, si los hay', { id: stringProp('Id del producto'), ...productProps() }, ['id']),
  tool('borrar_producto', 'Úsala en cuanto pidan borrar o eliminar un producto (sus tomas se conservan)', { id: stringProp('Id del producto') }, ['id']),
  tool('registrar_toma', 'Úsala en cuanto pidan marcar, registrar o apuntar una toma, aunque no digan momento ni día (el formulario sale con el primer momento del producto ese día y hoy)', { id: stringProp('Id del producto'), moment: { type: 'string', enum: momentIds(), description: 'Momento; si no, el primero del producto ese día' }, day: stringProp('Día AAAA-MM-DD; si no, hoy'), hora: stringProp('Hora HH:MM; si no, la actual') }, ['id']),
  tool('quitar_toma', 'Úsala en cuanto pidan desmarcar o quitar una toma (dejarla pendiente), aunque no digan momento ni día', { id: stringProp('Id del producto'), moment: { type: 'string', enum: momentIds(), description: 'Momento; si no, el primero del producto ese día' }, day: stringProp('Día AAAA-MM-DD; si no, hoy') }, ['id']),
  tool('modificar_momento', 'Úsala en cuanto pidan cambiar un momento (nombre, horas, visible), aunque no digan el valor nuevo', { id: { type: 'string', enum: momentIds() }, name: stringProp('Nombre'), start: { type: 'integer', description: 'Hora de inicio 0-24' }, end: { type: 'integer', description: 'Hora de fin 0-24' }, visible: { type: 'boolean' } }, ['id']),
];

// Formularios de las propuestas. Para cada herramienta: draft (los datos editables a partir de lo que propone el
// asistente, o null si no vale), title, fields (el HTML de los campos), validate (campos mal) y apply (guarda y
// devuelve el resumen). Los valores del borrador son texto, como en los campos.
const str = v => v == null ? '' : String(v);
const productFields = d => `
  <ion-item><ion-input data-field="name" label="Nombre" label-placement="stacked" value="${esc(d.name)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="notes" label="Indicaciones" label-placement="stacked" value="${esc(d.notes)}"></ion-input></ion-item>
  <ion-item><ion-textarea data-field="refs" label="Referencias" label-placement="stacked" auto-grow="true" value="${esc(d.refs)}"></ion-textarea></ion-item>
  <ion-item><ion-textarea data-field="memo" label="Notas" label-placement="stacked" auto-grow="true" value="${esc(d.memo)}"></ion-textarea></ion-item>
  <ion-item><ion-input data-field="cost" type="number" inputmode="numeric" label="Coste del envase (€)" label-placement="stacked" placeholder="Sin coste" value="${esc(d.cost)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="units" type="number" inputmode="numeric" label="Dosis por envase" label-placement="stacked" placeholder="Sin indicar" value="${esc(d.units)}"></ion-input></ion-item>
  ${d.plans.map((p, i) => `
  <ion-item><ion-input data-plan="dose" data-row="${i}" label="Pauta ${i + 1}: dosis" label-placement="stacked" placeholder="1 comprimido" value="${esc(p.dose)}"></ion-input><ion-chip slot="end" outline="true" color="medium" data-chip="remove-plan" data-row="${i}"><ion-icon name="close-outline"></ion-icon><ion-label>Quitar</ion-label></ion-chip></ion-item>
  <ion-item><ion-input data-plan="start" data-row="${i}" type="date" label="Inicio" label-placement="stacked" value="${esc(p.start)}"></ion-input><ion-input data-plan="days" data-row="${i}" type="number" inputmode="numeric" label="Duración (días)" label-placement="stacked" value="${esc(p.days)}"></ion-input></ion-item>
  <ion-item lines="none"><ion-label><p>Momentos de la pauta ${i + 1}</p><p>${visibleMoments().map(mo => `<ion-chip data-chip="plan-moment" data-row="${i}" data-value="${esc(mo.id)}" ${p.moments.includes(mo.id) ? 'color="primary"' : 'outline="true" color="medium"'}><ion-label>${esc(label(mo.id))}</ion-label></ion-chip>`).join('')}</p>${p.bad ? '<p><ion-text color="danger">Marca al menos un momento</ion-text></p>' : ''}</ion-label></ion-item>`).join('')}
  <ion-item lines="none"><ion-label><p>${chipAction('add-plan', 'Añadir pauta', 'add-outline')}</p></ion-label></ion-item>`;
const chipToggle = (kind, value, text, on) => `<ion-chip data-chip="${kind}" data-value="${esc(value)}" ${on ? 'color="primary"' : 'outline="true" color="medium"'}><ion-label>${esc(text)}</ion-label></ion-chip>`;
const chipAction = (kind, text, icon) => `<ion-chip data-chip="${kind}" outline="true" color="primary"><ion-icon name="${icon}"></ion-icon><ion-label>${text}</ion-label></ion-chip>`;
const productDraft = (base, a) => ({ name: str(a.name ?? base.name), notes: str(a.notes ?? base.notes), refs: str(a.refs ?? base.refs), memo: str(a.memo ?? base.memo),
  cost: str(a.cost ?? base.cost), units: str(a.units ?? base.units),
  plans: (Array.isArray(a.plans) ? a.plans : base.plans).filter(p => p && typeof p === 'object').map(p => ({ dose: str(p.dose), start: str(p.start), days: str(p.days), moments: momentIds().filter(id => list(p.moments).includes(id)) })) });
// Una pauta sin momentos no vale (se marca en su fila: «Marca al menos un momento»).
const productValidate = d => [
  ...(d.name.trim() ? [] : ['name']), ...(int(d.cost) === null ? ['cost'] : []), ...(int(d.units, 1) === null ? ['units'] : []),
  ...d.plans.flatMap((p, i) => [['dose', amount(p.dose)], ['start', date(p.start)], ['days', int(p.days, 1)], ['moments', p.moments.length]].filter(([, ok]) => !ok).map(([f]) => `${f}:${i}`)),
];
const productValues = d => ({ name: d.name.trim(), notes: d.notes.trim(), refs: d.refs.trim(), memo: d.memo.trim(), cost: int(d.cost), units: int(d.units, 1),
  plans: d.plans.map(p => ({ dose: p.dose.trim(), start: p.start, days: int(p.days, 1), moments: p.moments })) });
const momentChips = (d, moments = visibleMoments().map(mo => mo.id)) => moments.map(id => chipToggle('pick-moment', id, label(id), d.moment === id)).join('');
const tomaFields = (d, withTime) => `
  <ion-item lines="none"><ion-label><h2 class="medium">${esc(d.name)}</h2><p>${momentChips(d)}</p></ion-label></ion-item>
  <ion-item><ion-input data-field="day" type="date" label="Día" label-placement="stacked" value="${esc(d.day)}"></ion-input>${withTime ? `<ion-input data-field="hora" type="time" label="Hora" label-placement="stacked" value="${esc(d.hora)}"></ion-input>` : ''}</ion-item>`;
const tomaDraft = a => { const m = productOf(a.id); return m && { id: m.id, name: m.name, moment: momentIds().includes(a.moment) ? a.moment : momentsOn(m, date(str(a.day)) || today())[0] ?? momentIds()[0], day: date(str(a.day)) || today(), hora: /^\d{1,2}:\d{2}$/.test(str(a.hora)) ? str(a.hora).padStart(5, '0') : '' }; };
const tomaValidate = d => [...(date(d.day) ? [] : ['day']), ...(d.hora === '' || /^\d{1,2}:\d{2}$/.test(d.hora) ? [] : ['hora'])];
const productBrief = d => `${d.name.trim() || 'Sin nombre'} · ${d.plans[0]?.dose || 'sin dosis'} · ${(d.plans[0]?.moments ?? []).map(label).join(', ') || 'sin momentos'}`;
const tomaBrief = d => `${d.name} · ${label(d.moment)} · ${shortDate(d.day)}${d.hora ? ` ${d.hora}` : ''}`;
// Interfaz dinámica: secciones (una lista cada una) de elementos hechos con componentes de Ionic. Cada elemento tiene
// una clave; su valor (marcado, elegido o escrito) se guarda en el borrador, vuelve al asistente al aplicar y puede ir
// en los argumentos de las acciones como {{clave}}. Las acciones (de elementos marcados o elegidos, de un botón
// pulsado y las globales) se ejecutan con el formulario de su herramienta, sin pasar por su tarjeta.
const normAction = a => a && typeof a === 'object' && ACTIONS.includes(a.tool) ? { tool: a.tool, args: a.args && typeof a.args === 'object' ? a.args : {} } : null;
const normOptions = o => (Array.isArray(o) ? o : []).filter(x => x && typeof x === 'object' && str(x.label ?? x.value).trim())
  .map(x => ({ value: str(x.value ?? x.label).trim(), label: str(x.label ?? x.value).trim(), detail: str(x.detail).trim(), action: normAction(x.action) }));
function uiDraft(a) {
  const values = {}; let n = 0;
  const sections = (Array.isArray(a.sections) ? a.sections : []).map(sec => ({ title: str(sec?.title).trim(), elements: (Array.isArray(sec?.elements) ? sec.elements : [])
    .filter(el => el && typeof el === 'object' && UI_TYPES.includes(el.type)).map(el => {
      const e = { type: el.type, key: str(el.key).trim() || `e${++n}`, label: str(el.label ?? el.text).trim(), detail: str(el.detail).trim(), placeholder: str(el.placeholder).trim(),
        input: ['text', 'number', 'date', 'time'].includes(el.input) ? el.input : 'text', multiple: el.multiple === true, required: el.required === true, options: normOptions(el.options), action: normAction(el.action) };
      const has = v => e.options.some(o => o.value === v);
      if (e.type === 'check' || e.type === 'toggle') values[e.key] = el.checked === true || el.value === true;
      else if (e.type === 'radio') values[e.key] = has(str(el.value)) ? str(el.value) : e.options[0]?.value ?? '';
      else if (e.type === 'select') values[e.key] = has(str(el.value)) ? str(el.value) : '';
      else if (e.type === 'chips') values[e.key] = e.multiple ? list(el.value).filter(has) : has(str(el.value)) ? str(el.value) : '';
      else if (e.type === 'input' || e.type === 'textarea') values[e.key] = str(el.value);
      return e;
    }) })).filter(sec => sec.elements.length);
  if (!sections.length) return null;
  return { title: str(a.title).trim() || 'Interfaz', confirm: str(a.confirm).trim() || 'Aplicar', sections, values, pressed: null, actions: (Array.isArray(a.actions) ? a.actions : []).map(normAction).filter(Boolean) };
}
const uiElements = d => d.sections.flatMap(sec => sec.elements);
const uiSub = x => x.detail ? `<br><ion-text color="medium">${esc(x.detail)}</ion-text>` : '';
const uiElement = (e, v) => ({
  text: () => `<ion-item><ion-label class="ion-text-wrap"><h2>${esc(e.label)}</h2>${e.detail ? `<p>${esc(e.detail)}</p>` : ''}</ion-label></ion-item>`,
  check: () => `<ion-item><ion-checkbox class="ion-text-wrap" data-ui="${esc(e.key)}" label-placement="end" justify="start" ${v ? 'checked' : ''}>${esc(e.label)}${uiSub(e)}</ion-checkbox></ion-item>`,
  toggle: () => `<ion-item><ion-toggle class="ion-text-wrap" data-ui="${esc(e.key)}" ${v ? 'checked' : ''}>${esc(e.label)}${uiSub(e)}</ion-toggle></ion-item>`,
  radio: () => `${e.label ? `<ion-item lines="none"><ion-label><p>${esc(e.label)}</p></ion-label></ion-item>` : ''}<ion-radio-group data-ui="${esc(e.key)}" value="${esc(v)}">${e.options.map(o =>
    `<ion-item><ion-radio class="ion-text-wrap" value="${esc(o.value)}" label-placement="end" justify="start">${esc(o.label)}${uiSub(o)}</ion-radio></ion-item>`).join('')}</ion-radio-group>`,
  chips: () => `<ion-item lines="none"><ion-label>${e.label ? `<p>${esc(e.label)}</p>` : ''}<p>${e.options.map(o => {
    const on = e.multiple ? v.includes(o.value) : v === o.value;
    return `<ion-chip data-chip="ui" data-ui="${esc(e.key)}" data-value="${esc(o.value)}" ${on ? 'color="primary"' : 'outline="true" color="medium"'}><ion-label>${esc(o.label)}</ion-label></ion-chip>`; }).join('')}</p></ion-label></ion-item>`,
  select: () => `<ion-item><ion-select data-ui="${esc(e.key)}" label="${esc(e.label)}" label-placement="stacked" interface="action-sheet" cancel-text="Cancelar" placeholder="${esc(e.placeholder || 'Elige')}" value="${esc(v)}">${e.options.map(o =>
    `<ion-select-option value="${esc(o.value)}">${esc(o.label)}</ion-select-option>`).join('')}</ion-select></ion-item>`,
  input: () => `<ion-item><ion-input data-ui="${esc(e.key)}" type="${e.input}" ${e.input === 'number' ? 'inputmode="numeric"' : ''} label="${esc(e.label)}" label-placement="stacked" placeholder="${esc(e.placeholder)}" value="${esc(v)}"></ion-input></ion-item>`,
  textarea: () => `<ion-item><ion-textarea data-ui="${esc(e.key)}" label="${esc(e.label)}" label-placement="stacked" auto-grow="true" placeholder="${esc(e.placeholder)}" value="${esc(v)}"></ion-textarea></ion-item>`,
  button: () => `<ion-item button="true" detail="false" data-ui-button="${esc(e.key)}"><ion-label color="primary" class="ion-text-wrap">${esc(e.label)}${e.detail ? `<p>${esc(e.detail)}</p>` : ''}</ion-label></ion-item>`,
}[e.type]());
const uiBlocks = d => d.sections.map(sec => `${sec.title ? `<ion-list-header><ion-label>${esc(sec.title)}</ion-label></ion-list-header>` : ''}<ion-list inset="true">${sec.elements.map(e => uiElement(e, d.values[e.key])).join('')}</ion-list>`).join('');
// El valor de un elemento, en texto, para el asistente.
const uiValue = (e, d) => {
  const v = d.values[e.key], opt = x => e.options.find(o => o.value === x)?.label ?? x;
  if (e.type === 'button') return d.pressed === e.key ? 'pulsado' : 'no pulsado';
  if (Array.isArray(v)) return v.map(opt).join(', ') || 'ninguno';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  return opt(v) || '—';
};
// {{clave}} en los argumentos de una acción: el valor del elemento (tal cual si es todo el texto; si no, dentro de él).
const fill = (args, values) => JSON.parse(JSON.stringify(args), (k, v) => typeof v !== 'string' ? v
  : /^\{\{\w+\}\}$/.test(v) ? values[v.slice(2, -2)] ?? '' : v.replace(/\{\{(\w+)\}\}/g, (_, key) => str(values[key])));
const runAction = (label, a) => {
  const f = FORMS[a.tool], d = f.draft(a.args);
  if (!d) return `${label}: no se ha podido (no existe)`;
  if (f.validate(d).length) return `${label}: no se ha podido (faltan datos o no valen)`;
  return `${label}: ${f.apply(d) ?? 'no se ha podido'}`;
};
const FORMS = {
  interfaz: {
    draft: uiDraft, title: d => esc(d.title), button: d => d.confirm, blocks: uiBlocks, fields: uiBlocks,
    brief: d => `${uiElements(d).filter(e => e.type !== 'text').length} elementos`,
    validate: d => uiElements(d).filter(e => (e.type === 'input' || e.type === 'textarea') && e.required && !str(d.values[e.key]).trim()).map(e => `@${e.key}`),
    apply: d => {
      const runs = [], run = (label, a) => { if (a) runs.push(runAction(label, { tool: a.tool, args: fill(a.args, d.values) })); };
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
  crear_producto: {
    draft: a => productDraft({ name: '', notes: '', refs: '', memo: '', cost: '', units: '', plans: [] }, a),
    title: () => 'Nuevo producto', brief: productBrief, fields: productFields, validate: productValidate,
    apply: d => { const v = productValues(d); state.products.push({ id: newId(), ...v }); return `Producto «${v.name}» creado`; },
  },
  modificar_producto: {
    draft: a => { const m = productOf(a.id); return m && { id: m.id, ...productDraft(m, a) }; },
    title: d => `Cambiar el producto «${esc(productOf(d.id)?.name ?? d.name)}»`, brief: productBrief, fields: productFields, validate: productValidate,
    apply: d => {
      const m = productOf(d.id); if (!m) return null;
      Object.assign(m, productValues(d));
      for (const e of state.log) if (e.id === m.id && e.day >= today()) Object.assign(e, snapOn(m, e.day));
      return `Producto «${m.name}» cambiado`;
    },
  },
  borrar_producto: {
    draft: a => { const m = productOf(a.id); return m && { id: m.id, name: m.name }; },
    title: () => 'Borrar producto', danger: 'Borrar', brief: d => `${d.name} · se conservan sus tomas`,
    fields: d => `<ion-item lines="none"><ion-label><h2 class="medium">${esc(d.name)}</h2><p>Sus tomas registradas se conservan.</p></ion-label></ion-item>`,
    validate: () => [],
    apply: d => { state.products = state.products.filter(m => m.id !== d.id); return `Producto «${d.name}» borrado`; },
  },
  registrar_toma: {
    draft: tomaDraft, title: () => 'Marcar toma', brief: tomaBrief, fields: d => tomaFields(d, true), validate: tomaValidate,
    apply: d => {
      const m = productOf(d.id); if (!m) return null;
      if (!state.log.some(e => e.id === d.id && e.moment === d.moment && e.day === d.day)) {
        const at = d.hora ? new Date(`${d.day}T${d.hora.padStart(5, '0')}`) : new Date();
        state.log.unshift({ at: at.toISOString(), day: d.day, id: d.id, moment: d.moment, ...snapOn(m, d.day) });
      }
      return `«${m.name}» marcado en ${label(d.moment)} el ${shortDate(d.day)}`;
    },
  },
  quitar_toma: {
    draft: tomaDraft, title: () => 'Dejar pendiente', brief: tomaBrief, fields: d => tomaFields(d, false), validate: tomaValidate,
    apply: d => { state.log = state.log.filter(e => !(e.id === d.id && e.moment === d.moment && e.day === d.day)); return `«${d.name}» pendiente en ${label(d.moment)} el ${shortDate(d.day)}`; },
  },
  modificar_momento: {
    draft: a => { const mo = momentOf(a.id); return mo && { id: mo.id, name: str(a.name ?? mo.name), start: str(a.start ?? mo.start), end: str(a.end ?? mo.end), visible: typeof a.visible === 'boolean' ? a.visible : mo.visible }; },
    title: d => `Cambiar el momento «${esc(label(d.id))}»`,
    brief: d => `${d.name.trim() || 'Sin nombre'} · ${d.start !== '' || d.end !== '' ? `${d.start || '?'}–${d.end || '?'} h` : 'sin horas'} · ${d.visible ? 'visible' : 'oculto'}`,
    fields: d => `
  <ion-item><ion-input data-field="name" label="Nombre" label-placement="stacked" placeholder="Sin nombre" value="${esc(d.name)}"></ion-input></ion-item>
  <ion-item><ion-input data-field="start" type="number" inputmode="numeric" label="Hora de inicio (de 0 a 24)" label-placement="stacked" value="${esc(d.start)}"></ion-input><ion-input data-field="end" type="number" inputmode="numeric" label="Hora de fin (de 0 a 24)" label-placement="stacked" value="${esc(d.end)}"></ion-input></ion-item>
  <ion-item lines="none"><ion-label><p>${chipToggle('visible', 'visible', 'Visible en la toma', d.visible)}</p></ion-label></ion-item>`,
    validate: d => [...(hour(d.start) === null ? ['start'] : []), ...(hour(d.end) === null ? ['end'] : [])],
    apply: d => { Object.assign(momentOf(d.id), { name: d.name.trim(), start: hour(d.start), end: hour(d.end), visible: d.visible }); return `Momento «${label(d.id)}» cambiado`; },
  },
};

// Las propuestas pendientes de este turno: el bucle del asistente espera a que el usuario las guarde o descarte.
const resolvers = new Map();
let chatEpoch = 0, awaiting = false;
const pending = () => chatView.filter(v => v.who === 'proposal' && v.status === 'pending');
// Al asistente se le responde en texto, nunca en JSON, para que no lo repita al usuario.
const pushToolResult = (callId, content) => { if (!chat.some(m => m.role === 'tool' && m.tool_call_id === callId)) chat.push({ role: 'tool', tool_call_id: callId, content }); };
// Los datos finales de una propuesta, descritos en texto para el asistente.
function describe(tool, d) {
  const dateText = k => shortDate(k);
  if (tool === 'crear_producto' || tool === 'modificar_producto') {
    const v = productValues(d);
    return [`nombre «${v.name}»`, v.notes && `indicaciones «${v.notes}»`, v.refs && `referencias «${v.refs}»`, v.memo && `notas «${v.memo}»`,
      v.cost !== '' && `${v.cost} € por envase`, v.units !== '' && `${v.units} dosis por envase`,
      v.plans.length ? `pautas: ${v.plans.map(p => `${p.dose} desde el ${dateText(p.start)} durante ${p.days} días en ${p.moments.map(label).join(', ')}`).join('; ')}` : 'sin pautas (no sale en la toma)'].filter(Boolean).join(', ');
  }
  if (tool === 'registrar_toma' || tool === 'quitar_toma') return `${d.name} en ${label(d.moment)} el ${dateText(d.day)}${d.hora ? ` a las ${d.hora}` : ''}`;
  if (tool === 'modificar_momento') return `nombre «${d.name.trim()}», ${d.start !== '' || d.end !== '' ? `de ${d.start || '?'} a ${d.end || '?'} h` : 'sin horas'}, ${d.visible ? 'visible' : 'oculto'}`;
  if (tool === 'interfaz') return uiElements(d).filter(e => e.type !== 'text').map(e => `${e.label || e.key}: ${uiValue(e, d)}`).join('; ') || 'sin elementos';
  return d.name;
}
function decide(v, saved) {
  if (v.status !== 'pending') return; // ya decidida (p. ej. doble toque en «Guardar»): no se aplica dos veces
  const form = FORMS[v.tool];
  if (saved) {
    const summary = form.apply(v.draft);
    Object.assign(state, clean(state)); save(); render();
    v.status = 'saved'; v.text = summary ?? 'No se ha podido aplicar';
    pushToolResult(v.id, summary ? `Has guardado la propuesta. ${summary}. Datos finales (con los cambios que hayas hecho): ${describe(v.tool, v.draft)}.` : 'No se ha podido aplicar: ya no existe.');
  } else {
    v.status = 'discarded'; v.text = `${form.title(v.draft).replace(/<[^>]+>/g, '')}: descartada`;
    pushToolResult(v.id, 'Has descartado la propuesta; no se ha cambiado nada.');
  }
  resolvers.get(v.id)?.(); resolvers.delete(v.id);
}
// Guarda una propuesta si sus datos valen; si no, marca en rojo los campos que fallan con su mensaje debajo. El mensaje
// (errorText) se pone solo entonces y se quita al escribir: con él fijo, Ionic dibuja debajo del campo una sección con
// su propio borde aunque el mensaje esté oculto, y el campo sale con dos líneas.
const FIELD_ERRORS = { name: 'Pon un nombre', cost: 'Número entero, o vacío', units: 'Número entero, o vacío', day: 'Pon el día', hora: 'Hora HH:MM, o vacía', start: 'De 0 a 24', end: 'De 0 a 24' };
const PLAN_ERRORS = { dose: 'Empieza por un número', start: 'Pon la fecha', days: 'Días, un número entero' };
function trySave(v, card) {
  if (v.status !== 'pending') return false;
  const bad = FORMS[v.tool].validate(v.draft);
  for (const f of bad) {
    const [field, row] = f.split(':');
    if (field === 'moments') { v.draft.plans[Number(row)].bad = true; continue; }
    const el = !card ? null : f.startsWith('@') ? card.querySelector(`[data-ui="${f.slice(1)}"]`) : row === undefined ? card.querySelector(`[data-field="${field}"]`) : card.querySelector(`[data-plan="${field}"][data-row="${row}"]`);
    if (!el) continue;
    el.errorText = f.startsWith('@') ? 'Obligatorio' : (row === undefined ? FIELD_ERRORS : PLAN_ERRORS)[field] ?? 'Revisa este dato';
    el.classList.add('ion-invalid', 'ion-touched');
  }
  if (bad.length) { if (card && bad.some(f => f.startsWith('moments:'))) refreshCard(card, v); return false; }
  decide(v, true);
  return true;
}

// Markdown (marked) y gráficas (Chart.js) de las respuestas: se cargan desde CDN la primera vez que se abre el
// asistente. Del Markdown no se deja pasar HTML ni enlaces que no sean http(s); un bloque ```chart con JSON
// { "type": "bar" | "line" | "pie" | "doughnut", "labels": [...], "datasets": [{ "label": "...", "data": [...] }] }
// se dibuja como gráfica. Si no cargan, el texto sale tal cual.
const MARKED = 'https://cdn.jsdelivr.net/npm/marked@18.0.14/lib/marked.esm.js';
const CHARTJS = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/auto/+esm';
const CHART_COLORS = ['#6dd0f9', '#78b7af', '#e47969', '#f5a142', '#9b8bd6', '#7cc576'];
let marked = null, Chart = null, charts = [], libs = null;
const loadLibs = () => libs ??= Promise.all([import(MARKED), import(CHARTJS)]).then(([m, c]) => {
  marked = new m.Marked({ gfm: true, breaks: true, renderer: {
    html: ({ text }) => esc(text),
    heading(token) { return `<h2 class="medium">${this.parser.parseInline(token.tokens)}</h2>`; },
    paragraph(token) { return `<div class="md-p">${this.parser.parseInline(token.tokens)}</div>`; }, // un <p> en ion-label sale gris y pequeño
    image: ({ text }) => esc(text),
    link(token) { const label = this.parser.parseInline(token.tokens); return /^https?:\/\//.test(token.href) ? `<a href="${esc(token.href)}" target="_blank" rel="noopener">${label}</a>` : label; },
    code: ({ text, lang }) => lang === 'chart' ? `<div class="md-chart"><canvas data-chart="${esc(text)}"></canvas></div>` : false,
  } });
  Chart = c.default;
}).catch(() => {});
const markdown = text => marked ? marked.parse(String(text)) : linkify(text);

// Dibuja las gráficas de los bloques ```chart; si el JSON no vale, deja un aviso en su lugar.
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

// Sugerencias: las propone el propio modelo con una petición aparte (sin herramientas) que recibe todos los datos, el
// hora del día, la conversación y lo que sabe hacer. Se guardan en este navegador y se piden la primera vez (si no
// hay ninguna guardada), al terminar cada respuesta (se vacían al enviar la pregunta y las nuevas siguen, la mitad, el
// hilo de lo respondido y, la otra mitad, van libres), al pulsar «Otras» o tras «Limpiar». Si el servicio falla, se eligen al azar de un fondo hecho en la app con los datos (suggestionPool).
const SUGGEST_KEY = 'dosify-sugerencias';
let suggested = (() => { try { const v = JSON.parse(localStorage.getItem(SUGGEST_KEY)); return Array.isArray(v?.list) ? v.list.filter(q => typeof q === 'string') : []; } catch { return []; } })();
let suggestLoading = null; // promesa de la petición en curso
function suggestionPool() {
  const products = state.products.filter(m => !inactive(m)), day = today(), h = new Date().getHours();
  const moment = momentNow(), momentName = moment ? label(moment) : 'ahora';
  const taken = (m, id) => state.log.some(e => e.id === m.id && e.day === day && e.moment === id);
  const pendingNow = products.filter(m => momentsOn(m, day).includes(moment) && onDay(m, day) && !taken(m, moment));
  const logged = products.filter(m => state.log.some(e => e.id === m.id)), priced = products.filter(m => m.cost !== ''), ending = products.filter(m => m.plans.length && planEnd(m.plans.at(-1)) <= addDays(day, 7));
  const week = state.log.filter(e => e.day >= addDays(day, -7)).length, pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const some = products.length ? pick(products) : null, withLog = logged.length ? pick(logged) : null;
  return [
    // Ahora mismo
    ...(pendingNow.length ? [`Hazme una lista con check para marcar lo que me toca en ${momentName}.`, `¿Qué me queda por tomar en ${momentName}?`] : []),
    ...(products.length ? ['¿Qué me falta por tomar hoy?', h >= 20 ? '¿Me queda algo pendiente de hoy antes de dormir?' : h < 12 ? '¿Qué tengo que tomar a lo largo del día de hoy?' : '¿Qué me queda por tomar en lo que falta de día?'] : []),
    // Envases y compras
    ...products.filter(m => runsOut(m)).map(m => `¿Cuándo se me acaba ${m.name} y cuántas dosis me quedan del envase?`),
    ...(products.some(m => runsOut(m)) ? ['¿Qué tengo que comprar en los próximos 14 días? Hazme la lista con precios.', '¿Qué envase se me acaba antes?'] : []),
    ...(products.some(m => m.units === '' || m.cost === '') ? ['Hazme un formulario para completar el coste y las dosis por envase de los productos que no lo tienen.'] : []),
    // Costes
    ...(priced.length ? ['¿Cuánto me gasto al mes y en qué? Hazme una tabla por producto.', '¿Qué producto me sale más caro al día?', 'Hazme una gráfica de tarta con el reparto del gasto mensual por producto.'] : []),
    ...(priced.length && state.log.length ? ['¿Cuánto me he gastado este mes según las tomas registradas?'] : []),
    // Historial
    ...(state.log.length ? ['¿Cómo he cumplido las tomas esta semana? Hazme una tabla por día.', '¿Qué tomas se me olvidaron en los últimos 7 días?', 'Hazme una gráfica de las tomas por día de los últimos 14 días.'] : []),
    ...(week > 7 ? ['¿Qué día de la semana se me olvidan más tomas?', '¿En qué momento cumplo peor?'] : []),
    ...(withLog ? [`Resume el registro de ${withLog.name} en una tabla.`, `¿A qué hora suelo tomar ${withLog.name}?`, `¿Cuántas dosis de ${withLog.name} llevo tomadas en total?`] : []),
    // Pautas
    ...products.filter(m => m.plans.length > 1).map(m => `¿Cómo ha cambiado la dosis de ${m.name} según sus pautas?`),
    ...(ending.length ? [`¿Qué productos terminan esta semana y cuándo?`] : []),
    ...(state.products.some(inactive) ? ['¿Qué productos tengo inactivos y por qué?'] : []),
    // Cambios con formulario
    ...(some ? [`Quiero cambiar los momentos de la pauta de ${some.name}.`, `Añade una pauta nueva a ${some.name}.`, `Quiero cambiar el coste y las dosis por envase de ${some.name}.`] : []),
    ...(products.length ? ['Hazme una tabla con mis productos: dosis de hoy, momentos, coste y fin del envase.', 'Revisa mis productos y dime si ves algo raro o incompleto.', 'Quiero añadir un producto nuevo.'] : ['Ayúdame a crear mi primer producto.', 'Crea un producto de ejemplo para ver cómo funciona.']),
    // Otras
    ...(state.moments.some(mo => mo.visible && (mo.start === '' || mo.end === '')) ? ['Quiero poner horas a mis momentos.'] : []),
    '¿Qué puedes hacer por mí?',
  ];
}
const localSuggestions = count => { const asked = new Set(chat.filter(m => m.role === 'user').map(m => m.content)); return [...new Set(suggestionPool())].filter(q => !asked.has(q)).sort(() => Math.random() - 0.5).slice(0, count); };
// Caché que se refresca por detrás: si hay sugerencias guardadas, aunque sean de otro estado, salen al instante y se
// piden las nuevas en segundo plano (mientras, un indicador junto a «Otras»); solo sin nada guardado sale el aviso.
function suggestions(count) {
  if (!suggested.length && !suggestLoading) requestSuggestions(count, []);
  return suggested.length ? suggested : null;
}
// Una petición cada vez: si llega una respuesta de una petición ya sustituida, se ignora; si el servicio tarda más de
// 25 s o falla, salen las del fondo local.
let suggestRequest = 0;
function requestSuggestions(count, exclude) {
  const id = ++suggestRequest;
  suggestLoading = askSuggestions(count, exclude).catch(() => localSuggestions(count)).then(list => {
    if (id !== suggestRequest) return;
    suggestLoading = null;
    suggested = list;
    try { localStorage.setItem(SUGGEST_KEY, JSON.stringify({ list })); } catch {}
    if (!chatBusy && !awaiting) renderChat();
  });
}
// La petición: el mismo contexto que una pregunta, sin herramientas, y la respuesta como array JSON de textos.
async function askSuggestions(count, exclude) {
  const recent = chat.filter(m => (m.role === 'user' || m.role === 'assistant') && m.content).slice(-6).map(m => ({ role: m.role, content: m.content }));
  const asked = chat.filter(m => m.role === 'user').map(m => m.content);
  const linked = recent.some(m => m.role === 'assistant') ? ` La mitad de ellas (${Math.ceil(count / 2)}) deben seguir el hilo de tu última respuesta y de la conversación: profundizar, detallar o actuar sobre lo que acabas de decir (por ejemplo, si has mostrado una tabla, pedir una gráfica, un detalle o un cambio sobre esos mismos datos); la otra mitad, libres: otras cosas útiles ahora mismo con sus datos.` : '';
  const ask = `Propón ${count} sugerencias de lo que quien usa la app podría pedirte ahora mismo, escritas como las escribiría esa persona, en primera persona y de tú («¿Qué me falta por tomar hoy?», «Hazme una lista con check para marcar las tomas de la mañana»), breves (menos de 90 caracteres), variadas, concretas con sus datos (nombres de productos, momentos, envases, costes, historial) y útiles según la hora del día y la conversación.${linked} Combina tipos: consultas con tablas o gráficas, interacciones que lleven a una interfaz (marcar tomas, elegir, rellenar o editar con formulario) y cambios de datos. No propongas nada que no se pueda hacer con los datos o las herramientas, ni lo ya preguntado${asked.length ? ` (${asked.slice(-8).map(q => `«${q}»`).join(', ')})` : ''}${exclude.length ? `, ni estas: ${exclude.map(q => `«${q}»`).join(', ')}` : ''}. Responde solo con un array JSON de ${count} strings, sin nada más.`;
  const res = await fetch(`${ai.url.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` }, signal: AbortSignal.timeout(25000),
    body: JSON.stringify({ model: ai.model, messages: [{ role: 'system', content: systemPrompt() }, ...recent, { role: 'user', content: ask }] }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const text = String((await res.json()).choices?.[0]?.message?.content ?? ''), json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  const list = [...new Set(JSON.parse(json).filter(q => typeof q === 'string').map(q => q.trim()).filter(q => q && q.length <= 140))].slice(0, count);
  if (!list.length) throw new Error('vacío');
  return list;
}
// Mientras se piden sugerencias nuevas no se muestran las antiguas: solo la fila de carga.
const suggestionList = qs => `
  <ion-list-header><ion-label>Sugerencias</ion-label>${qs ? '<ion-button id="suggest-more" fill="clear" size="small"><ion-icon slot="start" name="shuffle-outline"></ion-icon>Otras</ion-button>' : ''}</ion-list-header>
  <ion-list inset="true">${(qs ?? []).map(q => `<ion-item button="true" detail="false" data-suggest="${esc(q)}"><ion-icon slot="start" name="sparkles-outline" color="teal"></ion-icon><ion-label class="ion-text-wrap" color="teal">${esc(q)}</ion-label></ion-item>`).join('')
    }${suggestLoading || !qs ? '<ion-item lines="none"><ion-spinner slot="start" name="dots" color="medium"></ion-spinner><ion-label color="medium">Proponiendo sugerencias…</ion-label></ion-item>' : ''}</ion-list>`;

const actionLine = (ok, text) => `<ion-list inset="true"><ion-item lines="none"><ion-icon slot="start" name="${ok ? 'checkmark-circle' : 'close-circle'}" color="${ok ? 'success' : 'medium'}"></ion-icon><ion-label class="ion-text-wrap" color="medium">${esc(text)}</ion-label></ion-item></ion-list>`;
// Tarjeta de una propuesta: título, campos editables y «Descartar» / «Guardar» (o «Borrar»); guardada o descartada,
// queda como una línea.
const proposalCard = (v, i) => {
  const form = FORMS[v.tool];
  if (v.status !== 'pending') return actionLine(v.status === 'saved', v.text);
  return `<div data-proposal="${i}">
    <ion-list-header><ion-label>${form.title(v.draft)}</ion-label></ion-list-header>
    ${form.blocks ? form.blocks(v.draft) : `<ion-list inset="true">${form.fields(v.draft)}</ion-list>`}
    <div class="proposal-actions">
      <ion-button fill="outline" color="medium" data-act="discard">Descartar</ion-button>
      <ion-button ${form.danger ? 'color="danger"' : ''} data-act="save">${form.danger ?? form.button?.(v.draft) ?? 'Guardar'}</ion-button>
    </div>
  </div>`;
};
const block = (v, i) => ({
  user: () => `<ion-list inset="true"><ion-item lines="none"><ion-label class="ion-text-wrap ion-text-end"><ion-text color="teal" class="medium">${linkify(v.text)}</ion-text></ion-label></ion-item>${messageBar(i, true)}</ion-list>`,
  assistant: () => `<ion-list inset="true"><ion-item lines="none"><ion-label class="ion-text-wrap">${markdown(v.text)}</ion-label></ion-item>${messageBar(i, false)}</ion-list>`,
  action: () => actionLine(v.ok, v.text),
  error: () => `<ion-list inset="true"><ion-item lines="none"><ion-label class="ion-text-wrap" color="danger">${esc(v.text)}</ion-label></ion-item></ion-list>`,
  proposal: () => proposalCard(v, i),
}[v.who]());
// Varias propuestas seguidas (p. ej. varios productos) se muestran como una lista: una fila por propuesta, que se abre
// en una vista de edición; las ya guardadas o descartadas quedan como líneas.
const proposalRow = (v, i) => {
  const form = FORMS[v.tool];
  if (v.status !== 'pending') return `<ion-item><ion-icon slot="start" name="${v.status === 'saved' ? 'checkmark-circle' : 'close-circle'}" color="${v.status === 'saved' ? 'success' : 'medium'}"></ion-icon><ion-label class="ion-text-wrap" color="medium">${esc(v.text)}</ion-label></ion-item>`;
  return `<ion-item button="true" data-open="${i}"><ion-icon slot="start" name="${v.bad ? 'alert-circle-outline' : 'create-outline'}" color="${v.bad ? 'danger' : 'primary'}"></ion-icon><ion-label class="ion-text-wrap"><h2 class="medium">${form.title(v.draft)}</h2><p>${esc(form.brief(v.draft))}</p>${v.bad ? '<p><ion-text color="danger">Falta algún dato: ábrela para completarlo</ion-text></p>' : ''}</ion-label></ion-item>`;
};
const proposalList = idx => `
  <ion-list-header><ion-label>Propuestas (${idx.length})</ion-label></ion-list-header>
  <ion-list inset="true">${idx.map(i => proposalRow(chatView[i], i)).join('')}</ion-list>`;
// Los bloques de la conversación, agrupando las propuestas consecutivas en una lista cuando hay varias pendientes.
function chatBlocks() {
  const out = [];
  for (let i = 0; i < chatView.length; i++) {
    if (chatView[i].who === 'proposal') {
      const idx = [];
      for (; i < chatView.length && chatView[i].who === 'proposal'; i++) idx.push(i);
      i--;
      // Lista solo si hay varias pendientes; si no, cada una como tarjeta o línea.
      out.push(idx.filter(i => chatView[i].status === 'pending').length > 1 ? proposalList(idx) : idx.map(i => block(chatView[i], i)).join(''));
    } else out.push(block(chatView[i], i));
  }
  return out.join('');
}

// Vista de edición de una propuesta de la lista: trabaja sobre una copia del borrador; «Guardar» la aplica,
// «Cancelar» deja la propuesta pendiente como estaba y «Descartar propuesta» la descarta.
const proposalEditor = $('#proposal-editor');
let proposalEdit = null; // { i, v } con v una copia de la propuesta
const editBlock = (v, i) => `<div data-proposal="${i}" data-edit="">
  ${FORMS[v.tool].blocks ? FORMS[v.tool].blocks(v.draft) : `<ion-list inset="true">${FORMS[v.tool].fields(v.draft)}</ion-list>`}
  <ion-list inset="true"><ion-item button="true" detail="false" id="proposal-discard"><ion-label color="danger" class="ion-text-center">Descartar propuesta</ion-label></ion-item></ion-list>
</div>`;
function openProposalEditor(i) {
  const v = chatView[i], form = FORMS[v.tool];
  proposalEdit = { i, v: { ...v, draft: structuredClone(v.draft) } };
  $('#proposal-title').innerHTML = form.title(v.draft);
  Object.assign($('#proposal-save'), { textContent: form.danger ?? form.button?.(v.draft) ?? 'Guardar', color: form.danger ? 'danger' : '' });
  $('#proposal-body').innerHTML = editBlock(proposalEdit.v, i);
  proposalEditor.present();
}

// Con varias propuestas pendientes, una fila para guardarlas o descartarlas todas.
const allRow = () => pending().length > 1 ? `<div class="proposal-actions"><ion-button fill="outline" color="medium" data-act="discard-all">Descartar todas</ion-button><ion-button data-act="save-all">Guardar todas (${pending().length})</ion-button></div>` : '';
function renderChat() {
  saveChat();
  const ready = ai.key && ai.model && ai.url;
  charts.forEach(c => c.destroy()); charts = [];
  chatBody.innerHTML = (chatView.length ? chatBlocks() + allRow()
    : `<ion-list inset="true">${empty(ready ? 'Pregunta sobre tus productos, tomas, consumos o costes. También puedo crear o cambiar datos: te lo propongo en un formulario que revisas y guardas.' : 'Configura el asistente en Productos › Asistente (URL base, API key y modelo).')}</ion-list>`)
    + (chatBusy ? '<ion-list inset="true"><ion-item lines="none"><ion-spinner name="dots"></ion-spinner></ion-item></ion-list>'
      : awaiting ? `<ion-list inset="true">${empty('Guarda o descarta las propuestas para continuar; si envías otro mensaje, se descartan.')}</ion-list>`
      : ready ? suggestionList(suggestions(chatView.length ? 3 : 4)) : '');
  $('#chat-send').disabled = chatBusy || !ready;
  drawCharts();
  chatBody.scrollToBottom(200);
}

async function askModel() {
  const res = await fetch(`${ai.url.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` },
    body: JSON.stringify({ model: ai.model, messages: [{ role: 'system', content: systemPrompt() }, ...chat], tools: tools() }),
  });
  if (!res.ok) throw new Error(`El servicio respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const message = (await res.json()).choices?.[0]?.message;
  if (!message) throw new Error('El servicio no devolvió ninguna respuesta.');
  return message;
}

// Historial coherente para el servicio: cada mensaje del asistente con llamadas a herramientas tiene que ir seguido de
// un resultado por llamada. Si falta alguno (una conversación interrumpida), se da por descartado; un resultado suelto se quita.
function repairChat() {
  const out = []; let open = new Map(); // llamadas del último mensaje del asistente: id → contestada
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
// Lo que existe ahora mismo, para que el asistente se corrija cuando se refiere a algo que no está.
const existing = () => state.products.length ? `Los productos que hay ahora son: ${state.products.map(m => `«${m.name}» (id ${m.id})`).join(', ')}.` : 'Ahora mismo no hay ningún producto: si hace falta, créalo.';
// Última fila de cada mensaje: iconos para copiarlo, verlo en una pantalla donde se puede seleccionar el texto (en
// móvil Ionic lo impide en la app) y, si es tuyo, editarlo (pasa a la caja de escribir). Los tuyos, a la derecha; los
// del asistente, a la izquierda.
const textModal = $('#text-view');
const copyText = text => navigator.clipboard.writeText(text).catch(() => {});
const messageButton = (i, act, icon, title) => `<ion-button color="medium" data-msg="${i}" data-msg-act="${act}" aria-label="${title}" title="${title}"><ion-icon slot="icon-only" name="${icon}"></ion-icon></ion-button>`;
const messageBar = (i, mine) => `<ion-item lines="none" class="msg-actions"><ion-buttons slot="${mine ? 'end' : 'start'}">${messageButton(i, 'copy', 'copy-outline', 'Copiar')}${messageButton(i, 'select', 'text-outline', 'Seleccionar texto')}${mine ? messageButton(i, 'edit', 'create-outline', 'Editar') : ''}</ion-buttons></ion-item>`;
const MESSAGE_ACTIONS = {
  copy: v => copyText(v.text),
  // La pantalla «Texto» se abre con todo el texto ya seleccionado.
  select: v => {
    $('#text-body').innerHTML = `<ion-list inset="true"><ion-item lines="none"><ion-label class="ion-text-wrap" id="text-content">${esc(v.text).replace(/\n/g, '<br>')}</ion-label></ion-item></ion-list>`;
    textModal.present().then(() => { const range = document.createRange(); range.selectNodeContents($('#text-content')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); });
  },
  edit: v => { chatInput.value = v.text; chatInput.setFocus(); },
};
$('#text-close').onclick = () => textModal.dismiss();

// Envía la pregunta y atiende las herramientas que pida el asistente hasta que responda con texto.
async function sendChat() {
  const question = String(chatInput.value ?? '').trim();
  if (!question || chatBusy) return;
  chatInput.value = '';
  // Las propuestas pendientes (de este turno o de otra sesión) se dan por descartadas antes de seguir, y el bucle que
  // las esperaba, si lo hay, se cancela: cambiar de época hace que termine sin pedir otra respuesta.
  chatEpoch++; awaiting = false;
  for (const v of pending()) decide(v, false);
  resolvers.clear();
  repairChat();
  chat.push({ role: 'user', content: question });
  chatView.push({ who: 'user', text: question });
  // Las sugerencias se vacían; las nuevas se piden al terminar la respuesta, para que la mitad siga su hilo.
  suggested = []; suggestRequest++; suggestLoading = null;
  const epoch = chatEpoch;
  chatBusy = true; renderChat();
  try {
    for (let turn = 0; turn < 8; turn++) {
      const message = await askModel();
      if (epoch !== chatEpoch) return;
      chat.push({ role: 'assistant', content: message.content ?? '', ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) });
      if (message.content) chatView.push({ who: 'assistant', text: message.content });
      if (!message.tool_calls?.length) break;
      // Cada herramienta pasa a ser una propuesta editable; se espera a que el usuario decida sobre todas.
      const waits = [], seen = new Set();
      for (const call of message.tool_calls) {
        let args = {}; try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
        const key = `${call.function.name} ${call.function.name === 'crear_producto' ? str(args.name).trim().toLowerCase() : call.function.name === 'interfaz' ? str(args.title).trim().toLowerCase() : [args.id, args.moment, args.day].map(str).join('|')}`;
        if (seen.has(key)) { pushToolResult(call.id, 'Llamada repetida: ya has propuesto ese mismo cambio en este turno, no se propone otra vez.'); continue; }
        seen.add(key);
        const form = FORMS[call.function.name], draft = form?.draft(args);
        if (!draft) { pushToolResult(call.id, `No se ha podido proponer: ${form ? `no existe ${call.function.name === 'modificar_momento' ? 'ese momento' : 'ningún producto con ese id'}. ${existing()}` : 'herramienta desconocida.'}`); continue; }
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
  if (epoch === chatEpoch) requestSuggestions(3, []);
  chatBusy = false; renderChat();
}

// ---------- Wiring ----------

function render() {
  renderMomentTabs();
  renderDays();
  renderToma();
  keepScroll($('#manager ion-content'), () => { renderProducts(); renderCosts(); renderMomentRows(); renderPdfMonths(); });
}

$('#day').addEventListener('ionChange', () => { renderMomentTabs(); renderToma(); });
$('#moment').addEventListener('ionChange', renderToma);
// El nombre de una fila de la toma: si ese día ya está tomada, como se tomó; si no, el del producto.
const rowName = id => (state.log.find(e => e.day === selectedDay() && e.moment === selectedMoment() && String(e.id) === id) ?? productOf(id)).name;
// Marcar o desmarcar se confirma en un action sheet; si se cancela, la casilla vuelve a como estaba.
$('#toma').addEventListener('ionChange', e => {
  const { id, moment } = e.target.dataset;
  const { checked } = e.detail;
  sheet(rowName(id), [{ text: checked ? 'Marcar como tomado' : 'Marcar como pendiente', handler: () => toggle(id, moment, checked) }], renderToma);
});
// El (i) de una fila abre la ficha del producto; desde la toma, con la toma de ese día y momento si ya está hecha.
const viewFrom = (e, fromToma) => {
  const id = e.target.closest('[data-view]')?.dataset.view;
  if (id) openView(id, fromToma ? state.log.find(x => x.day === selectedDay() && x.moment === selectedMoment() && String(x.id) === id) : undefined);
  return !!id;
};
$('#toma').addEventListener('click', e => {
  if (viewFrom(e, true)) return;
  // El texto va fuera de la casilla (para ocupar toda la fila); pulsarlo también la marca o desmarca.
  if (e.target.closest('ion-label')) e.target.closest('ion-item').querySelector('ion-checkbox')?.click();
  if (e.target.closest('#toma-sort')) chooseOrder();
  if (e.target.closest('#pending-sort')) { sortingPending = !sortingPending; renderToma(); }
});
// Al soltar, complete() deja la fila en su sitio en pantalla: solo se guarda el orden, sin repintar ni mover el scroll.
$('#toma').addEventListener('ionReorderEnd', e => {
  const moment = selectedMoment();
  reorderPending(moment, move([...e.target.children].map(el => state.products.find(m => m.id === el.dataset.id)), e.detail));
  e.detail.complete();
});

$('#manage').onclick = () => manager.present();
$('#close').onclick = () => manager.dismiss();
$('#sort').onclick = () => {
  $('#list').disabled = !$('#list').disabled;
  $('#sort ion-icon').name = $('#list').disabled ? 'swap-vertical-outline' : 'checkmark-outline';
};
$('#add').onclick = () => openEditor();
$('#open-inactive').onclick = () => inactiveModal.present();
$('#costs').addEventListener('click', e => { if (e.target.closest('#open-shopping')) openShopping(); });
$('#shopping-close').onclick = () => shoppingModal.dismiss();
$('#shopping-body').addEventListener('click', e => viewFrom(e, false));
$('#inactive-close').onclick = () => inactiveModal.dismiss();
$('#inactive-list').addEventListener('click', e => {
  const id = e.target.closest('ion-item')?.dataset.id;
  if (id) openEditor(productOf(id));
});
$('#list').addEventListener('click', e => {
  if (e.target.closest('ion-reorder')) return;
  const id = e.target.closest('ion-item')?.dataset.id;
  if (id) openEditor(productOf(id));
});
// Igual en Productos: no se repinta la lista que se está ordenando; solo la toma, que queda detrás del modal.
$('#list').addEventListener('ionReorderEnd', e => {
  // Se ordenan los activos (los de la lista); los inactivos quedan detrás.
  state.products = [...move(state.products.filter(m => !inactive(m)), e.detail), ...state.products.filter(inactive)];
  e.detail.complete();
  save();
  renderToma();
});

// Momentos: la casilla cambia si es visible; tocar la fila (fuera de la casilla y del asa) abre su editor.
$('#moments').addEventListener('ionChange', e => {
  momentOf(e.target.dataset.moment).visible = e.detail.checked;
  save();
  render();
});
$('#moments').addEventListener('click', e => {
  if (e.target.closest('ion-checkbox')) return;
  const id = e.target.closest('ion-item')?.dataset.moment;
  if (id) openMomentEditor(id);
});
$('#open-record').onclick = () => openRecord(editing);
$('#record-close').onclick = () => recordModal.dismiss();
$('#view-close').onclick = () => viewModal.dismiss();
$('#view-edit').onclick = () => { viewModal.dismiss(); openEditor(productOf(viewing)); };
$('#view-body').addEventListener('click', e => { if (e.target.closest('#view-record')) openRecord(viewing); });
$('#plan-list').addEventListener('click', e => {
  const i = e.target.closest('[data-plan]')?.dataset.plan;
  if (i) openPlan(i === 'new' ? null : Number(i));
});
$('#plan-cancel').onclick = () => planEditor.dismiss();
$('#plan-save').onclick = savePlan;
$('#plan-delete').onclick = () => { plans.splice(editingPlan, 1); renderPlans(); planEditor.dismiss(); };
$('#moment-cancel').onclick = () => momentEditor.dismiss();
momentEditor.addEventListener('ionModalDidDismiss', restoreScroll);
$('#moment-save').onclick = saveMomentEditor;
for (const f of ['start', 'end']) momentField(f).addEventListener('ionInput', () => momentField(f).classList.remove('ion-invalid'));

$('#import').onclick = () => $('#file').click();
$('#file').onchange = e => { importCSV(e.target.files[0]); e.target.value = ''; };
$('#export').onclick = () => download('dosify.csv', exportCSV());
$('#export-pdf').onclick = exportPdfMonth;
$('#clear-log').onclick = () => ask('¿Borrar todas las tomas registradas?', () => { state.log = []; save(); render(); });

$('#cancel').onclick = () => editor.dismiss();
editor.addEventListener('ionModalDidDismiss', restoreScroll);
$('#save').onclick = saveEditor;
$('#delete').onclick = () => ask('¿Eliminar este producto?', () => {
  state.products = state.products.filter(m => m.id !== editing);
  for (const mo of state.moments) mo.order = mo.order.filter(id => id !== editing);
  save();
  render();
  editor.dismiss();
});

$('#assistant').onclick = () => { renderChat(); chatModal.present(); loadLibs().then(renderChat); };
$('#chat-close').onclick = () => chatModal.dismiss();
$('#chat-new').onclick = () => { chatEpoch++; suggested = []; for (const r of resolvers.values()) r(); resolvers.clear(); chat = []; chatView = []; chatBusy = false; awaiting = false; renderChat(); };
$('#chat-send').onclick = sendChat;
// Interacción con las propuestas: campos (se escriben en el borrador), chips (momentos, pautas, visible)
// y botones (guardar, descartar, todas).
const proposalOf = el => { const card = el.closest('[data-proposal]'); return card && { card, v: 'edit' in card.dataset ? proposalEdit.v : chatView[Number(card.dataset.proposal)] }; };
const refreshCard = (card, v) => { card.outerHTML = ('edit' in card.dataset ? editBlock : proposalCard)(v, Number(card.dataset.proposal)); };
// Elementos de una interfaz: casillas, interruptores, radios y selectores escriben su valor en el borrador.
for (const root of [chatBody, $('#proposal-body')]) root.addEventListener('ionChange', e => {
  const p = proposalOf(e.target), key = e.target.dataset.ui; if (!p || p.v.tool !== 'interfaz' || key === undefined) return;
  p.v.draft.values[key] = 'checked' in e.detail ? e.detail.checked : String(e.detail.value ?? '');
  saveChat();
});
for (const root of [chatBody, $('#proposal-body')]) root.addEventListener('ionInput', e => {
  const p = proposalOf(e.target); if (!p) return;
  const { field, plan, row, ui } = e.target.dataset, value = String(e.target.value ?? '');
  if (ui !== undefined) p.v.draft.values[ui] = value;
  if (field) p.v.draft[field] = value;
  if (plan) p.v.draft.plans[Number(row)][plan] = value;
  e.target.classList.remove('ion-invalid'); e.target.errorText = undefined;
  saveChat();
});
for (const root of [chatBody, $('#proposal-body')]) root.addEventListener('click', e => {
  if (e.target.closest('#suggest-more')) { if (!suggestLoading) { const prev = suggested; suggested = []; requestSuggestions(chatView.length ? 3 : 4, prev); } return renderChat(); }
  const msg = e.target.closest('[data-msg-act]');
  if (msg) return MESSAGE_ACTIONS[msg.dataset.msgAct](chatView[Number(msg.dataset.msg)]);
  const q = e.target.closest('[data-suggest]')?.dataset.suggest;
  if (q) { chatInput.value = q; return sendChat(); }
  const open = e.target.closest('[data-open]')?.dataset.open;
  if (open) return openProposalEditor(Number(open));
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'save-all') { for (const v of pending()) { const card = chatBody.querySelector(`[data-proposal="${chatView.indexOf(v)}"]`); v.bad = !trySave(v, card); } return renderChat(); }
  if (act === 'discard-all') { for (const v of pending()) decide(v, false); return renderChat(); }
  const p = proposalOf(e.target); if (!p) return;
  // Botón de una interfaz: aplica al instante (en la vista de edición, por su «Guardar», que vuelca la copia).
  const uiButton = e.target.closest('[data-ui-button]')?.dataset.uiButton;
  if (uiButton !== undefined) { p.v.draft.pressed = uiButton; if ('edit' in p.card.dataset) $('#proposal-save').click(); else if (trySave(p.v, p.card)) renderChat(); return; }
  if (act === 'save') { if (trySave(p.v, p.card)) renderChat(); return; }
  if (act === 'discard') { decide(p.v, false); return renderChat(); }
  const chip = e.target.closest('ion-chip[data-chip]'); if (!chip) return;
  const { chip: kind, value, row } = chip.dataset, d = p.v.draft;
  if (kind === 'pick-moment') { d.moment = value; refreshCard(p.card, p.v); }
  if (kind === 'ui') { const k = chip.dataset.ui, multi = uiElements(d).find(x => x.key === k)?.multiple, cur = d.values[k]; d.values[k] = multi ? (cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value]) : cur === value ? '' : value; refreshCard(p.card, p.v); }
  if (kind === 'visible') { d.visible = !d.visible; chip.outline = !d.visible; chip.color = d.visible ? 'primary' : 'medium'; }
  if (kind === 'add-plan') { d.plans.push({ dose: d.plans.at(-1)?.dose ?? '', start: today(), days: '', moments: d.plans.at(-1)?.moments ?? [] }); refreshCard(p.card, p.v); }
  if (kind === 'plan-moment') { const ps = d.plans[Number(row)]; ps.moments = ps.moments.includes(value) ? ps.moments.filter(x => x !== value) : momentIds().filter(id => id === value || ps.moments.includes(id)); delete ps.bad; refreshCard(p.card, p.v); }
  if (kind === 'remove-plan') { d.plans.splice(Number(row), 1); refreshCard(p.card, p.v); }
  saveChat();
});
$('#proposal-cancel').onclick = () => proposalEditor.dismiss();
$('#proposal-save').onclick = () => {
  const real = chatView[proposalEdit.i], card = $('#proposal-body [data-proposal]');
  if (!trySave(proposalEdit.v, card)) return;
  real.draft = proposalEdit.v.draft; real.status = proposalEdit.v.status; real.text = proposalEdit.v.text; delete real.bad;
  proposalEditor.dismiss(); renderChat();
};
$('#proposal-body').addEventListener('click', e => { if (e.target.closest('#proposal-discard')) { decide(chatView[proposalEdit.i], false); proposalEditor.dismiss(); renderChat(); } });
// Intro envía; Mayúsculas + Intro hace un salto de línea.
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && render());
// Teclado en el navegador (iOS): Ionic no se entera y Safari desplaza la página para ver el campo, con lo que la cabecera
// y media pantalla desaparecen. Con visualViewport, la app se encoge a la zona visible (--keyboard), la página vuelve
// arriba y, en el asistente, la conversación queda al final.
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
renderMomentTabs();
$('#moment').value = momentNow();
render();
// Al cargar, si el asistente está configurado y no hay sugerencias guardadas, se piden en segundo plano.
if (ai.key && ai.model && ai.url) setTimeout(() => { if (!suggestLoading && !suggested.length) requestSuggestions(chatView.length ? 3 : 4, []); }, 1500);
// Al cargar, hoy (el último día) siempre a la vista.
$('#day').componentOnReady().then(() => requestAnimationFrame(() => { $('#day').scrollLeft = $('#day').scrollWidth; }));
