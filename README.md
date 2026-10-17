# Dosify

App mínima para gestionar pautas de medicación: HTML + JavaScript puro, con [Ionic Framework](https://ionicframework.com) (web components por CDN) como única dependencia. Sin build, sin frameworks, sin CSS propio. Modo oscuro fijo (paleta `dark.always` de Ionic).

**Web:** https://jalopezsuarez.github.io/dosify/

## Qué hace

- **Toma** (única pantalla): pestañas Mañana / Tarde / Noche, abiertas en la franja del momento. Cada franja muestra su porcentaje tomado, «n de m tomadas» y las tomas con un check por fila. Debajo, el **registro** de tomas marcadas (fecha y hora); desmarcar una toma elimina su entrada.
- **Pautas** (botón arriba a la derecha): lista por Mañana / Tarde / Noche. Cada fila muestra nombre, dosis, en qué franjas se toma (chips Mañana · Tarde · Noche con check), indicaciones y referencias, con un interruptor para activarla o desactivarla (las desactivadas no aparecen en la toma) y un asa para ordenar arrastrando. Tocar la fila la edita; «Añadir» crea una nueva. Al final, el bloque **Datos**: cargar y exportar pautas en CSV, exportar o borrar el registro.

Todo se guarda en el `localStorage` del navegador. No hay servidor ni cuenta.

## Formato CSV

Separador `;` (también acepta `,` al cargar). Primera fila de cabecera opcional. Columnas, en este orden:

```
nombre;dosis;mañana;tarde;noche;indicaciones;referencias;activa
Paracetamol;1 comprimido de 500 mg;sí;sí;sí;Si dolor;;sí
Omeprazol;20 mg;sí;no;no;En ayunas;Dr. Ruiz;no
```

`mañana`, `tarde`, `noche` y `activa` admiten `sí`/`no` (también `1`/`0`; en `activa`, vacío = sí). Cargar un CSV reemplaza las pautas actuales (pide confirmación).

## Archivos

- `index.html` — estructura de la interfaz (toma, gestor de pautas, editor, alerta).
- `app.js` — estado, almacenamiento, render y CSV.
