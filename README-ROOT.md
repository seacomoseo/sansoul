# Manual de un proyecto SanSoul

Este es el manual humano compartido para el repositorio que consume SanSoul. Vive dentro de `themes/sansoul/` para distribuirse con el tema, pero todas sus rutas son relativas a la raíz del proyecto, dos niveles por encima.

Para la arquitectura interna del tema, consulta [`themes/sansoul/README.md`](README.md). Las instrucciones operativas se generan directamente en el `AGENTS.md` raíz desde `themes/sansoul/templates/root/AGENTS.md`; no son una traducción de este manual.

## Principios del proyecto

- La raíz contiene la configuración, el contenido y las personalizaciones de un sitio concreto.
- `themes/sansoul/` contiene el motor compartido y es un submódulo Git.
- Se priorizan los datos y la composición de secciones frente a los overrides de layouts.
- Los README se dirigen a personas y están escritos en español; los AGENTS se dirigen a agentes y están escritos en inglés. Se actualiza solo el documento cuya audiencia o contrato haya cambiado.
- No se deben incluir credenciales ni secretos en archivos rastreados: el contenido del sitio, la configuración generada del CMS y los parámetros de Hugo pueden terminar publicados.

## Requisitos e instalación

Necesitas Git y Hugo Extended. Para desarrollar sin `node_modules` en cada
proyecto, instala Dart Sass una sola vez en el `PATH`
(`brew install sass/sass/sass` en macOS). Node.js y las dependencias npm se
requieren para la preconstrucción y el build completo; `sh do hugo` las instala
si faltan y usa `npm ci` cuando el repositorio incluye `package-lock.json`.
Conserva el lockfile en Git para reproducir los paquetes. Las versiones de
Node.js y Hugo Extended de despliegue se fijan en `netlify.toml` y
`wrangler.toml`.

```sh
git clone --recurse-submodules <url-del-repositorio>
cd <carpeta-del-proyecto>
sh do server
```

Si el repositorio ya estaba clonado:

```sh
git submodule update --init --recursive
```

Solo debes usar `git submodule add https://github.com/seacomoseo/sansoul.git themes/sansoul` al crear un repositorio nuevo que aún no tenga la entrada de SanSoul en `.gitmodules`.

## Comandos principales

Ejecuta todos los comandos desde la raíz:

| Comando | Función |
| --- | --- |
| `sh do server` | Preconstruye y levanta el servidor local. |
| `sh do local` | Servidor del CMS con invalidación de caché y regeneración atómica de la configuración previa. |
| `sh do hugo` | Ejecuta la compilación completa y el posprocesado de imágenes. |
| `sh do migrations` | Muestra las adaptaciones pendientes para la versión instalada del tema. |
| `sh do root-docs` | Genera README/AGENTS raíz desde las plantillas canónicas del tema. |
| `sh do prebuild` | Regenera únicamente la configuración previa requerida por Hugo. |
| `sh do imgs` | Regenera favicon, PNG derivados y variantes AVIF a partir de los manifiestos del build. |

`public/`, `resources/`, `.hugo_build.lock` y `themes/sansoul/prebuild/public/` son salidas generadas. No deben editarse a mano.

## Estructura del repositorio

### Contenido y datos

- `content/`: contenido traducible.
  - `content/<type>/*.<lang>.md`: entradas de una colección.
  - `content/<type>/_index.<lang>.md`: metadatos y URL de la página índice de una colección.
  - `content/single/_home.<lang>.md`: página de inicio de cada idioma.
  - `content/single/*.<lang>.md`: páginas únicas componibles.
  - `content/page/*.<lang>.md`: páginas simples; algunas tienen una implementación predeterminada en el tema.
  - `content/global.<lang>.yml`: valores globales por idioma, como menú, botones flotantes y pie.
- `data/`: configuración que Hugo fusiona con los valores del tema.
  - `data/config.yml`: comportamiento general, integraciones y CMS.
  - `data/langs.yml`: idiomas y ajustes por idioma.
  - `data/styles.yml`: tipografías, iconos, colores y estilos globales.
  - `data/types/*.yml`: colecciones y plantillas por tipo.
  - `data/section/*.yml`: secciones reutilizables del constructor de páginas.
  - `data/defaults.yml`: valores predeterminados aplicados por idioma, tipo o ruta.
  - `data/customs.yml`: campos de contenido personalizados que también se exponen en el CMS.
  - `data/remote.yml`: fuentes remotas que el Content Adapter transforma en páginas virtuales.
  - `data/redirects.yml`: redirecciones generadas para el despliegue.
- `dna/`: identidad, criterios y restricciones particulares del proyecto.
  - `dna/_index.md`: resumen obligatorio e índice que indica qué otros documentos consultar según la tarea.

Desde Hugo 0.164, `y` y `n` son cadenas, no booleanos. En `hugo.yml`,
`content/` y `data/` escribe `true` o `false`; en los campos pseudobooleanos
que administra el CMS, la ausencia o el valor nulo hereda el valor de la
cadena de merges.

### Personalización y archivos públicos

- `assets/_custom.scss`: estilos adicionales incluidos en el CSS final.
- `assets/custom.js`: JavaScript adicional, si existe.
- `assets/robots.txt`: reglas adicionales para rastreadores; el sitemap se incorpora durante el build.
- `assets/llms.txt`: contenido adicional para el archivo `llms.txt` generado.
- `uploads/`: medios originales administrables por el CMS.

`uploads/foo/bar.png` se monta como recurso y como archivo estático. En el contenido se referencia mediante `/u/foo/bar.png`, no mediante `/uploads/...`.

### ADN del proyecto

`dna/_index.md` es obligatorio y se lee antes de trabajar. Resume la identidad y las restricciones del sitio, enumera los demás documentos de `dna/` y explica cuándo consultar cada uno. Un agente no debe cargar todo el directorio por defecto: lee el índice y abre solo las referencias pertinentes para la tarea. Si el índice falta, está vacío o conserva únicamente los textos orientativos de la plantilla, debe preguntar al usuario cómo definirlo antes de realizar trabajo específico del proyecto.

Utiliza Markdown para las reglas y resúmenes que deban buscarse con facilidad. PDF, imágenes y otros originales pueden convivir como fuentes de apoyo, siempre enlazados desde el índice con una indicación clara de su autoridad. Copy, audiencia, identidad visual, negocio e integraciones son ejemplos, no una estructura obligatoria.

Las particularidades nunca deben añadirse a README/AGENTS raíz porque son generados. `sh do root-docs` crea un índice orientativo cuando falta, pero no copia en él contenido de documentos antiguos. Después, el ADN pertenece exclusivamente al proyecto y no se sobrescribe al sincronizar.

### Operación del proyecto

- `hugo.yml`: URL base y parámetros privados del proyecto —privados en el sentido de específicos, no secretos—.
- `package.json` y `package-lock.json`: dependencias Node y versiones instaladas para Hugo y los scripts de posprocesado.
- `netlify.toml` y `wrangler.toml`: configuración de despliegue.
- `.github/workflows/`: automatizaciones; `backup.yml` replica el repositorio en GitLab. Requiere el secreto `GL_PAT`; GitHub proporciona automáticamente el token temporal de lectura usado para clonar el origen.
- `TODO.md`: lista humana de tareas y anotaciones; los agentes no deben leerla ni modificarla salvo petición expresa.

## El ciclo de construcción

SanSoul usa dos compilaciones de Hugo.

1. El wrapper raíz `do` delega en `themes/sansoul/do`.
2. La preconstrucción ejecuta el sitio Hugo de `themes/sansoul/prebuild/`.
3. Ese sitio combina `hugo.yml`, idiomas, tipos, defaults y metadatos de índices.
4. Publica atómicamente `themes/sansoul/prebuild/public/hugo.prebuild.yml`.
5. La compilación principal carga, en orden, la configuración base del tema, la configuración generada y `hugo.yml`.
6. Los mounts estáticos exponen contenido, datos, uploads, iconos y dependencias; el Content Adapter crea índices de colección y páginas remotas.
7. En producción, el script de imágenes procesa los manifiestos creados por Hugo.

`sh do local` vigila las entradas de la preconstrucción, agrupa cambios rápidos y regenera la configuración de forma serial y atómica. Hugo detecta el archivo actualizado y se reconfigura sin reiniciar; si la preconstrucción falla, continúa sirviendo la última configuración válida. Con `sh do server`, reinicia manualmente cuando cambies:

- `data/config.yml`, `data/langs.yml`, `data/defaults.yml` o `data/customs.yml`;
- `data/types/*.yml`, salvo cambios estrictamente internos a `tpl` que Hugo pueda recargar;
- `content/<type>/_index.<lang>.md`, especialmente `permalinks`.

Los cambios en `data/remote.yml` y `content/global.<lang>.yml` se reconstruyen directamente dentro del proceso principal de Hugo.

## Idiomas y valores globales

Cada entrada traducible usa el sufijo `.<lang>.md`, por ejemplo `servicio.es.md`. `data/langs.yml` declara los idiomas disponibles; `hide: true` desactiva uno en el proyecto sin borrar su configuración.

`content/global.<lang>.yml` se monta internamente como datos localizados. Sus usos habituales son:

- `menu`: logo, título, subtítulo y navegación personalizada;
- `callnows`: accesos flotantes;
- `footer`: contenido y aspecto del pie;
- cualquier valor propio consumido por `get` o por el shortcode `get`.

## Tipos de página

Un archivo `data/types/<type>.yml` declara una colección. Sus páginas viven en `content/<type>/` y su índice opcional en `content/<type>/_index.<lang>.md`.

Los tipos base reconocidos incluyen `article`, `event`, `product`, `brand`, `author`, `org`, `service` y `page`. Nombres habituales como `blog`, `new`, `category`, `supplier` o `manufacturer` reciben valores i18n predeterminados, pero pueden sobrescribirse por completo.

Tres tipos tienen un papel estructural:

- `all`: defaults de plantilla compartidos por todas las páginas;
- `single`: páginas únicas, cuya composición puede ampliarse en su propio front matter;
- `page`: páginas simples y páginas de sistema como legal, privacidad, cookies, sitemap, búsqueda y CMS.

Si `data/types/all.yml`, `single.yml` o `page.yml` no existen en la raíz, se usan los equivalentes del tema.

Parámetros relevantes de un tipo:

- `base`: familia semántica y de schema;
- `title`, `icon`, `emoji`, `weight`: presentación en CMS e índices;
- `hide`, `noindex`, `body`, `comments`, `rel`: capacidades y valores predeterminados;
- `tax_of`: relaciones entre colecciones;
- `tpl`: composición visual.

## Composición `tpl`

El constructor no depende de un layout distinto por cada página. Fusiona objetos `tpl` y renderiza una lista de secciones.

Prioridad general, de menor a mayor:

1. defaults internos del tema;
2. valores globales por idioma;
3. `data/types/all.yml`;
4. `data/types/<type>.yml`;
5. `content/single/<page>.<lang>.md` para páginas únicas;
6. valores específicos de la página.

Dentro de `tpl`:

- `section`: defaults de secciones. El elemento `0` se aplica a todas; los elementos siguientes se aplican cíclicamente por posición.
- `sections`: lista concreta de secciones que se van a renderizar.
- `bg`, `menu`, `callnow`, `list` y `rel`: configuración compartida de fondo, navegación y listados.

Una base habitual es:

```yml
tpl:
  sections:
  - file: base-_hero
  - file: base-toc
  - file: base-content
  - file: base-address
  - file: base-author
  - file: base-social
  - file: base-comments
  - file: base-children
  - file: base-share
  - file: base-rel
```

Cada `file` carga `data/section/<file>.yml`. La raíz puede definir secciones propias o sobrescribir las secciones base del tema con el mismo nombre.

## Secciones, cajas y bloques

La jerarquía de renderizado es:

```text
página → secciones → cajas → bloques o subcajas
```

Una sección controla fondo, tamaño, espaciado, separadores, entrada de menú y modales. `boxes` contiene sus cajas y `box` define valores compartidos para ellas.

Las cajas aceptan títulos, Markdown, icono, imagen o vídeo, botón, fondo, distribución y composición recursiva. Algunas claves activan bloques especializados:

| Clave | Bloque |
| --- | --- |
| `list` | Listado de páginas o relaciones. |
| `steps` | Pasos de un proceso; `step` configura sus defaults. |
| `imgs` / `limgs` | Galería; `gallery` configura el conjunto. |
| `faqs` | Preguntas desplegables; `faq` configura el conjunto. |
| `reviews` | Reseñas; `review` configura el conjunto. |
| `inputs` | Formulario; `form` configura envío y presentación. |
| `geos` | Mapa; `map` configura vista y capas. |
| `links`, `dots`, `when`, `gss` | Enlaces, redes, horarios y datos tabulares. |
| `boxes` | Subcajas recursivas. |

`get` obtiene valores de la página o de `content/global.<lang>.yml`. `remap` mueve, copia o elimina rutas de parámetros. `if` condiciona el renderizado. Son herramientas potentes: pruébalas con una página aislada antes de reutilizarlas globalmente.

Los formularios enviados a Google Apps Script asignan un `_submission_id` estable y conservan temporalmente en `localStorage` los envíos sin recibo verificable para reintentarlos. También adjuntan `User Agent` y, cuando el servicio externo responde en 1,5 segundos, la IP pública consultada mediante ipify; un fallo de esa consulta nunca bloquea el formulario. El Apps Script receptor debe persistir el payload antes de responder y devolver el mismo identificador. Documenta este tratamiento y su finalidad en la política de privacidad del sitio.

Para enviar una confirmación al correo facilitado por el usuario únicamente después de aceptar el envío, actívala en la configuración del formulario:

```yml
form:
  confirm:
    enabled: true
```

SanSoul resuelve los textos en el idioma de la página y envía a GAS un único campo oculto `_confirmation` con la configuración ya traducida. `intro` y `notice` aceptan Markdown, que Hugo convierte a HTML y el receptor filtra antes de incluirlo en el correo. `fields` decide si se muestra la tabla con los datos enviados y vale `true` por defecto. Cualquier valor omitido usa la traducción predeterminada:

Los textos también pueden insertar el primer valor de un campo mediante su nombre entre corchetes dobles, por ejemplo `[[Nombre]]`. Un `notice` vacío elimina por completo el aviso final.

```yml
form:
  confirm:
    enabled: true
    fields: false
    subject: Confirmación de inscripción
    intro: |
      Hemos recibido **correctamente** tu inscripción.
    notice: |
      Este es un mensaje automático. Por favor, no respondas a este correo.
```

El receptor duradero mantiene una sola fila por payload en `logs` y registra cada archivo adjunto por separado en `file_logs`. Conserva el JSON completo en `Raw Parameters`; solo crea un archivo de Drive cuando el payload supera el límite seguro de una celda, en cuyo caso esa misma celda contiene el enlace de recuperación. Los reintentos reutilizan el registro y los archivos ya creados; si un mismo `_submission_id` llega con contenido distinto, el receptor conserva ambos payloads y deriva el segundo a revisión. Los clientes antiguos sin identificador reciben uno determinista a partir del payload para que repetir exactamente la misma petición no genere otro registro.

`file_logs` guarda el hash SHA-256 y el enlace del archivo binario. No duplica el base64 de un archivo válido porque ya está conservado dentro de `Raw Parameters`; cuando el archivo no puede procesarse, intenta añadir además un enlace `Recovery Data` al payload base64 independiente. La copia local del navegador protege los envíos modernos mientras no exista un recibo verificable, pero ningún receptor puede prometer persistencia si fallan simultáneamente el navegador, Google Sheets y Google Drive.

Los envíos en `Review` o `Error`, los que permanecen en `Received` durante más de cinco minutos y los aceptados con errores de correo quedan pendientes de revisión administrativa. `retryFailedSubmissionEmails`, ejecutado por el activador periódico de cada spreadsheet, envía a partir de las 09:00 de `Europe/Madrid` un único resumen diario a `info@seacomoseo.com`. El resumen incluye el estado, enlaces, metadatos y una tabla equivalente a la del correo aceptado; los valores demasiado grandes se acortan en el email, pero permanecen completos en `logs`. Solo un error que impida crear el registro duradero se avisa inmediatamente, porque no podría recuperarse para el resumen.

La confirmación puede usar el remitente genérico `no-reply` únicamente cuando el script se ejecuta desde Google Workspace. En cuentas personales de Gmail incluye un aviso de correo automático, pero técnicamente no puede impedir que el destinatario pulse «Responder».

Consulta [`_examples/data/section/example.yml`](_examples/data/section/example.yml) como catálogo comentado y [`_examples/content/blog/2020-01-01-entrada.es.md`](_examples/content/blog/2020-01-01-entrada.es.md) como chuleta de Markdown.

## CMS

SanSoul genera la configuración de Sveltia CMS a partir de los idiomas, tipos, secciones, defaults y campos personalizados. Tras construir, la configuración final se encuentra en `public/admin/config.<hash>.yml` y se enlaza desde `public/admin/index.html`.

Esa salida es la referencia más precisa para comprobar qué campos ve el editor, pero nunca debe modificarse a mano. En Sveltia CMS los campos son obligatorios de forma predeterminada; usa `required: false` cuando corresponda.

Cuando cambies el modelo de contenido:

1. usa `sh do local` y espera a que termine la regeneración automática;
2. comprueba que se genera el YAML del CMS;
3. abre `/admin/` y prueba crear o editar una entrada representativa;
4. compila el contenido guardado por el CMS.

## Defaults y campos personalizados

`data/defaults.yml` aplica valores sin repetirlos en cada archivo. Debido a su alcance, una regla demasiado amplia puede cambiar muchas páginas; usa selectores de ruta, tipo e idioma tan específicos como sea posible.

`data/customs.yml` declara campos adicionales. Un campo puede exponerse al CMS y luego consumirse desde una sección mediante `get`. Para rutas anidadas se usa notación de puntos, por ejemplo `example.param`.

## Fuentes remotas

`data/remote.yml` permite generar páginas virtuales durante el build principal desde JSON, YAML, Markdown, CSV u otros recursos. El Content Adapter se vuelve a ejecutar al cambiar la configuración local. La salida es determinista solo si la fuente también lo es. Evita credenciales en URLs, define fallos aceptables de forma explícita y no dependas de una API remota para contenido crítico sin una estrategia de caché o respaldo.

## Overrides del tema

Hugo permite sobrescribir layouts, partials, shortcodes, assets y datos del tema desde la raíz. Úsalo solo cuando la diferencia sea propia de un proyecto. Si la corrección beneficia a todos los sitios, debe hacerse en el submódulo y publicarse como una actualización del tema.

Un override crea una bifurcación silenciosa: documenta el motivo, el archivo original y cómo comprobarlo tras actualizar el submódulo.

## Ejemplos reutilizables

`themes/sansoul/_examples/` es a la vez un sitio de demostración copiable y un conjunto de chuletas. Para poblar un proyecto vacío, copia sus carpetas `data/` y `content/` sobre la raíz después de revisar posibles colisiones. Lee primero su [`README.md`](_examples/README.md).

## Actualizar el tema

El `package.json` del tema declara la versión instalada; el de la raíz declara la última versión con la que el proyecto ya es compatible. Las acciones necesarias para pasar de una a otra se publican en [`MIGRATIONS.md`](MIGRATIONS.md).

Puedes delegar el flujo completo a Codex simplemente con:

> Actualiza el submódulo.

Las instrucciones del repositorio convierten esa petición en el flujo completo: el agente lee los contratos aplicables, conserva cambios existentes, actualiza el tema, ejecuta migraciones, valida y sincroniza las versiones. La petición no autoriza commit, push ni despliegue.

Después de actualizar el submódulo:

1. ejecuta `sh do migrations`;
2. aplica las migraciones pendientes en orden;
3. construye y revisa el proyecto;
4. ejecuta `sh do migrations mark --yes` únicamente cuando la compatibilidad esté comprobada; el comando sincronizará la versión de `package.json` y, si existe, de `package-lock.json` en la raíz.

El comando informa y verifica; no modifica contenido ni configuración automáticamente. Una migración concreta puede ofrecer un script idempotente, pero nunca se ejecutará como efecto secundario de un build o de la actualización del submódulo.

### Archivos README y AGENTS de la raíz

No se modifican como efecto secundario de Git. Después de actualizar el submódulo, una migración puede pedir `sh do root-docs`. README y AGENTS raíz son archivos genéricos generados íntegramente desde `themes/sansoul/templates/root/`; sus cabeceras advierten que no deben personalizarse.

Si README/AGENTS no fueron generados, `sh do root-docs` se niega a sobrescribirlos sin `--force`. Con `--force` los reemplaza íntegramente y descarta su contenido: no intenta interpretarlo ni trasladarlo al ADN. Si falta `dna/_index.md`, crea únicamente el scaffold orientativo. En actualizaciones posteriores puede reemplazar README/AGENTS de forma segura, pero nunca sobrescribe el ADN.

El README raíz es una portada breve que enlaza este manual. El AGENTS raíz contiene el contrato operativo completo para que Codex lo descubra sin lecturas indirectas. Toda particularidad debe vivir en `dna/`, cuyo `_index.md` se lee siempre y dirige hacia los documentos relevantes.

## Comercio con Pages Functions

El comercio es opt-in. `enabled` activa el catálogo; `functions_enabled` controla por separado el enrutamiento de Pages Functions. Si este último se omite, sigue el valor de `enabled` para conservar la configuración de consumidores existentes. Sin `data/commerce.yml`, o con ambos valores desactivados, no se enrutan Functions de comercio. Ninguno de estos ajustes autoriza cobros: la autorización de checkout es independiente y falla cerrada.

Con comercio activo, `data/commerce.yml` también requiere `origin`, `currency` y `stock_mode`. La parte de aprobación usa `checkout_approved` (booleano), `checkout_legal_version` (identificador de versión aprobada), `checkout_destination_countries` (lista de códigos ISO alfa-2 en mayúsculas), `checkout_tax_policy` (`included`, `calculated` o `not_applicable`) y `checkout_shipping_policy` (`included`, `flat_rate`, `calculated` o `not_applicable`). Sus valores iniciales son `false`, `null`, `[]`, `null` y `null`, respectivamente. El parser admite arrays YAML en línea y en bloque; por ejemplo:

```yaml
checkout_destination_countries:
  - "ES"
  - "PT"
```

El generador valida formato y coherencia, no verifica el contenido real del aviso legal, los destinos autorizados ni las reglas del negocio: debe aprobarlos la persona responsable. No guardes secretos ahí: el catálogo generado puede publicarse junto a Functions.

La autorización de Stripe requiere además configuración de servidor Pages explícita: `COMMERCE_ENV` debe ser `test` o `live`, `COMMERCE_PROVIDER=stripe` y `COMMERCE_CHECKOUT_APPROVED=true`. Los parámetros de URL, `localStorage` y el payload del navegador no pueden habilitarla. En la implementación actual los totales de impuestos y envío no están calculados, por lo que Stripe queda bloqueado también con los demás valores completos; no se considera `subtotal` un total comercial válido para productos físicos.

El proveedor `fake` solo admite fixtures sintéticos cuando `COMMERCE_ENV=test` y `COMMERCE_TEST_FIXTURE=synthetic-commerce-test`; se rechaza en `live`. Al apagar la autorización se bloquean también los replays de checkout para no volver a entregar URLs de pago. Esto no revoca sesiones Stripe emitidas previamente; esas sesiones caducan según su expiración o requieren cancelación por el proveedor. Webhooks, conciliación y consulta privada del estado de pedidos anteriores siguen activos.


En `stock_mode: finite`, las reservas `held` descuentan disponibilidad hasta que se confirman (`committed`), se liberan o vencen (`expired`). Un checkout válido o `POST /api/commerce/admin/reconcile` marca como `expired` los pedidos `pending` vencidos y sus reservas `held`; no necesita que llegue un webhook. Stripe deja vencer sus Checkout Sessions a las 24 horas de su creación real por defecto. El backend omite `expires_at` para que Stripe aplique ese plazo desde la creación efectiva y el payload siga idéntico en reintentos con la misma clave. El backend permite reintentar durante 23 horas (margen previo a la retención mínima documentada de claves de idempotencia); conserva la reserva hasta el posible vencimiento de una sesión creada en el último reintento, con cinco minutos de margen, y limita el watchdog de recuperación a 47 h y 5 min (23 h + 24 h + 5 min). Al recibir la sesión, alinea el pedido y las reservas `held` con el `expires_at` devuelto por Stripe. Un timeout ambiguo no demuestra que el proveedor no creara la sesión ni autoriza ampliar una sesión existente. Aplica, en este orden, las migraciones `0001_commerce.sql`, `0002_buyer_status.sql`, `0003_provider_session_expiry.sql` y `0004_operations_and_delivery.sql` antes de actualizar el backend. `0001` crea las tablas de idempotencia, pedidos, inventario, reservas, límites, webhooks y outbox con sus restricciones; `0002` añade capabilities de estado privadas para comprador; `0003` permite alinear el vencimiento operativo del pedido con el vencimiento real de la sesión sin hacer mutable el snapshot; `0004` crea el almacenamiento privado de datos de entrega, el resumen durable de webhooks sin pedido y los cursores de operaciones. En D1, aplica cada SQL solo tras verificar la base, el entorno y una copia recuperable; `npm run test:commerce:d1` prueba D1 local y no aplica migraciones remotas.

Desde la raíz del consumidor, estos comandos usan la versión de Wrangler fijada en `themes/sansoul/package-lock.json`. Tras aprobar y respaldar el entorno, ejecuta cada archivo una sola vez y en orden:

```sh
npm --prefix themes/sansoul exec -- wrangler d1 execute <NOMBRE_BASE> --remote --file themes/sansoul/commerce/migrations/0001_commerce.sql
npm --prefix themes/sansoul exec -- wrangler d1 execute <NOMBRE_BASE> --remote --file themes/sansoul/commerce/migrations/0002_buyer_status.sql
npm --prefix themes/sansoul exec -- wrangler d1 execute <NOMBRE_BASE> --remote --file themes/sansoul/commerce/migrations/0003_provider_session_expiry.sql
npm --prefix themes/sansoul exec -- wrangler d1 execute <NOMBRE_BASE> --remote --file themes/sansoul/commerce/migrations/0004_operations_and_delivery.sql
```

Un pago tardío se registra, pero pasa a `inventory_exception`, no se prepara automáticamente y genera una notificación en el outbox durable para revisión. Un reembolso parcial antes o después de `paid`, mientras el pedido esté en `awaiting_payment` o `ready`, también lo lleva a `inventory_exception` sin cambiar `payment_status=partially_refunded` ni reducir `refund_amount_minor`. La conciliación mueve a esa misma excepción los pedidos heredados que aún estén esperando; nunca trata un reembolso parcial como un pago impagado, ni vence o libera automáticamente sus reservas `held`. La notificación durable de excepción/cancelación no contiene contacto ni dirección.

Una persona autorizada puede resolver esa excepción con `POST /api/commerce/admin/orders/<orderId>/cancel-partial`, usando la misma autenticación administrativa. En un único batch condicionado al ganador, cancela solo el fulfillment y libera solo reservas `held`; conserva `committed`, el estado monetario y el importe reembolsado. Repetir una cancelación aplicada devuelve éxito sin repetir efectos. Esta acción no devuelve dinero ni confirma un reembolso: el saldo monetario restante requiere una gestión separada del titular de la cuenta/proveedor, fuera de este corte. Las rutas `manufacture` y `ship` rechazan pedidos en excepción. Un reembolso completo libera únicamente reservas aún `held`; las unidades `committed` no se reponen automáticamente y un reembolso no revierte fabricación o envío: los pedidos `manufacturing` o `shipped` conservan su fase y requieren resolución operativa explícita.

El estado privado para comprador está disponible en `GET /api/commerce/status/<orderId>` solo con la cookie de capability que emitió checkout. No basta conocer el UUID del pedido. Las órdenes creadas antes de migrar `0002_buyer_status.sql` no reciben una capability retroactiva ni se vuelven accesibles por su ID. La capability aleatoria de 256 bits se guarda en D1 como hash y se vincula a la orden, la clave de idempotencia y la sesión; la cookie `__Secure-commerce-status-<orderId>` usa `HttpOnly`, `Secure`, `SameSite=Lax`, ruta `/api/commerce` y caduca como máximo a los 90 días o al vencimiento operativo de la orden. La respuesta contiene únicamente `order_id` y `payment_status`, no incluye dirección ni contacto y se entrega sin caché, con `Vary: Cookie` y `Referrer-Policy: no-referrer`. Si se pierde la respuesta inicial o la cookie, no hay recuperación de acceso por UUID o clave de idempotencia ni reasignación automática de la capability a una orden antigua; el endpoint falla cerrado con 404. No registres la URL ni la capability en analytics, referer o almacenamiento del navegador.

Durante `sh do hugo`, el tema genera el catálogo antes de la compilación Hugo. Sin adaptadores de Pages Functions no genera artefactos de comercio. Con los adaptadores presentes, una configuración ausente o desactivada sin `functions_enabled: true` genera un catálogo desactivado y `_routes.json` incluye y excluye únicamente `/`; no exige SKU ni activa tráfico de Functions. `functions_enabled: true` conserva `/api/commerce/*` incluso cuando `enabled: false`: ese modo mantiene webhook, estado privado, administración y conciliación accesibles, mientras el checkout y sus replays quedan bloqueados por el catálogo desactivado. Para detener todo el tráfico de Functions, usa `functions_enabled: false` o elimina la configuración únicamente cuando no haya operaciones pendientes. Quitar configuración/rutas no cancela sesiones ya emitidas ni revierte pedidos o pagos en D1/Stripe; para pausar una tienda con pedidos, conserva binding, base y credenciales necesarias, y usa `enabled: false` junto a `functions_enabled: true`. La salida de catálogo queda en `functions/_commerce/catalog.generated.js`, fuera de `public/`; no la copies ni publiques como asset estático.

### Operación privada, exportación y respaldo

Todas las rutas `/api/commerce/admin/*` exigen `Authorization: Bearer <COMMERCE_ADMIN_TOKEN>` y el binding privado `COMMERCE_ADMIN_TOKEN`, de al menos 32 caracteres; las respuestas no se almacenan en caché. Falta de configuración válida devuelve 503 y credenciales incorrectas 401. Usa el token solo desde un cliente administrativo protegido: no lo incluyas en HTML, JavaScript del navegador, URL, CMS o `localStorage`. `GET /api/commerce/admin/orders?limit=50&cursor=…` admite 1–100 pedidos por página, en orden estable `(created_at DESC, id DESC)`, y devuelve `next_cursor`. Reutiliza el cursor con los mismos filtros `payment_status`/`fulfillment_status`; no es un snapshot transaccional: cambios de estado no reordenan filas y pedidos nuevos anteriores al cursor quedan para una consulta posterior.

`GET /api/commerce/admin/export.csv?limit=100&cursor=…` exporta una página y devuelve la siguiente clave en `x-next-cursor`; solicita páginas sucesivas hasta que esa cabecera esté vacía para recorrer todo el historial. Incluye snapshot de artículos/precios, estados, referencias del proveedor, reembolsos y, si el proveedor los entregó, contacto/dirección privada. Guárdalo como dato sensible y compártelo solo con personal autorizado. Es un extracto operativo CSV, no copia de seguridad: no contiene el esquema completo, reservas, eventos, deduplicación, capacidades ni outbox.

Para una copia SQL, desde un entorno autorizado ejecuta `npm --prefix themes/sansoul exec -- wrangler d1 export <nombre-base> --remote --output <ruta-segura>/commerce.sql`. El SQL incluye pedidos y datos personales: cifra/restringe la copia y no la añadas al repositorio. `npm run test:commerce:d1` ejercita el export SQL con Wrangler/D1 local, restaura en otra base local (`commerce-restored`) y otro `--persist-to`, y compara filas completas/estados de todas las tablas de comercio. Comprueba que el SQL exportado conserva tablas, índices y triggers; en la base restaurada verifica con escrituras rechazadas el trigger de snapshot, las restricciones `CHECK` y las claves foráneas. El ejecutor D1 local bloquea consultas directas a `sqlite_master` y `PRAGMA` (`SQLITE_AUTH`), por lo que este test no las usa. La prueba no ejecuta `--remote`, no verifica una copia alojada ni acredita recuperación ante desastre en Cloudflare. Restaura únicamente en una D1 desechable y vacía; una copia antigua sobre una base viva puede sobrescribir pedidos o pagos posteriores.

`POST /api/commerce/admin/reconcile` limita cada pasada a 25 pedidos y rota un cursor D1 durable por `(created_at, id)` con actualización compare-and-swap. Una prueba D1 sincroniza dos lecturas concurrentes del mismo cursor y confirma un único ganador; 75 pedidos sintéticos recorren tres lotes y vuelven a avanzar por los grupos siguientes, sin que 25 pedidos abiertos monopolicen el proceso. Si falta `session_id`, la recuperación reutiliza el UUID de pedido como clave idempotente del proveedor y el snapshot/payload inmutable persistido; checkout debe estar autorizado. El gate Stripe actual sigue cerrado, por lo que estos casos se conservan y se informan como diferidos fuera de fixtures sintéticos. Los webhooks firmados sin pedido guardan un resumen mínimo sin nombre/dirección; después de aparecer el pedido, conciliación puede replayarlo idempotentemente tras validar identidad, importe y moneda. Esta cola solo recupera eventos ya persistidos: consultar sesiones Checkout no descubre un evento `charge.refunded` que nunca llegó. Si falta, una persona autorizada debe volver a enviar el evento original desde el panel autenticado del proveedor a la URL webhook configurada; se verifica su firma y, si sigue sin pedido, `reconcile` lo aplica cuando exista la orden. Si el proveedor ya no permite reenvío, no hay endpoint de importación/reparación manual en este corte: no edites D1 directamente y escala la conciliación a una operación aprobada. El replay de un reembolso no se probó con Stripe real.

El outbox de D1 conserva fallos y programa reintentos con espera creciente; `POST /api/commerce/admin/outbox/dispatch` no demuestra entrega de email/factura. Solo se probó con notifier sintético que falla una vez y luego reintenta; la integración real sigue pendiente de acceso y validación en Ops.

Stripe Checkout solicita dirección de entrega únicamente cuando la política y la lista de destinos aprobados la permiten; no se inventan destinos, tarifas ni IVA. El webhook valida y persiste en `order_delivery_details` solo el contacto y dirección devueltos por Stripe. Solo pedidos/exportación administrativos autenticados exponen esos datos; el status del comprador devuelve exclusivamente ID y estado. `ship` exige destinatario, calle, localidad, código postal y país; si faltan, devuelve `delivery_details_missing`. Los webhooks no encontrados guardan un resumen sin PII y el outbox/errores no incluye dirección o contacto. El carrito del frontend conserva únicamente IDs/cantidades: hasta que destinos y políticas estén aprobados, no añadas captura de dirección en UI ni la guardes en URL, analytics o `localStorage`; Stripe Checkout es el punto de captura previsto cuando se autorice. No hay plazo de retención aprobado ni borrado automático implementado para `order_delivery_details`; antes de habilitar pedidos físicos reales, aprobar plazo/propietario y una rutina de eliminación también para exportaciones protegidas. Hasta entonces el gate de checkout físico permanece cerrado.

El generador usa un parser YAML completo para `data/commerce.yml` y el front matter de productos: errores, claves duplicadas y tipos incorrectos detienen el build. Con comercio activo, cada producto necesita `commerce_id` estable, `sku` único en mayúsculas y `commerce_active` booleano; no se inventan ni corrigen identificadores. Los precios se convierten a céntimos desde su texto decimal exacto.

### Catálogo, carrito e identidades (7.1.0)

`enabled: true` activa también la UI: acciones de cantidad/añadir en productos y
un panel de carrito compartido. El CMS ES/EN añade `commerce_id`, `sku`,
`commerce_active` y `commerce_quote` opcionales (`required: false`); el build exige
los datos válidos cuando se activa comercio. `commerce_quote: true` sustituye la
compra por un enlace a `#contacto`, sin inventar un precio. El carrito guarda solo
UUID/cantidad, nunca datos de entrega; sus importes son informativos y el backend
vuelve a validar el catálogo autorizado. Subtotal no equivale a total aprobado.

Para una página completa de carrito, crea `content/single/carrito.<lang>.md` para
cada idioma; el enlace del panel resuelve precisamente `single/carrito`:

```markdown
---
title: Carrito
slug: carrito
seo:
  noindex: true
---

{{< commerce-cart >}}
```

Mantén `checkout_approved: false` hasta aprobación comercial e implementación de
totales completos. `CHECKOUT_TOTALS_SUPPORTED=false` sigue bloqueando Stripe;
activar el catálogo, el CMS o el carrito no aprueba impuestos, envío ni contratos.
Sin `enabled: true` no se insertan shell/acciones/JS/SCSS comerciales; el shortcode
es un no-op. El ejemplo general sigue sin comercio y conserva los divisores.

Para altas, usa el allocator/validator del consumidor si dispone de él. Conserva
un registro versionado fuera de `content/`, `data/`, `static/` y mounts públicos,
con el propietario de cada UUID/SKU, bajas permanentes y high-watermark. No asignes
por orden/título ni rellenes huecos: un borrado o traducción no libera identidades.
Reserva la identidad antes de guardar las traducciones, conserva la misma pareja
en todas ellas y valida duplicados, propietario y tombstones antes del build.
Un cambio de ruta requiere trasladar explícitamente el propietario, no asignar
una identidad nueva. Nunca elimines bajas del registro al clonar o publicar.

`themeVersion` del manifiesto se toma del paquete del tema; `release` es SHA256 de
su contenido completo (incluida esa versión), no una aprobación comercial. UI y
backend identifican productos por el mismo UUID; publicar un paquete/manifiesto
nuevo requiere reconstruir y revalidar el snapshot, no reutilizar un gate de otro
hash. Versiones y ambos locks deben ir juntos en la publicación autorizada.

La carpeta [`_examples/commerce-backend/`](_examples/commerce-backend/README.md) es un ejemplo opt-in aislado de backend, sin productos, UI ni datos comerciales reales. No forma parte de las carpetas `data/` y `content/` que se copian como ejemplo general.

## Despliegue

Tanto Netlify como Cloudflare Pages publican `public/` y ejecutan `sh do hugo`. Mantén alineadas las versiones de Hugo Extended y Node declaradas por cada plataforma y prueba localmente esas mismas versiones antes de actualizar.

El workflow `.github/workflows/backup.yml` inicializa los submódulos y ejecuta el script de réplica del tema. Sus tokens deben vivir exclusivamente en secretos del proveedor.

## Lista mínima de validación

Antes de dar por terminado un cambio:

1. revisa `git status` en la raíz y dentro del submódulo;
2. ejecuta `sh do hugo` y comprueba que también finaliza el posprocesado de imágenes;
3. distingue avisos de red de errores reales de plantillas o assets;
4. prueba las páginas afectadas y `/admin/` cuando cambie el modelo de contenido;
5. revisa la página de referencia de separadores indicada en el ADN, si existe, cuando cambies secciones o estilos;
6. verifica enlaces, responsive, accesibilidad básica y consola del navegador;
7. sincroniza la documentación afectada.
