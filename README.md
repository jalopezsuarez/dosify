# Dosify

App mínima para gestionar pautas de medicación: HTML + JavaScript puro, con [Ionic Framework](https://ionicframework.com) 9 (web components por CDN) como única dependencia. Sin build y sin frameworks. Todo se dibuja con componentes, propiedades y clases de utilidad de Ionic; el CSS propio es solo el estrictamente necesario:

- las variables de tema de Ionic para el color principal (#6dd0f9) y dos colores adicionales definidos como documenta Ionic: `teal` (#78b7af, icono de información) y `rose` (#e47969, duración);
- una clase de peso medio para los títulos (Ionic no trae utilidad de `font-weight`);
- ocultar la barra de scroll del selector de días;
- permitir seleccionar texto en la ficha de la pauta (en móvil Ionic lo impide en toda la app).

Tema claro u oscuro según el sistema (paleta `dark.system` de Ionic) y estilo según la plataforma que detecta Ionic: en iOS, listas agrupadas (inset); en Android, Material.

**Web:** https://jalopezsuarez.github.io/dosify/

## Qué hace

### Toma (pantalla principal)

- **Días:** selector con scroll horizontal. Siempre muestra hoy y los 7 días anteriores; de antes, solo los días con al menos una toma registrada. Hoy queda el último y seleccionado al cargar. Cada día lleva un anillo de progreso con «tomadas/total».
- **Franjas:** pestañas Mañana / Tarde / Noche, abiertas en la del momento (06–12 Mañana, 12–18 Tarde, 18–06 Noche). Cada franja muestra un círculo con su porcentaje y «n de m tomadas».
- **Filas:** cada toma va en su propia tarjeta con la casilla a la izquierda, el nombre (peso medio), la dosis, las indicaciones en gris (recortadas a unas dos líneas) y el icono (i) a la derecha. En las tomas ya hechas, la hora va delante de la dosis («09:00 · 1 comprimido»).
- **Marcar y desmarcar:** pulsar la casilla o el texto abre un action sheet: desde Pendiente, «Marcar como tomado»; desde Tomas, «Marcar como pendiente». «Cancelar» (o tocar fuera) deja la toma como estaba.
- **Ficha (i):** dosis, indicaciones y referencias de la pauta. El texto se puede seleccionar y los enlaces (http, https o www.) se pueden pulsar.
- **Pendiente:** las tomas sin marcar, en el *orden de tomas* de la franja. El botón ↕ de su cabecera activa el modo ordenar (asas de arrastre; ✓ para terminar). El orden fijado se guarda en las pautas y vale para esa franja en cualquier día; al ordenar, las tomas ya hechas no cambian de sitio.
- **Tomas:** las marcadas. El botón de su cabecera abre un action sheet para elegir el orden: *Orden de tomas* (por defecto, siempre al abrir la app), *Más reciente arriba*, *Más reciente abajo* u *Orden de pautas*. El icono de la cabecera indica el orden elegido.

### Pautas (botón arriba a la derecha)

- Un único listado, «Pautas (N)». Cada fila muestra el nombre, la duración si la tiene en rosa bajo el nombre («7 días · hasta el …» o «Finalizada el …»), la dosis, las indicaciones en gris y los chips Mañana · Tarde · Noche (coloreados los activos).
- Tocar una fila la edita; «Añadir» crea una nueva. El botón ↕ de la cabecera muestra las asas para ordenar las pautas (✓ para terminar). Este *orden de pautas* es independiente del orden de tomas de cada franja.
- **Editor**, en secciones: Medicamento (nombre, dosis, indicaciones), Tiempo (duración en días: al cumplirse, la pauta se desactiva sola y deja de aparecer en la toma; sin duración no caduca), Tomas (Mañana, Tarde, Noche), Notas (referencias) y Eliminar.
- **Datos:** cargar y exportar un único CSV con pautas y tomas, y borrar el registro de tomas.

Al soltar una fila tras arrastrarla, solo se guarda el nuevo orden: la lista no se repinta, así el scroll no salta.

Todo se guarda en el `localStorage` del navegador. No hay servidor ni cuenta.

## Orden

Hay dos órdenes, los dos guardados en las propias pautas:

- **Orden de pautas:** el orden del listado de pautas.
- **Orden de tomas:** uno por franja. Cada pauta guarda su posición en Mañana, Tarde y Noche (`oM`, `oT`, `oN`: 1, 2, 3…). Las pautas sin posición (por ejemplo, recién creadas) van al final, en el orden de pautas.

## Formato CSV

Un solo fichero con pautas y tomas. Separador `;` (también acepta `,` al cargar), una cabecera, y una columna `tipo` que indica qué es cada fila: primero las filas `pauta`, después las filas `toma`.

```
tipo;nombre;dosis;mañana;tarde;noche;indicaciones;referencias;inicio;dias;orden mañana;orden tarde;orden noche;fecha;hora;momento
pauta;Paracetamol;1 comprimido de 500 mg;sí;sí;sí;Si dolor;;;;2;1;1;;;
pauta;Omeprazol;20 mg;sí;no;no;En ayunas;Dr. Ruiz;2026-10-17;14;1;;;;;
toma;Paracetamol;;;;;;;;;;;;2026-10-17;08:12;Mañana
toma;Paracetamol;;;;;;;;;;;;2026-10-17;15:30;Tarde
```

- Filas `pauta`: `mañana`, `tarde` y `noche` admiten `sí`/`no` (también `1`/`0`). `inicio` (`AAAA-MM-DD`) y `dias` definen la duración; vacíos, la pauta no caduca. `orden mañana`, `orden tarde` y `orden noche` son la posición de la pauta en el orden de tomas de cada franja; vacías, va al final. El orden de las filas `pauta` es el orden de pautas.
- Filas `toma`: `nombre` de la pauta, `fecha` en formato `AAAA-MM-DD`, `hora` en `HH:MM` y `momento` (`Mañana`, `Tarde` o `Noche`). Se enlazan a la pauta por su nombre.
- Al cargar, las columnas se buscan por su nombre en la cabecera, así que también vale un CSV del formato anterior (sin columnas de orden) o con las columnas en otro orden.
- Cargar un CSV reemplaza las pautas y las tomas actuales (pide confirmación). «Borrar registro de tomas» elimina solo las tomas.

## Archivos

- `index.html` — estructura de la interfaz (toma, gestor de pautas, editor, ficha, alerta y action sheet) y el CSS mínimo.
- `app.js` — estado, almacenamiento, render, orden y CSV.
