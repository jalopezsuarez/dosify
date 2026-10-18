# Dosify

App mínima para gestionar pautas de medicación: HTML + JavaScript puro, con [Ionic Framework](https://ionicframework.com) 9 (web components por CDN) como única dependencia. Sin build y sin frameworks. Todo se dibuja con componentes, propiedades y clases de utilidad de Ionic; el CSS propio es solo el estrictamente necesario:

- las variables de tema de Ionic para el color principal (#6dd0f9) y dos colores adicionales definidos como documenta Ionic: `teal` (#78b7af, icono de información) y `rose` (#e47969, duración);
- una clase de peso medio para los títulos (Ionic no trae utilidad de `font-weight`);
- ocultar la barra de scroll del selector de días;
- permitir seleccionar texto en la ficha de la pauta (en móvil Ionic lo impide en toda la app).

Tema claro u oscuro según el sistema (paleta `dark.system` de Ionic) y estilo según la plataforma que detecta Ionic: en iOS, listas agrupadas (inset); en Android, Material.

**Web:** https://jalopezsuarez.github.io/dosify/

Se puede instalar como app: en iOS, Safari › Compartir › «Añadir a pantalla de inicio»; en Android, Chrome › «Instalar app».

## Qué hace

### Toma (pantalla principal)

- **Días:** selector con scroll horizontal. Siempre muestra hoy y los 7 días anteriores; de antes, hasta 30 días atrás, solo los días con al menos una toma registrada. Hoy queda el último y seleccionado al cargar. Cada día lleva un anillo de progreso con «tomadas/total».
- **Intervalos:** una pestaña por cada intervalo visible, con su nombre y en el orden configurado en Pautas › Intervalos. Al cargar se abre el intervalo cuyas horas incluyen la hora actual; si ninguno la incluye, el próximo en empezar; si no tienen horas, el primero. Cada intervalo muestra un círculo con su porcentaje y «n de m tomadas».
- **Filas:** cada toma va en su propia tarjeta con la casilla a la izquierda, el nombre (peso medio), la dosis, las indicaciones en gris (recortadas a unas dos líneas) y el icono (i) a la derecha. En las tomas ya hechas, la hora va delante de la dosis («09:00 · 1 comprimido»).
- **Marcar y desmarcar:** pulsar la casilla o el texto abre un action sheet: desde Pendiente, «Marcar como tomado»; desde Tomas, «Marcar como pendiente». «Cancelar» (o tocar fuera) deja la toma como estaba.
- **Ficha (i):** dosis, indicaciones y referencias de la pauta (en una toma ya hecha, tal como se tomó). El texto se puede seleccionar y los enlaces (http, https o www.) se pueden pulsar.
- **Pendiente:** las tomas sin marcar, en el *orden de tomas* del intervalo. El botón ↕ de su cabecera activa el modo ordenar (asas de arrastre; ✓ para terminar). El orden fijado se guarda en el intervalo y vale para él en cualquier día; al ordenar, las tomas ya hechas no cambian de sitio.
- **Tomas:** las marcadas. El botón de su cabecera abre un action sheet para elegir el orden: *Orden de tomas* (por defecto, siempre al abrir la app), *Más reciente arriba*, *Más reciente abajo* u *Orden de pautas*. El icono de la cabecera indica el orden elegido.

### Pautas (botón arriba a la derecha)

- Un único listado, «Pautas (N)». Cada fila muestra el nombre, su fin de vigencia si lo tiene, en rosa bajo el nombre («7 días · hasta el …», o «Finalizada el …» en gris si ya terminó), la dosis, las indicaciones en gris y un chip por intervalo visible (coloreados los de la pauta).
- Tocar una fila la edita; «Añadir» crea una nueva. El botón ↕ de la cabecera muestra las asas para ordenar las pautas (✓ para terminar). Este *orden de pautas* es independiente del orden de tomas de cada intervalo.
- **Editor**, en secciones: Medicamento (nombre, dosis, indicaciones), Tiempo (duración en días desde hoy: al cumplirse, la pauta termina y deja de aparecer en la toma de los días siguientes; sin duración no caduca), Tomas (una casilla por intervalo visible; los ocultos conservan su valor), Notas (referencias) y Eliminar. La pauta siempre se cambia en su sitio (no se duplica). Si cambian el nombre, la dosis o las indicaciones y la pauta tiene tomas de días anteriores, un action sheet pregunta si se aplica **a partir de hoy** (las tomas anteriores siguen mostrando cómo se tomaron) o **a todo el registro** (también se cambian las tomas anteriores). Las tomas de hoy siempre pasan a mostrar la pauta nueva.
- **Intervalos:** los tres intervalos de toma, con una casilla a la izquierda para mostrarlos u ocultarlos y un asa a la derecha para reordenarlos. Tocar la fila abre su editor: nombre (puede quedar vacío; entonces se muestran sus horas o «Sin nombre»), hora de inicio y hora de fin, opcionales, en horas enteras de 0 a 24 (por ejemplo, 18 y 21). Un intervalo puede pasar de medianoche (22 a 6). Por defecto: Desayuno (6–12), Almuerzo (12–18) y Cena (18–24). Su nombre, orden y visibilidad se reflejan en las pestañas de la toma, en los chips y en el editor de pautas.
- **Datos:** cargar y exportar un único CSV con intervalos, pautas y tomas.
- **Exportar:** «Seleccionar mes» abre un action sheet con los meses de los últimos 6 que tienen al menos una toma (del más reciente, elegido por defecto, al más antiguo; si no hay ninguno, la exportación queda desactivada) y «Exportar PDF» descarga el registro de ese mes en PDF (A4) con la plantilla *Medication log*: título, mes y una tabla con fecha, hora, medicamento, dosis y notas (las indicaciones de la pauta). Cada celda ocupa como mucho dos líneas; lo que no cabe se recorta con «…». Si hay más tomas de las que caben, sigue en más páginas. El PDF se genera en el navegador, sin librerías, con las fuentes estándar Helvetica.
- **Zona peligrosa:** «Borrar registro de tomas».

Al soltar una fila tras arrastrarla, solo se guarda el nuevo orden: la lista no se repinta, así el scroll no salta.

Todo se guarda en el `localStorage` del navegador. No hay servidor ni cuenta.

## Datos

Tres listas en el `localStorage`:

- **Intervalos**, en su orden: `id` (código fijo: `i1`, `i2`, `i3`), `name`, `start` y `end` (horas), `visible` y `order` (los `id` de pauta en el orden de tomas de ese intervalo). Los intervalos salen de una lista en el código, así que para tener 4 o 5 basta con añadirlos allí; todo lo demás (pestañas, chips, editor, orden, CSV) los recorre.
- **Pautas**, en el orden de pautas: `id`, `name`, `dose`, `notes` (indicaciones), `refs` (referencias), `slots` (los `id` de sus intervalos) y `from` y `to`, el primer y el último día en que está vigente (vacíos, sin límite; una pauta sin `from` aparece también en los días anteriores a su creación).
- **Tomas**: `at` (cuándo se marcó), `day` (el día de la toma), `id` (de la pauta), `slot` (`id` del intervalo) y `name`, `dose` y `notes`: la pauta tal como se tomó. Así el registro (la toma, el PDF, el CSV) muestra lo que se tomó aunque la pauta cambie, cambie de intervalo o se borre.

El nombre que se ve de cada intervalo es el configurado, así que renombrarlos o reordenarlos no cambia ningún dato. Cada día de la toma muestra como pendientes las pautas vigentes ese día y como tomadas sus tomas.

No hay compatibilidad con formatos anteriores. Al abrir la app y al cargar un CSV, los datos pasan por la misma limpieza: lo que falte o no cuadre toma su valor por defecto (intervalos que falten, los de por defecto; textos, fechas u horas no válidos, vacíos; intervalos inexistentes, quitados) y se descartan las pautas sin nombre y las tomas que no se entienden.

## Orden

- **Orden de intervalos:** el orden de la lista de intervalos (pestañas, chips y editor).
- **Orden de pautas:** el orden del listado de pautas.
- **Orden de tomas:** uno por intervalo, su lista `order`. Las pautas que no están en ella (por ejemplo, recién creadas) van al final, en el orden de pautas.

## Formato CSV

Un solo fichero con todo: intervalos, pautas y tomas. Separador `;`, una cabecera y 12 columnas compartidas; cada tipo de fila usa las suyas y deja las demás vacías.

```
tipo;id;nombre;intervalos;desde;hasta;fecha;dosis;indicaciones;referencias;visible;orden
intervalo;i1;Desayuno;;6;12;;;;;sí;p2 p1
intervalo;i2;Almuerzo;;12;18;;;;;sí;
intervalo;i3;Cena;;18;24;;;;;sí;
pauta;p1;Paracetamol;i1 i2 i3;;;;1 comprimido de 500 mg;Si dolor;;;
pauta;p2;Omeprazol;i1;2026-10-10;2026-10-30;;20 mg;En ayunas;Dr. Ruiz;;
toma;p1;Paracetamol;i1;;;2026-10-17 08:12;1 comprimido de 500 mg;Si dolor;;;
toma;p2;Omeprazol;i1;;;2026-10-16 08:05;40 mg;En ayunas;;;
toma;p2;Omeprazol;i1;;;2026-10-17 08:03;20 mg;En ayunas;;;
```

- `intervalo`: `id` (código), `nombre` (puede ir vacío), `desde` y `hasta` (horas enteras de 0 a 24, opcionales), `visible` (`sí`/`no`) y `orden` (los `id` de pauta en el orden de tomas, separados por espacios). El orden de estas filas es el de los intervalos.
- `pauta`: `id`, `nombre`, `intervalos` (sus códigos, separados por espacios), `desde` y `hasta` (días de vigencia en `AAAA-MM-DD`; vacíos, sin límite), `dosis`, `indicaciones` y `referencias`. El orden de estas filas es el orden de pautas.
- `toma`: `id` de la pauta, `intervalos` (el de la toma), `fecha` (`AAAA-MM-DD HH:MM`) y la pauta tal como se tomó: `nombre`, `dosis` e `indicaciones`. En el ejemplo, el Omeprazol cambió de 40 a 20 mg «a partir de hoy» el 17: es una sola pauta y cada toma conserva su dosis.
- Al cargar, las columnas se buscan por su nombre en la cabecera, así que su orden da igual. No hay compatibilidad con formatos anteriores: lo que falte o no cuadre toma su valor por defecto (intervalos que falten, los de por defecto; fechas u horas mal escritas, vacías) y las filas que no se entienden se ignoran.
- Cargar un CSV reemplaza los intervalos, las pautas y las tomas actuales (pide confirmación). «Borrar registro de tomas» elimina solo las tomas.

## Iconos

Una cápsula blanca sobre un degradado azul (alrededor del color principal, #6dd0f9), dibujada a partir de `original.svg`:

- `favicon.svg` — navegadores modernos (vectorial).
- `favicon.ico` — respaldo con 16, 32 y 48 px.
- `apple-touch-icon.png` — iOS (180×180, cuadrado y opaco: iOS pone las esquinas).
- `icon-192.png` e `icon-512.png` — Android y Chrome (app instalada y pantalla de arranque).
- `icon-maskable-512.png` — Android con iconos adaptables: la cápsula queda dentro de la zona segura.
- `manifest.webmanifest` — nombre, colores, iconos y modo app; con rutas relativas para funcionar bajo `/dosify/`.

## Archivos

- `index.html` — estructura de la interfaz (toma, gestor de pautas con intervalos, datos, exportar y zona peligrosa, editores de pauta y de intervalo, ficha, alerta y action sheet) y el CSS mínimo.
- `app.js` — estado, almacenamiento, intervalos, render, orden, CSV y PDF.
- Iconos y manifest: ver «Iconos».
