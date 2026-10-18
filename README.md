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

- **Días:** selector con scroll horizontal. Siempre muestra hoy y los 7 días anteriores; de antes, hasta 30 días atrás, solo los días con al menos una toma registrada. Hoy queda el último y seleccionado al cargar. Cada día lleva un anillo de progreso con «tomadas/total».
- **Intervalos:** una pestaña por cada intervalo visible, con su nombre y en el orden configurado en Pautas › Intervalos. Al cargar se abre el intervalo cuyas horas incluyen la hora actual; si ninguno la incluye, el próximo en empezar; si no tienen horas, el primero. Cada intervalo muestra un círculo con su porcentaje y «n de m tomadas».
- **Filas:** cada toma va en su propia tarjeta con la casilla a la izquierda, el nombre (peso medio), la dosis, las indicaciones en gris (recortadas a unas dos líneas) y el icono (i) a la derecha. En las tomas ya hechas, la hora va delante de la dosis («09:00 · 1 comprimido»).
- **Marcar y desmarcar:** pulsar la casilla o el texto abre un action sheet: desde Pendiente, «Marcar como tomado»; desde Tomas, «Marcar como pendiente». «Cancelar» (o tocar fuera) deja la toma como estaba.
- **Ficha (i):** dosis, indicaciones y referencias de la pauta. El texto se puede seleccionar y los enlaces (http, https o www.) se pueden pulsar.
- **Pendiente:** las tomas sin marcar, en el *orden de tomas* del intervalo. El botón ↕ de su cabecera activa el modo ordenar (asas de arrastre; ✓ para terminar). El orden fijado se guarda en las pautas y vale para ese intervalo en cualquier día; al ordenar, las tomas ya hechas no cambian de sitio.
- **Tomas:** las marcadas. El botón de su cabecera abre un action sheet para elegir el orden: *Orden de tomas* (por defecto, siempre al abrir la app), *Más reciente arriba*, *Más reciente abajo* u *Orden de pautas*. El icono de la cabecera indica el orden elegido.

### Pautas (botón arriba a la derecha)

- Un único listado, «Pautas (N)». Cada fila muestra el nombre, la duración si la tiene en rosa bajo el nombre («7 días · hasta el …» o «Finalizada el …»), la dosis, las indicaciones en gris y un chip por intervalo visible (coloreados los de la pauta).
- Tocar una fila la edita; «Añadir» crea una nueva. El botón ↕ de la cabecera muestra las asas para ordenar las pautas (✓ para terminar). Este *orden de pautas* es independiente del orden de tomas de cada intervalo.
- **Editor**, en secciones: Medicamento (nombre, dosis, indicaciones), Tiempo (duración en días: al cumplirse, la pauta se desactiva sola y deja de aparecer en la toma; sin duración no caduca), Tomas (una casilla por intervalo visible; los ocultos conservan su valor), Notas (referencias) y Eliminar.
- **Intervalos:** los tres intervalos de toma, con una casilla a la izquierda para mostrarlos u ocultarlos y un asa a la derecha para reordenarlos. Tocar la fila abre su editor: nombre (puede quedar vacío; entonces se muestran sus horas o «Sin nombre»), hora de inicio y hora de fin, opcionales, en horas enteras de 0 a 24 (por ejemplo, 18 y 21). Un intervalo puede pasar de medianoche (22 a 6). Por defecto: Desayuno (6–12), Almuerzo (12–18) y Cena (18–24). Su nombre, orden y visibilidad se reflejan en las pestañas de la toma, en los chips y en el editor de pautas.
- **Datos:** cargar y exportar un único CSV con intervalos, pautas y tomas.
- **Exportar:** «Exportar mes» abre un action sheet con los meses de los últimos 6 que tienen al menos una toma (del más reciente, elegido por defecto, al más antiguo; si no hay ninguno, la exportación queda desactivada) y «Exportar PDF» descarga el registro de ese mes en PDF (A4) con la plantilla *Medication log*: título, mes y una tabla con fecha, hora, medicamento, dosis y notas (las indicaciones de la pauta). Cada celda ocupa como mucho dos líneas; lo que no cabe se recorta con «…». Si hay más tomas de las que caben, sigue en más páginas. El PDF se genera en el navegador, sin librerías, con las fuentes estándar Helvetica.
- **Zona peligrosa:** «Borrar registro de tomas».

Al soltar una fila tras arrastrarla, solo se guarda el nuevo orden: la lista no se repinta, así el scroll no salta.

Todo se guarda en el `localStorage` del navegador. No hay servidor ni cuenta.

## Intervalos

Internamente hay siempre tres intervalos fijos, identificados por su código: `i1`, `i2` e `i3`. Las pautas, las tomas, el orden y el CSV usan solo esos códigos; el nombre que se ve es el configurado en cada intervalo, así que renombrarlos o reordenarlos no cambia ningún dato. Los datos guardados por versiones anteriores no se convierten: lo que les falte (intervalos, campos de las pautas) toma su valor por defecto.

## Orden

Hay tres órdenes, guardados en los propios datos:

- **Orden de intervalos:** el orden de la lista de intervalos (pestañas, chips y editor).
- **Orden de pautas:** el orden del listado de pautas.
- **Orden de tomas:** uno por intervalo. Cada pauta guarda su posición en cada intervalo (`o1`, `o2`, `o3`: 1, 2, 3…). Las pautas sin posición (por ejemplo, recién creadas) van al final, en el orden de pautas.

## Formato CSV

Un solo fichero con todo. Separador `;` (también acepta `,` al cargar), una cabecera, y una columna `tipo` que indica qué es cada fila: primero las filas `intervalo`, luego las filas `pauta` y al final las filas `toma`. Cada tipo usa solo sus columnas; las demás van vacías.

```
tipo;nombre;intervalo;hora inicio;hora fin;visible;dosis;i1;i2;i3;indicaciones;referencias;inicio;dias;orden i1;orden i2;orden i3;fecha;hora
intervalo;Desayuno;i1;6;12;sí;;;;;;;;;;;;;
intervalo;Almuerzo;i2;12;18;sí;;;;;;;;;;;;;
intervalo;Cena;i3;18;24;sí;;;;;;;;;;;;;
pauta;Paracetamol;;;;;1 comprimido de 500 mg;sí;sí;sí;Si dolor;;;;2;1;1;;
pauta;Omeprazol;;;;;20 mg;sí;no;no;En ayunas;Dr. Ruiz;2026-10-17;14;1;;;;
toma;Paracetamol;i1;;;;;;;;;;;;;;;2026-10-17;08:12
toma;Paracetamol;i2;;;;;;;;;;;;;;;2026-10-17;15:30
```

- Filas `intervalo`: `intervalo` es el código (`i1`, `i2` o `i3`); `nombre` (puede ir vacío), `hora inicio` y `hora fin` (horas enteras de 0 a 24, opcionales) y `visible` (`sí`/`no`). El orden de estas filas es el orden de los intervalos.
- Filas `pauta`: `i1`, `i2` e `i3` indican en qué intervalos se toma (`sí`/`no`, también `1`/`0`). `inicio` (`AAAA-MM-DD`) y `dias` definen la duración; vacíos, la pauta no caduca. `orden i1`, `orden i2` y `orden i3` son la posición de la pauta en el orden de tomas de cada intervalo; vacías, va al final. El orden de las filas `pauta` es el orden de pautas.
- Filas `toma`: `nombre` de la pauta, `intervalo` (código), `fecha` en formato `AAAA-MM-DD` y `hora` en `HH:MM`. Se enlazan a la pauta por su nombre.
- Al cargar, las columnas se buscan por su nombre en la cabecera, así que el orden de las columnas da igual. Si el CSV no trae filas `intervalo`, se conservan los intervalos actuales.
- Cargar un CSV reemplaza los intervalos, las pautas y las tomas actuales (pide confirmación). «Borrar registro de tomas» elimina solo las tomas.

## Archivos

- `index.html` — estructura de la interfaz (toma, gestor de pautas con intervalos, editores de pauta y de intervalo, ficha, alerta y action sheet) y el CSS mínimo.
- `app.js` — estado, almacenamiento, intervalos, render, orden y CSV.
