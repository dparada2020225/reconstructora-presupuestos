# Manual de uso

Guía para quien usa la app todos los días (armar presupuestos, sacar el PDF, llevar los
abonos). No hace falta saber nada técnico.

- [Entrar a la app](#entrar-a-la-app)
- [Cómo está organizada](#cómo-está-organizada)
- [Armar un presupuesto](#armar-un-presupuesto)
- [Extras de un trabajo](#extras-de-un-trabajo)
- [Estados](#estados)
- [Cerrado en, anticipo y abonos](#cerrado-en-anticipo-y-abonos)
- [PDF: ver, descargar y compartir](#pdf-ver-descargar-y-compartir)
- [Buscar cualquier cosa](#buscar-cualquier-cosa)
- [Clientes, buses y productos](#clientes-buses-y-productos)
- [Estadísticas](#estadísticas)
- [Solo para el administrador](#solo-para-el-administrador)
- [Atajos de teclado](#atajos-de-teclado)
- [Preguntas frecuentes](#preguntas-frecuentes)

---

## Entrar a la app

1. Abre el link de la app (el administrador te lo pasa). Funciona en la compu y en el celular.
2. Pide tu correo. Puedes entrar con **Google** o con un **código** que llega al correo.
3. La primera vez vas a ver el aviso **"Tu solicitud de acceso quedó registrada"**: el administrador tiene que autorizarte
   en la página *Usuarios*. Cuando lo haga, recarga la página y ya entras.
4. La sesión dura un mes; después vuelve a pedir el correo.

## Cómo está organizada

| Página | Para qué |
|---|---|
| **Inicio** | Botón *Nuevo presupuesto* y los borradores que quedaron a medias. |
| **Presupuestos** | Todos los presupuestos (nuevos y del histórico), con búsqueda y filtro por estado. |
| **Clientes** | Clientes con sus buses y trabajos. |
| **Buses** | Cada bus (por placa o por nombre) con su historial de trabajos. |
| **Productos** | El catálogo de trabajos/productos con su historial de precios. |
| **Estadísticas** | Números de todo el histórico. |
| **Usuarios** y **Ajustes** | Solo el administrador. |

Arriba siempre está el cuadro **Buscar…** (o la tecla `Ctrl + K`).

Dos palabras que se usan en toda la app:

- **Presupuesto**: un documento (lo que antes era una pestaña del Excel).
- **Trabajo**: el original y todos sus **extras** juntos (lo que se le hace a un bus de principio a fin).

## Armar un presupuesto

1. **Inicio → + Nuevo presupuesto** (o la tecla `N`).
2. **Cliente**: escribe para buscarlo; si es nuevo, botón **+** a la par.
3. **Bus**: igual; es opcional. Un bus se reconoce por placa o por nombre ("La Estrella").
4. **Fecha y lugar**: vienen llenos con hoy y el lugar de siempre; se pueden cambiar.
5. **Secciones**: escribe el título (ADENTRO, AFUERA, TROMPA…). Con **+ Sección** agregas otra.
   Las flechas suben o bajan una sección.
6. **Líneas** de cada sección:
   - **Descripción**: al escribir salen sugerencias del catálogo con el precio de referencia
     (o el último que se cobró). Flechas ↑ ↓ para elegir, Enter o Tab para tomarla.
   - **Cantidad** y **precio por unidad**: el total de la línea se calcula solo.
     En el PDF sale "c/u" cuando aplica.
   - **?**: precio por definir. En el PDF sale "?" y no suma.
   - **Detalle** (el botón de renglón debajo): texto extra debajo de la línea, como los `*`
     del Excel. No suma.
   - **Enter** en el precio crea la línea siguiente. Las flechas mueven la línea; la ✕ la quita.
7. A la derecha se ven el **total por sección** y el **total**.
8. **Guardar** (o `Ctrl + S`). Si sales con cambios sin guardar, la app te avisa.

Un presupuesto nuevo empieza como **borrador**. Sin límite de filas.

> **Usar uno viejo como base:** en el cuadro *Más* de un presupuesto, *Usar como base para otro
> presupuesto* abre uno nuevo con las mismas líneas para cambiar lo necesario.

## Extras de un trabajo

Cuando al mismo bus se le agregan cosas (lo que en el Excel era "EXTRAS", "OTRAS EXTRAS"):

1. En el cuadro *Más* de cualquier presupuesto del trabajo → **Agregar extra a este trabajo**
   (o en la página del trabajo, **+ Agregar extra**).
2. Se arma igual que un presupuesto; queda como *Extra 1*, *Extra 2*…
3. En el PDF de un extra sale al final el **RESUMEN DEL TRABAJO** (original + extras).
4. El cuadro **Todo el trabajo** muestra cada documento, el **total del trabajo** y el botón del
   **documento unificado** (todos en un solo PDF con el resumen al final).

## Estados

Cada presupuesto (original o extra) tiene su estado. Se cambia en el cuadro de estado del editor:

| Estado | Cuándo |
|---|---|
| **Borrador** | Se está armando. Solo los borradores se pueden borrar (*Más → Borrar borrador*). |
| **Cotización** | Ya se le pasó al cliente. |
| **En curso** | El cliente aceptó y se está trabajando. |
| **Terminado** | Listo y entregado. |
| **Cancelado** | No se aceptó o se canceló. No suma al total del trabajo ni a las estadísticas. |

El **estado del trabajo** (cotizado, en curso, terminado, no se concretó) se calcula solo a partir
de los estados de sus presupuestos; no hay que cambiarlo a mano.

## Cerrado en, anticipo y abonos

- **Cerrado en**: el precio final negociado de ese presupuesto. Sale en el PDF.
- **Anticipo**: lo que se anota en ese presupuesto como anticipo. Sale en el PDF junto con el saldo.
- **Abonos**: los pagos que va dando el cliente por **todo el trabajo** (original + extras).
  Se registran en el cuadro **Todo el trabajo** de cualquier presupuesto del trabajo:
  fecha, monto, forma (efectivo, cheque o transferencia) y una nota (no. de cheque, banco…).
  - El **aro** muestra el porcentaje abonado contra el total del trabajo.
  - Cada abono se puede **editar (✎)** o **borrar (✕)**; el aro se actualiza.
  - Los abonos **no salen en el PDF**.

## PDF: ver, descargar y compartir

En el editor, arriba:

- **Ver PDF** (o `Ctrl + P`): lo abre en otra pestaña. Si hay cambios sin guardar, primero guarda.
- **Descargar PDF**: lo baja con un nombre como `Presupuesto Cliente 2026-10-07.pdf`.
- **Compartir**: abre el menú de compartir del celular o de la compu con el PDF ya adjunto
  (WhatsApp, correo, Drive…) y el mensaje "Presupuesto de *cliente* – *bus*".
  - En la compu, WhatsApp solo aparece si está instalada la app de escritorio de WhatsApp.
  - Si sale **"PDF listo · Toca para compartir"**, tócalo: el navegador pidió un clic más.
  - Si el botón no aparece, ese navegador no puede compartir archivos: usa *Descargar*.

El **documento unificado** (cuadro *Todo el trabajo* o la página del trabajo) tiene los mismos
botones: Descargar, Ver y Compartir.

El PDF tiene el formato de siempre: logo, lugar y fecha, cliente, placa/transporte, correo,
empresa y teléfono con los íconos de redes, secciones con su TOTAL en verde, resumen, "cerrado
en", anticipo y saldo, nota y firma.

## Buscar cualquier cosa

`Ctrl + K`, la tecla `/` o el cuadro **Buscar…** de arriba. Busca presupuestos (por cliente, bus,
placa o `#número`), clientes, buses y productos. No importan tildes ni mayúsculas. Flechas para
moverte, Enter para abrir, Esc para cerrar.

## Clientes, buses y productos

- **Editar**: entra al cliente, bus o producto y cambia sus datos.
- **Borrar**: solo si no tiene trabajos o usos. Si los tiene, se **une** con otro o (productos)
  se **desactiva** (*Desactivar*) para que no salga en las sugerencias.
- **Unir repetidos**: cuando el mismo cliente o producto está dos veces (p. ej. escrito distinto),
  en el que se queda, *Unir con otro…* pasa todo lo del repetido (trabajos, buses, usos, formas de
  escribirlo) y borra el repetido.
- **Posibles repetidos**: en Clientes y Productos hay un panel con parejas que se parecen.
  Para cada una: *Unir* o **No son el mismo** (ya no vuelve a salir).
- **Producto**: precio de referencia (el que se sugiere al armar un presupuesto), categoría,
  unidad, y el **historial de precios**: cada vez que se cotizó y la mediana por año.

## Estadísticas

Elige el rango de años arriba. Muestra: clientes y cuántos regresan, buses, trabajos, trabajo
típico, % de trabajos con extras, rebaja promedio al cerrar, monto cotizado por año, temporada
(presupuestos por mes), clientes que más han dejado, lo más pedido, cómo ha cambiado el precio de
cada producto, montos por categoría (sección) y buses. Cada gráfica tiene **Ver como tabla**.
No cuentan los borradores ni los cancelados.

## Solo para el administrador

### Usuarios
Quien entra por primera vez aparece como **pendiente**. Ahí se **Autoriza** o se **Niega**; a
alguien activo se le puede **Quitar acceso**.
Todos los autorizados pueden hacer lo mismo; el administrador además maneja Usuarios y Ajustes.

### Ajustes
- **Membrete**: empresa, correo, teléfono, firma, lugar por defecto y nota al pie.
- **Logo** e **íconos de redes** (una imagen junto al nombre de la empresa y otra junto al
  teléfono). Salen en todos los PDF.
- **Respaldo en Google Sheets**: cada presupuesto que deja de ser borrador se copia solo a una
  pestaña del archivo de respaldo, con el formato del Excel. Si alguno no se pudo copiar, sale
  como pendiente: **Copiar pendientes**. **Volver a copiar todos** rehace todas las pestañas.
  En cada presupuesto (cuadro *Más*) está el link a su pestaña y *Copiar ahora*.
- **Copia de toda la base**: **Descargar copia (.json)** baja todo lo que hay en la app. Inicio
  avisa si pasó más de un mes sin bajar una. Guárdala en tu compu o en tu Drive y no la
  compartas: tiene todos los datos del negocio.

## Atajos de teclado

La tecla `?` muestra esta lista en la app. Los de una sola tecla no funcionan mientras escribes en un campo.

| Teclas | Qué hace |
|---|---|
| `Ctrl + K` o `/` | Buscar |
| `N` | Nuevo presupuesto |
| `?` | Ver los atajos |
| `Ctrl + S` | Guardar (editor) |
| `Ctrl + P` | Ver el PDF (editor) |
| `Enter` | Línea nueva debajo (en el precio) / detalle nuevo (en un detalle) |
| `Esc` | Cerrar ventanas |

## Preguntas frecuentes

**Me sale "Tu solicitud de acceso quedó registrada".** El administrador todavía no te autoriza. Avísale.

**Me sale "denegado".** El administrador negó el acceso a ese correo.

**No abre "Ver PDF".** El navegador bloqueó la ventana nueva: permite ventanas emergentes para la
app, o usa *Descargar PDF*.

**No sale WhatsApp al compartir en la compu.** Hace falta la app de escritorio de WhatsApp. En el
celular sí sale.

**Me equivoqué en un presupuesto que ya entregué.** Edítalo y guarda: el PDF y el respaldo en
Sheets se actualizan. Si ya no aplica, ponlo como *Cancelado*.

**¿Puedo borrar un presupuesto?** Solo los borradores. Si de verdad hay que borrar otro, primero
pásalo a *Borrador*; si solo no se hizo, mejor ponlo como *Cancelado* (queda en el historial).

**Un cliente o producto salió dos veces.** Únelos (ver *Unir repetidos*).
