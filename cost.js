const log = async (ok, msg) => { const m = `${ok === null ? '▶' : ok ? '✅' : '❌'} ${msg}`; console.log(m); await fetch('/__test__/' + encodeURIComponent(m)).catch(() => {}); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const st = () => JSON.parse(localStorage.dosify);
const ringColor = el => el.querySelector('ion-text').getAttribute('color');
const dayBtn = n => [...document.querySelectorAll('#day ion-segment-button')].at(-1 - n);
const big = () => document.querySelector('#toma ion-list ion-item div[slot=start]');
const sh = () => document.querySelector('#sheet');
const ed = () => document.querySelector('#editor');
async function step1() {
  await log(null, 'Anillos de los días');
  await log(ringColor(dayBtn(0)) === 'orange' && ringColor(dayBtn(1)) === 'primary', `hoy ${ringColor(dayBtn(0))} (${dayBtn(0).querySelector('text').textContent}), ayer ${ringColor(dayBtn(1))}`);
  await log(ringColor(big()) === 'orange', `anillo grande de hoy: ${ringColor(big())}`);
  await log(null, 'Marco todas las tomas de hoy (los tres intervalos)');
  for (const slot of ['i1', 'i2', 'i3']) {
    document.querySelector(`#slot ion-segment-button[value=${slot}]`).click(); await wait(600);
    for (;;) { const cb = document.querySelector('#toma ion-checkbox:not([checked])'); if (!cb || cb.checked) break; cb.click(); await wait(600); [...sh().querySelectorAll('button')].find(b => b.textContent.trim() === 'Marcar como tomado').click(); await wait(800); }
  }
  await log(ringColor(dayBtn(0)) === 'success' && ringColor(big()) === 'success', `todo tomado: día ${ringColor(dayBtn(0))} (${dayBtn(0).querySelector('text').textContent}), grande ${ringColor(big())}`);
  dayBtn(1).click(); await wait(700);
  await log(ringColor(big()) === 'primary', `al ver ayer, anillo grande ${ringColor(big())}`);
  await log(null, 'Costes');
  document.querySelector('#manage').click(); await wait(1200);
  const hdrs = [...document.querySelectorAll('#manager ion-list-header ion-label')].map(l => l.textContent.trim());
  await log(hdrs.join() === 'Pautas (5),Costes,Intervalos,Datos,Exportar,Zona peligrosa', `secciones: ${hdrs.join(' · ')}`);
  const rows = [...document.querySelectorAll('#costs ion-item')].map(i => `${ringColor(i)} ${i.querySelector('text').textContent} · ${i.querySelector('h2').textContent} · ${i.querySelector('p').textContent}`);
  for (const r of rows) await log(true, r);
  await log(rows[0] === 'orange 75% · 37 € en total · 3 de 4 productos con coste' && rows[1].startsWith('orange 50% · 84,00 € al mes · 2,80 € al día · 2 de 4'), 'importes y anillos correctos');
  await log(null, 'Editor: Producto, Intervalos, coste y dosis');
  [...document.querySelectorAll('#list ion-item')].find(i => i.querySelector('h2').textContent === 'D').querySelector('h2').click(); await wait(900);
  const eh = [...ed().querySelectorAll('ion-list-header ion-label')].map(l => l.textContent.trim()).join(' · ');
  await log(eh === 'Producto · Tiempo · Intervalos · Notas', `secciones del editor: ${eh}`);
  ed().querySelector('[name=cost]').value = '3,5'; document.querySelector('#save').click(); await wait(800);
  await log(!ed().classList.contains('overlay-hidden') && ed().querySelector('[name=cost]').classList.contains('ion-invalid'), 'coste «3,5»: no guarda, marcado en rojo');
  ed().querySelector('[name=cost]').value = '8'; ed().querySelector('[name=units]').value = '0'; document.querySelector('#save').click(); await wait(800);
  await log(!ed().classList.contains('overlay-hidden') && ed().querySelector('[name=units]').classList.contains('ion-invalid'), 'dosis por envase «0»: no guarda');
  ed().querySelector('[name=units]').value = '20'; document.querySelector('#save').click(); await wait(1000);
  const d = st().meds.find(m => m.id === 'd');
  await log(d.cost === 8 && d.units === 20, `D guardada: ${d.cost} € / ${d.units} dosis`);
  [...document.querySelectorAll('#list ion-item')].find(i => i.querySelector('h2').textContent === 'C').querySelector('h2').click(); await wait(900);
  ed().querySelector('[name=units]').value = '10'; document.querySelector('#save').click(); await wait(1000);
  const rows2 = [...document.querySelectorAll('#costs ion-item')].map(i => `${ringColor(i)} ${i.querySelector('text').textContent} · ${i.querySelector('h2').textContent} · ${i.querySelector('p').textContent}`);
  for (const r of rows2) await log(true, r);
  await log(rows2[0].startsWith('success 100% · 45 €') && rows2[1].startsWith('success 100% · 111,00 € al mes · 3,70 € al día'), 'con todas completas, anillos verdes');
  await log(null, 'CSV');
  let blob; const orig = URL.createObjectURL; URL.createObjectURL = x => (blob = x, orig(x)); HTMLAnchorElement.prototype.click = function () {};
  document.querySelector('#export').click(); await wait(300);
  const text = (await blob.text()).replace('﻿', '');
  for (const l of text.split('\r\n').filter(l => /^"(tipo|pauta)"/.test(l))) await log(true, l);
  sessionStorage.csv = text; sessionStorage.before = JSON.stringify(st().meds.map(m => [m.id, m.cost, m.units])); sessionStorage.cstep = 2; localStorage.removeItem('dosify'); location.reload();
}
async function step2() {
  const dt = new DataTransfer(); dt.items.add(new File([sessionStorage.csv], 'x.csv')); const f = document.querySelector('#file'); f.files = dt.files; f.dispatchEvent(new Event('change')); await wait(1200);
  const after = JSON.stringify(st().meds.map(m => [m.id, m.cost, m.units]));
  await log(after === sessionStorage.before, `CSV ida y vuelta: ${after}`);
  delete sessionStorage.cstep; delete sessionStorage.csv; delete sessionStorage.before;
  await log(null, 'FIN');
}
(async () => { await wait(2500); try { await (sessionStorage.cstep ? step2 : step1)(); } catch (e) { await log(false, e.message + ' ' + e.stack.split('\n')[1]); } })();
