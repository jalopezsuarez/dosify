# Dosify

App mínima para gestionar pautas de medicación: HTML + JavaScript puro, con [Ionic Framework](https://ionicframework.com) 9 (web components por CDN) como única dependencia. Sin build y sin frameworks. Todo se dibuja con componentes, propiedades y clases de utilidad de Ionic; el CSS propio es solo el estrictamente necesario:

- las variables de tema de Ionic para el color principal (#6dd0f9) y dos colores adicionales definidos como documenta Ionic: `teal` (#78b7af, icono de información y costes de cada pauta) y `rose` (#e47969, envase al que le quedan menos de 7 días);
- una clase de peso medio para los títulos (Ionic no trae utilidad de `font-weight`);
- ocultar la barra de scroll del selector de días;
- permitir seleccionar texto en la ficha de la pauta (en móvil Ionic lo impide en toda la app).

Tema claro u oscuro según el sistema (paleta `dark.system` de Ionic) y estilo según la plataforma que detecta Ionic: en iOS, listas agrupadas (inset); en Android, Material.

**Web:** https://jalopezsuarez.github.io/dosify/

Se puede instalar como app: en iOS, Safari › Compartir › «Añadir a pantalla de inicio»; en Android, Chrome › «Instalar app».

## Qué hace

### Toma (pantalla principal)

- **Días:** selector con scroll horizontal. Siempre muestra hoy y los 7 días anteriores; de antes, hasta 30 días atrás, solo los días con al menos una toma registrada. Hoy queda el último y seleccionado al cargar. Cada día lleva un anillo de progreso con «tomadas/total», en el azul de la app.
- **Intervalos:** una pestaña por cada intervalo visible, con su nombre y en el orden configurado en Pautas › Intervalos. Al cargar se abre el intervalo cuyas horas incluyen la hora actual; si ninguno la incluye, el próximo en empezar; si no tienen horas, el primero. Cada intervalo muestra un círculo con su porcentaje y «n de m tomadas».
- **Filas:** cada toma va en su propia tarjeta con la casilla a la izquierda, el nombre (peso medio), la dosis, las indicaciones en gris (recortadas a unas dos líneas) y el icono (i) a la derecha. El (i) avisa del envase si la pauta tiene programación vigente y dosis por envase: se pone en rosa cuando al envase actual le quedan menos de 7 días; si no, verde. En las tomas ya hechas, la hora va delante de la dosis («09:00 · 1 comprimido»).
- **Marcar y desmarcar:** pulsar la casilla o el texto abre un action sheet: desde Pendiente, «Marcar como tomado»; desde Tomas, «Marcar como pendiente». «Cancelar» (o tocar fuera) deja la toma como estaba.
- **Ficha (i):** dosis, indicaciones, referencias y notas de la pauta (en una toma ya hecha, la dosis y las indicaciones tal como se tomó) y, al final, la sección «Registro», igual que en el editor de la pauta. El texto se puede seleccionar y los enlaces (http, https o www.) se pueden pulsar.
- **Pendiente:** las tomas sin marcar, en el *orden de tomas* del intervalo. El botón ↕ de su cabecera activa el modo ordenar (asas de arrastre; ✓ para terminar). El orden fijado se guarda en el intervalo y vale para él en cualquier día; al ordenar, las tomas ya hechas no cambian de sitio.
- **Tomas:** las marcadas. El botón de su cabecera abre un action sheet para elegir el orden: *Orden de tomas* (por defecto, siempre al abrir la app), *Más reciente arriba*, *Más reciente abajo* u *Orden de pautas*. El icono de la cabecera indica el orden elegido.

### Pautas (botón arriba a la derecha)

- Un único listado, «Pautas (N)». Cada fila muestra el nombre, con el fin del envase a la derecha a su altura («5/01», en gris; en rosa y peso medio si le quedan menos de 7 días, igual que el (i) de la toma), solo si tiene una programación vigente y dosis por envase; debajo, en el verde del icono (i), lo que se pueda calcular de sus costes: «30 €/ud · 15 €/mes · 1 €/día»; la dosis de la programación vigente, las indicaciones en gris y un chip por intervalo visible (coloreados los de la pauta).
  - **€/ud:** el coste del envase.
  - **€/día:** coste del envase ÷ dosis por envase × dosis al día; las dosis al día son la cantidad de cada toma (el número con que empieza la dosis) por cada intervalo visible de la pauta.
  - **€/mes:** el coste al día por los días del mes actual (28 a 31).
  - **Fin del envase:** el último día del envase actual. Se suman todas las dosis registradas de la pauta y, cada vez que completan un envase, se empieza otro automáticamente: lo que queda del actual es el resto (dosis por envase − total registrado módulo dosis por envase). A eso se le restan las dosis que faltan hoy y lo que queda se reparte entre las dosis al día (las de la programación vigente). Si no llega para hoy, se acaba hoy.
- Tocar una fila la edita; «Añadir» crea una nueva. El botón ↕ de la cabecera muestra las asas para ordenar las pautas (✓ para terminar). Este *orden de pautas* es independiente del orden de tomas de cada intervalo.
- **Editor**, en secciones: Producto (nombre e indicaciones), Programación (ver abajo; la dosis va en cada programación), Intervalos (una casilla por intervalo visible; los ocultos conservan su valor), Otros datos (referencias y notas y, aparte, coste del envase en euros y dosis por envase, ambos enteros y opcionales), Registro (ver abajo) y Eliminar. Sin programaciones, las pautas no caducan. La pauta siempre se cambia en su sitio (no se duplica). Si cambian el nombre o las indicaciones y la pauta tiene tomas de días anteriores, un action sheet pregunta si se aplica **a partir de hoy** (las tomas anteriores siguen mostrando cómo se tomaron) o **a todo el registro** (también se cambian las tomas anteriores). Las tomas de hoy siempre pasan a mostrar la pauta nueva.
- **Programación:** en el editor de la pauta se crean, modifican y borran programaciones; cada una tiene dosis (empieza por un número, la cantidad de cada toma, como «1 comprimido» o «0,5 ml»), fecha de inicio (con el selector de fecha del sistema) y duración en días, los tres obligatorios; al añadir una, propone la dosis de la última y hoy. Van ordenadas por fecha de inicio (y, a igual fecha, por duración) y cada una muestra las fechas en que vale. Cada día vale la última que haya empezado: si una empieza antes de que termine la anterior, manda la fecha de inicio de la nueva. Una pauta con programaciones solo sale en la toma los días que cubre la que vale (pasada su duración, no sale), con su dosis, que es también la que se guarda en la toma y la que usan los costes y el fin del envase; sin programaciones, sale todos los días, sin dosis. Los cambios se guardan al guardar la pauta («Cancelar» los descarta).
- **Registro** (al final del editor, en pautas ya guardadas, y de la ficha (i) de cualquier toma): «Ver registro», con el número de tomas, abre el histórico completo de la pauta. Arriba, un resumen: desde qué día hay tomas, cuántas, las dosis tomadas (la suma de las cantidades) y, si la pauta tiene coste y dosis por envase, el coste estimado (dosis tomadas × coste ÷ dosis por envase). Debajo, las tomas (día y hora, «21/10 · 7:03», y debajo intervalo y dosis, «Desayuno · 1 comprimido»), de la más reciente a la más antigua, agrupadas por la programación que valía cada día, con su fecha de inicio, su dosis y cuántas tomas tiene («12/10 · 1 comprimido (7)»); en los títulos y en las tomas, el año solo sale si no es el actual («12/10/2025»); al cambiar de programación empieza otra sección, y las tomas de días sin programación van en «Sin programación».
- En la lista, cada pauta muestra la dosis que vale hoy. Si todas sus programaciones han terminado y no hay ninguna futura, la pauta sale en gris, desactivada, con la dosis de su última programación y sin costes ni fin del envase.
- **Costes** (solo si alguna pauta tiene coste): dos filas con las pautas no terminadas. La primera, el coste total de sus envases y cuántas tienen coste. La segunda, el coste al mes (los días del mes actual) y al día, sumando las que tienen coste y dosis por envase, calculado como en cada fila.
- **Intervalos:** los tres intervalos de toma, con una casilla a la izquierda para mostrarlos u ocultarlos y un asa a la derecha para reordenarlos. Tocar la fila abre su editor: nombre (puede quedar vacío; entonces se muestran sus horas o «Sin nombre»), hora de inicio y hora de fin, opcionales, en horas enteras de 0 a 24 (por ejemplo, 18 y 21). Un intervalo puede pasar de medianoche (22 a 6). Por defecto: Desayuno (6–12), Almuerzo (12–18) y Cena (18–24). Su nombre, orden y visibilidad se reflejan en las pestañas de la toma, en los chips y en el editor de pautas.
- **Datos:** cargar y exportar un único CSV con intervalos, pautas y tomas.
- **Exportar:** «Seleccionar mes» abre un action sheet con los meses de los últimos 6 que tienen al menos una toma (del más reciente, elegido por defecto, al más antiguo; si no hay ninguno, la exportación queda desactivada) y «Exportar PDF» descarga el registro de ese mes en PDF (A4) con la plantilla *Medication log*: título, mes y una tabla con fecha, hora, medicamento, dosis y notas (las indicaciones), tal como se tomó cada toma. Cada celda ocupa como mucho dos líneas; lo que no cabe se recorta con «…». Si hay más tomas de las que caben, sigue en más páginas. El PDF se genera en el navegador, sin librerías, con las fuentes estándar Helvetica.
- **Zona peligrosa:** «Borrar registro de tomas».

Al soltar una fila tras arrastrarla, solo se guarda el nuevo orden: la lista no se repinta, así el scroll no salta. Al cerrar el editor de una pauta o de un intervalo (guardando o cancelando), la lista vuelve a la posición en que estaba.

Todo se guarda en el `localStorage` del navegador. No hay servidor ni cuenta.

## Datos

Tres listas en el `localStorage`:

- **Intervalos**, en su orden: `id` (código fijo: `i1`, `i2`, `i3`), `name`, `start` y `end` (horas), `visible` y `order` (los `id` de pauta en el orden de tomas de ese intervalo). Los intervalos salen de una lista en el código, así que para tener 4 o 5 basta con añadirlos allí; todo lo demás (pestañas, chips, editor, orden, CSV) los recorre.
- **Pautas**, en el orden de pautas: `id`, `name`, `notes` (indicaciones), `refs` (referencias), `memo` (notas), `slots` (los `id` de sus intervalos), `cost` (€ por envase) y `units` (dosis por envase), enteros o vacíos, y `plan`, sus programaciones: `{ dose, start, days }` (la dosis empieza por la cantidad de cada toma), ordenadas por fecha de inicio.
- **Tomas**: `at` (cuándo se marcó), `day` (el día de la toma), `id` (de la pauta), `slot` (`id` del intervalo) y `name`, `dose` y `notes`: la pauta tal como se tomó. Así el registro (la toma, el PDF, el CSV) muestra lo que se tomó aunque la pauta cambie, cambie de intervalo o se borre.

El nombre que se ve de cada intervalo es el configurado, así que renombrarlos o reordenarlos no cambia ningún dato. Cada día de la toma muestra como pendientes las pautas de ese intervalo que valen ese día (las que no tienen programaciones, siempre, también en días anteriores a crearlas; las que tienen, los días que cubre su programación) y como tomadas sus tomas.

No hay compatibilidad con formatos anteriores. Al abrir la app y al cargar un CSV, los datos pasan por la misma limpieza: lo que falte o no cuadre toma su valor por defecto (intervalos que falten, los de por defecto; textos, números, fechas u horas no válidos, vacíos; intervalos inexistentes, quitados) y se descartan las pautas sin nombre, las programaciones incompletas o no válidas y las tomas que no se entienden.

## Orden

- **Orden de intervalos:** el orden de la lista de intervalos (pestañas, chips y editor).
- **Orden de pautas:** el orden del listado de pautas.
- **Orden de tomas:** uno por intervalo, su lista `order`. Las pautas que no están en ella (por ejemplo, recién creadas) van al final, en el orden de pautas.

## Formato CSV

Un solo fichero con todo: intervalos, pautas con sus programaciones y tomas. Separador `;`, una cabecera y 16 columnas compartidas; cada tipo de fila usa las suyas y deja las demás vacías.

```
tipo;id;nombre;intervalos;desde;hasta;fecha;dias;dosis;indicaciones;referencias;notas;coste;envase;visible;orden
intervalo;i1;Desayuno;;6;12;;;;;;;;;sí;p2 p1
intervalo;i2;Almuerzo;;12;18;;;;;;;;;sí;
intervalo;i3;Cena;;18;24;;;;;;;;;sí;
pauta;p1;Paracetamol;i1 i2 i3;;;;;;Si dolor;;;3;20;;
programacion;p1;;;2026-10-15;;;30;1 comprimido de 500 mg;;;;;;;
pauta;p2;Omeprazol;i1;;;;;;En ayunas;Dr. Ruiz;Comprar en farmacia;;;;
programacion;p2;;;2026-10-10;;;7;40 mg;;;;;;;
programacion;p2;;;2026-10-17;;;30;20 mg;;;;;;;
toma;p1;Paracetamol;i1;;;2026-10-17 08:12;;1 comprimido de 500 mg;Si dolor;;;;;;
toma;p2;Omeprazol;i1;;;2026-10-16 08:05;;40 mg;En ayunas;;;;;;
toma;p2;Omeprazol;i1;;;2026-10-17 08:03;;20 mg;En ayunas;;;;;;
```

- `intervalo`: `id` (código), `nombre` (puede ir vacío), `desde` y `hasta` (horas enteras de 0 a 24, opcionales), `visible` (`sí`/`no`) y `orden` (los `id` de pauta en el orden de tomas, separados por espacios). El orden de estas filas es el de los intervalos.
- `pauta`: `id`, `nombre`, `intervalos` (sus códigos, separados por espacios), `indicaciones`, `referencias`, `notas`, `coste` (€ por envase) y `envase` (dosis por envase). El orden de estas filas es el orden de pautas.
- `programacion`: tras su pauta, `id` de la pauta, `dosis`, `desde` (fecha de inicio, `AAAA-MM-DD`) y `dias` (duración); las tres son obligatorias, y si falta alguna o no vale, la programación se descarta.
- `toma`: `id` de la pauta, `intervalos` (el de la toma), `fecha` (`AAAA-MM-DD HH:MM`) y la pauta tal como se tomó: `nombre`, `dosis` e `indicaciones`. En el ejemplo, el Omeprazol tiene dos programaciones: 40 mg desde el 10 y 20 mg desde el 17; cada toma conserva la dosis con que se tomó.
- Al cargar, las columnas se buscan por su nombre en la cabecera, así que su orden da igual. No hay compatibilidad con formatos anteriores: lo que falte o no cuadre toma su valor por defecto (intervalos que falten, los de por defecto; números, fechas u horas mal escritos, vacíos) y las filas que no se entienden se ignoran.
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

- `index.html` — estructura de la interfaz (toma, gestor de pautas con costes, intervalos, datos, exportar y zona peligrosa, editores de pauta, de programación y de intervalo, registro de una pauta, ficha, alerta y action sheet) y el CSS mínimo.
- `app.js` — estado, limpieza y almacenamiento de datos, intervalos, programaciones, render, orden, costes, registro, CSV y PDF.
- Iconos y manifest: ver «Iconos».
