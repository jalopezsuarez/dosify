# Dosify

App mínima para gestionar pautas de medicación: HTML + JavaScript puro, con [Ionic Framework](https://ionicframework.com) (web components por CDN) como única dependencia. Sin build, sin frameworks y sin CSS propio, salvo las variables de tema de Ionic que fijan el color principal (#56bde3) y un color adicional (#78b7af) para el icono de información, definidos como documenta Ionic. Tema claro u oscuro según el sistema (paleta `dark.system` de Ionic) y estilo según la plataforma que detecta Ionic: en iOS, listas agrupadas (inset); en Android, Material.

**Web:** https://jalopezsuarez.github.io/dosify/

## Qué hace

- **Toma** (única pantalla):
  - Selector de días con scroll horizontal: hoy centrado, los últimos 30 días a la izquierda y los próximos en gris, no seleccionables. Cada día pasado lleva un anillo de progreso con «tomadas/total». Tocar un día muestra sus tomas y su registro.
  - Pestañas Mañana / Tarde / Noche, abiertas en la franja del momento (06–12 Mañana, 12–18 Tarde, 18–06 Noche). Cada franja muestra un círculo de progreso con su porcentaje, «n de m tomadas» y las tomas con un check por fila (la dosis debajo del nombre). El icono (i) de la izquierda de cada toma abre una ficha con la dosis, las indicaciones y las referencias de la pauta; los enlaces (http, https o www.) se pueden pulsar.
  - Debajo, el **Registro** del día elegido en tres grupos (Noche arriba, luego Tarde y Mañana), cada toma con su franja y su hora. Desmarcar una toma elimina su entrada.
- **Pautas** (botón arriba a la derecha): lista por Mañana / Tarde / Noche, siempre abierta en Mañana. Cada fila muestra nombre, dosis, en qué franjas se toma (chips Mañana · Tarde · Noche, coloreados los activos), indicaciones y referencias, y, a la derecha, un interruptor para activarla o desactivarla (las desactivadas no aparecen en la toma) junto al asa para ordenar arrastrando. Tocar la fila la edita; «Añadir» crea una nueva. El editor va en secciones: Medicamento, Tomas, Notas y Eliminar. Al final del gestor, el bloque **Datos**: cargar y exportar un único CSV con pautas y tomas, y borrar el registro de tomas.

Todo se guarda en el `localStorage` del navegador. No hay servidor ni cuenta.

## Formato CSV

Un solo fichero con pautas y tomas. Separador `;` (también acepta `,` al cargar), una cabecera, y una columna `tipo` que indica qué es cada fila: primero las filas `pauta`, después las filas `toma`.

```
tipo;nombre;dosis;mañana;tarde;noche;indicaciones;referencias;activa;fecha;hora;momento
pauta;Paracetamol;1 comprimido de 500 mg;sí;sí;sí;Si dolor;;sí;;;
pauta;Omeprazol;20 mg;sí;no;no;En ayunas;Dr. Ruiz;no;;;
toma;Paracetamol;;;;;;;;2026-10-17;08:12;Mañana
toma;Paracetamol;;;;;;;;2026-10-17;15:30;Tarde
```

- Filas `pauta`: `mañana`, `tarde`, `noche` y `activa` admiten `sí`/`no` (también `1`/`0`; en `activa`, vacío = sí).
- Filas `toma`: `nombre` de la pauta, `fecha` en formato `AAAA-MM-DD`, `hora` en `HH:MM` y `momento` (`Mañana`, `Tarde` o `Noche`). Se enlazan a la pauta por su nombre.
- Cargar un CSV reemplaza las pautas y las tomas actuales (pide confirmación). «Borrar registro de tomas» elimina solo las tomas.

## Archivos

- `index.html` — estructura de la interfaz (toma, gestor de pautas, editor, alerta).
- `app.js` — estado, almacenamiento, render y CSV.
