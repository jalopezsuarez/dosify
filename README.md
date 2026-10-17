# Dosify

App mínima para gestionar pautas de medicación: HTML + JavaScript puro, con [Ionic Framework](https://ionicframework.com) (web components por CDN) como única dependencia. Sin build, sin frameworks, sin CSS propio.

**Web:** https://jalopezsuarez.github.io/dosify/

## Qué hace

- **Toma** (pantalla inicial): pestañas Mañana / Tarde / Noche con las tomas de hoy, un check por fila y un resumen con el porcentaje tomado. Debajo, el **registro** de tomas marcadas (fecha y hora); desmarcar una toma elimina su entrada.
- **Pautas**: lista por Mañana / Tarde / Noche. Cada fila muestra nombre, dosis, la pauta (Mañana · Tarde · Noche), indicaciones y referencias, con un interruptor para activarla o desactivarla (las desactivadas no aparecen en la toma) y un asa para ordenar arrastrando. Tocar la fila la edita; «Añadir» crea una nueva. Al final, el bloque **Datos**: cargar y exportar pautas en CSV, exportar o borrar el registro.

Todo se guarda en el `localStorage` del navegador. No hay servidor ni cuenta.

## Formato CSV

Separador `;` (también acepta `,` al cargar). Primera fila de cabecera opcional. Columnas, en este orden:

```
nombre;dosis;mañana;tarde;noche;indicaciones;referencias;activa
Paracetamol;1 g;1;1;1;Si dolor;;sí
Omeprazol;20 mg;1;0;0;En ayunas;Dr. Ruiz;no
```

Las cantidades son texto libre (`1`, `0,5`, `½`); `0` o vacío significa que no hay toma. `activa` admite `sí`/`no` (vacío = sí). Cargar un CSV reemplaza las pautas actuales (pide confirmación).

## Archivos

- `index.html` — estructura de la interfaz (pestañas, editor, alerta).
- `app.js` — estado, almacenamiento, render y CSV.
