const KEY = 'dosify';
const SLOTS = { M: 'Mañana', T: 'Tarde', N: 'Noche' };
const FIELDS = ['name', 'dose', 'M', 'T', 'N', 'notes', 'refs'];
const HEAD = ['nombre', 'dosis', 'mañana', 'tarde', 'noche', 'indicaciones', 'referencias', 'activa'];
const SEP = ';';
const LOG_MAX = 1000;
const LOG_SHOW = 100;

const state = { meds: [], log: [], ...JSON.parse(localStorage.getItem(KEY)) };
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const active = v => v !== '' && Number(v.replace(',', '.')) !== 0;
const isToday = iso => new Date(iso).toDateString() === new Date().toDateString();
const when = iso => new Date(iso).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const empty = text => `<ion-text color="medium"><p class="ion-text-center ion-padding">${text}</p></ion-text>`;

// ---------- Pautas ----------

const chip = (slot, v) => active(v)
  ? `<ion-chip color="primary">${slot} ${esc(v)}</ion-chip>`
  : `<ion-chip outline="true" color="medium">${slot} 0</ion-chip>`;

const card = m => `
  <ion-card button="true" data-id="${m.id}">
    <ion-card-header>
      <ion-card-title>${esc(m.name)}</ion-card-title>
      <ion-card-subtitle>${m.enabled ? '' : '<ion-badge color="medium">Desactivada</ion-badge> '}${esc(m.dose)}</ion-card-subtitle>
    </ion-card-header>
    <ion-card-content>
      ${m.notes ? `<p>${esc(m.notes)}</p>` : ''}
      ${m.refs ? `<p><ion-note>${esc(m.refs)}</ion-note></p>` : ''}
      ${Object.keys(SLOTS).map(s => chip(s, m[s])).join('')}
    </ion-card-content>
  </ion-card>`;

function renderPautas() {
  const filter = $('#filter').value || 'all';
  const meds = filter === 'all' ? state.meds : state.meds.filter(m => active(m[filter]));
  $('#pautas').innerHTML = meds.map(card).join('') || empty('Sin pautas. Pulsa «Añadir» para crear una.');
}

// ---------- Toma ----------

const doseRow = ({ m, slot, taken }) => `
  <ion-item>
    <ion-checkbox label-placement="end" justify="start" data-id="${m.id}" data-slot="${slot}" ${taken ? 'checked' : ''}>${esc(m.name)}</ion-checkbox>
    <ion-note slot="end">${esc([m[slot], m.dose].filter(Boolean).join(' · '))}</ion-note>
  </ion-item>`;

const logRow = e => `
  <ion-item>
    <ion-icon slot="start" name="${e.taken ? 'checkmark-circle' : 'close-circle'}" color="${e.taken ? 'success' : 'danger'}"></ion-icon>
    <ion-label>${esc(e.name)}<p>${SLOTS[e.slot]} · ${e.taken ? 'Tomada' : 'No tomada'}</p></ion-label>
    <ion-note slot="end">${when(e.at)}</ion-note>
  </ion-item>`;

function renderToma() {
  const todayLog = state.log.filter(e => isToday(e.at));
  const taken = (id, slot) => todayLog.find(e => e.id === id && e.slot === slot)?.taken ?? false;
  const doses = Object.keys(SLOTS).flatMap(slot =>
    state.meds.filter(m => m.enabled && active(m[slot])).map(m => ({ m, slot, taken: taken(m.id, slot) })));
  const done = doses.filter(d => d.taken).length;
  const lists = Object.keys(SLOTS).map(slot => {
    const rows = doses.filter(d => d.slot === slot);
    return rows.length ? `<ion-list><ion-list-header><ion-label>${SLOTS[slot]}</ion-label></ion-list-header>${rows.map(doseRow).join('')}</ion-list>` : '';
  }).join('');

  $('#toma').innerHTML = `
    <ion-card>
      <ion-card-header>
        <ion-card-subtitle>${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</ion-card-subtitle>
        <ion-card-title>${done} de ${doses.length} tomadas</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-progress-bar value="${doses.length ? done / doses.length : 0}" color="${doses.length && done === doses.length ? 'success' : 'primary'}"></ion-progress-bar>
      </ion-card-content>
    </ion-card>
    ${lists || empty('No hay tomas activas para hoy.')}
    <ion-list>
      <ion-list-header><ion-label>Registro</ion-label></ion-list-header>
      ${state.log.slice(0, LOG_SHOW).map(logRow).join('') || empty('Sin registros.')}
    </ion-list>`;
}

function toggle(id, slot, taken) {
  const { name } = state.meds.find(m => m.id === id);
  state.log.unshift({ at: new Date().toISOString(), id, name, slot, taken });
  state.log.length = Math.min(state.log.length, LOG_MAX);
  save();
  render();
}

// ---------- Ajustes ----------

function renderAjustes() {
  $('#order').innerHTML = state.meds.map(m => `
    <ion-item>
      <ion-toggle data-id="${m.id}" ${m.enabled ? 'checked' : ''}>${esc(m.name)}</ion-toggle>
      <ion-reorder slot="end"></ion-reorder>
    </ion-item>`).join('') || empty('Sin pautas.');
}

function ask(header, handler) {
  const alert = $('#confirm');
  alert.header = header;
  alert.buttons = [{ text: 'Cancelar', role: 'cancel' }, { text: 'Aceptar', role: 'destructive', handler }];
  alert.present();
}

// ---------- CSV ----------

const csv = rows => '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(SEP)).join('\r\n');

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

async function importCSV(file) {
  const rows = parseCSV(await file.text());
  if (rows[0]?.[0].toLowerCase() === HEAD[0]) rows.shift();
  const meds = rows.map(r => ({
    id: crypto.randomUUID(),
    ...Object.fromEntries(FIELDS.map((f, i) => [f, r[i] ?? ''])),
    enabled: !['no', '0'].includes((r[FIELDS.length] ?? '').toLowerCase()),
  }));
  if (!meds.length) return;
  const apply = () => { state.meds = meds; save(); render(); };
  state.meds.length ? ask('¿Reemplazar las pautas actuales?', apply) : apply();
}

// ---------- Editor ----------

const editor = $('#editor');
const field = name => $(`[name="${name}"]`, editor);
let editing = null;

function openEditor(med = {}) {
  editing = med.id ?? null;
  FIELDS.forEach(f => field(f).value = med[f] ?? '');
  $('#delete').classList.toggle('ion-hide', !editing);
  editor.present();
}

function saveEditor() {
  const med = Object.fromEntries(FIELDS.map(f => [f, String(field(f).value ?? '').trim()]));
  if (!med.name) return field('name').setFocus();
  if (editing) Object.assign(state.meds.find(m => m.id === editing), med);
  else state.meds.push({ id: crypto.randomUUID(), enabled: true, ...med });
  save();
  render();
  editor.dismiss();
}

// ---------- Wiring ----------

function render() {
  renderPautas();
  renderToma();
  renderAjustes();
}

$('#filter').addEventListener('ionChange', renderPautas);
$('#add').onclick = () => openEditor();
$('#pautas').addEventListener('click', e => {
  const id = e.target.closest('ion-card')?.dataset.id;
  if (id) openEditor(state.meds.find(m => m.id === id));
});

$('#toma').addEventListener('ionChange', e => toggle(e.target.dataset.id, e.target.dataset.slot, e.detail.checked));

$('#order').addEventListener('ionChange', e => {
  state.meds.find(m => m.id === e.target.dataset.id).enabled = e.detail.checked;
  save();
  render();
});
$('#order').addEventListener('ionItemReorder', e => {
  state.meds = e.detail.complete(state.meds);
  save();
  render();
});

$('#import').onclick = () => $('#file').click();
$('#file').onchange = e => { importCSV(e.target.files[0]); e.target.value = ''; };
$('#export').onclick = () => download('pautas.csv', csv([HEAD, ...state.meds.map(m => [...FIELDS.map(f => m[f]), m.enabled ? 'sí' : 'no'])]));
$('#export-log').onclick = () => download('registro.csv', csv([['fecha', 'nombre', 'momento', 'tomada'], ...state.log.map(e => [new Date(e.at).toLocaleString('es'), e.name, SLOTS[e.slot], e.taken ? 'sí' : 'no'])]));
$('#clear-log').onclick = () => ask('¿Borrar todo el registro?', () => { state.log = []; save(); render(); });

$('#cancel').onclick = () => editor.dismiss();
$('#save').onclick = saveEditor;
$('#delete').onclick = () => ask('¿Eliminar esta pauta?', () => {
  state.meds = state.meds.filter(m => m.id !== editing);
  save();
  render();
  editor.dismiss();
});

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && render());
render();
