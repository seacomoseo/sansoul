# Evaluación del modelo de autoría — 21 de octubre de 2026

Las propuestas de globals, catálogo y fachada Hugo siguen pendientes de revisión.
El slider continuo fue aprobado e implementado el22 de octubre en13.1.0; sus
criterios y límites se actualizan debajo. Los cambios directos —fields, labels
both y medios side— se validan aparte.

## Nombre Git y ruta core

`[submodule "themes/sansoul"]` es el nombre lógico; `path = core` es la ubicación
actual del checkout. Pueden diferir: Git documenta el nombre y la ruta como
propiedades distintas en [gitmodules](https://git-scm.com/docs/gitmodules).
La configuración actual no obliga a seguir guardando fuentes en themes/sansoul.

Para instalaciones nuevas usaría nombre y ruta `core`. En ésta conservaría el
nombre lógico existente: cambiar sólo el encabezado no es una migración completa
de las referencias locales y del repositorio almacenado bajo .git/modules. Es
una mejora cosmética sin beneficio de render, CMS o rendimiento. El actualizador
ya busca la clave por su path. No he cambiado Git ni el gitlink para normalizarla.

## Globals repartidos por archivos

La idea tiene sentido cuando crecen los textos globales y diferentes personas
editan áreas distintas. Menú y footer son buenos candidatos. No movería callnows
dentro de menu: los botones de esquina tienen identidad propia y no son navegación.
Podrían vivir en un archivo opcional actions.<lang>.yml, manteniendo su clave
pública callnows. No crearía un archivo vacío sólo para cumplir una estructura.

Mantendría un único espacio de claves para get. Cada archivo contendría sus claves
actuales, por ejemplo menu.<lang>.yml empezaría por `menu:`, no por `items:`. Un
cargador reuniría esos mapas por idioma. El nombre del archivo organizaría la
edición, sin añadir un nivel al lookup. Dos archivos que definan la misma clave
principal producirían un error claro; no un merge dependiente del orden del disco.

En el CMS usaría una file collection llamada Globales, situada debajo de Páginas
Únicas, con esquema propio por archivo. Una entry collection comparte el esquema
y no resuelve bien esta heterogeneidad. Las file collections permiten editar
archivos enumerados con campos distintos, pero no crear archivos arbitrarios desde
su listado; un archivo enumerado inexistente se crea al guardarlo. Es el contrato
[nativo de Sveltia](https://sveltiacms.app/en/docs/collections/files).

Separaría el catálogo de archivos y sus campos del contenido. Se puede estudiar
una referencia desde customs, pero no convertiría la lista actual de campos en
un segundo archivo de configuración general sin definir sus responsabilidades.
La migración debe cubrir todas las lenguas, colisiones, guardado, preview, watcher
y convivencia temporal con el global.<lang>.yml antiguo. El coste relevante es la
complejidad del contrato, no abrir unos pocos YAML adicionales durante un build.
No hay benchmark que permita prometer un impacto de tiempo exacto.

Recomendación: propuesta útil y opcional; empezar por menu/footer y mantener
compatibilidad de get. Falta aprobación y diseño de su catálogo antes de escribirla.

## Colecciones, páginas únicas y templates

El problema de los campos específicos por página es real. El prebuild selecciona
customs por types; después `_hide.scss` limita su visibilidad por pages mediante
selectores de la interfaz de Sveltia. Los grupos visuales nativos añadidos en la
auditoría no han eliminado ese mecanismo. No conviene confundir ocultación visual
con un esquema que sólo permite los campos de esa página.

Un catálogo opcional de singles fijos permitiría generar una file collection con
campos propios por archivo. Es una solución directa y más estable para Inicio,
Contacto o una landing con datos específicos. El contenido localizado debe seguir
en content/single/*.md: el catálogo describe edición, plantilla y ruta; no duplica
el texto en data. El build genera configuración, no nuevos archivos fuente; el
CMS puede crear el archivo al primer guardado.

No haría obligatoria esa vía ni retiraría la colección actual de páginas libres.
Mantendría dos entradas de CMS: páginas definidas y páginas libres. Las definidas
se excluirían del listado libre para evitar dos editores con esquemas diferentes
sobre el mismo archivo. Hay que comprobar de forma explícita esa exclusión con la
versión instalada del CMS; no se da por implementada por una propuesta.

Tampoco juntaría todos los data/types/*.yml en un array obligatorio sólo para
resolver los singles. Los archivos actuales se identifican por nombre, se revisan
bien en Git y no requieren buscar posiciones en una lista. Un catálogo de páginas
fijas separado ofrece el beneficio principal con una migración mucho menor. Si
se optara por una lista unificada, exigiría nombres únicos, orden explícito y una
normalización determinista antes de aplicar defaults.

Los templates reutilizables son una mejora independiente. Recomiendo estudiar
`template: landing` como referencia a data/templates/landing.yml y conservar
`tpl: { ... }` como override local. Así tpl mantiene un único tipo (mapa), conserva
su merge actual y permite excepciones sin copiar el template completo. Harían falta
referencias inexistentes con error, ciclos rechazados, precedencia documentada,
i18n, CMS y previews coherentes. Los defaults generales/single seguirían viniendo
del motor si el consumidor no los sobrescribe; no obligaría a crear archivos vacíos.

Recomendación: catálogo opcional de singles fijos primero; templates como segunda
mejora. No aprobaría de entrada sustituir simultáneamente types, singles, globals,
customs y tpl: haría mucho más difícil migrar y verificar cada comportamiento.


## Plantillas Hugo opcionales — propuesta pendiente de revisión

Sí tiene cabida como extensión de código para diseños a medida, conservando el
constructor actual como opción predeterminada. Propondría un selector explícito
`layout` de Hugo para páginas completas y componentes registrados bajo
`layouts/partials/custom/`. El código se versionaría en `layouts/`; los textos,
imágenes, enlaces y listas permanecerían como datos tipados en `content/` o
`data/`, con su schema CMS. No pondría código Go template en el body Markdown
ni ejecutaría plantillas escritas desde el CMS: mezclaría edición editorial,
código confiable, escaping y permisos, y complicaría errores y preview.

Primero haría estable una fachada pequeña de componentes SanSoul que reciba
`Page` y un mapa de datos públicos: enlaces, Markdown, imagen/vídeo, fondo y
divisor. Muchos partials actuales reciben objetos ya expandidos con metadatos
internos; llamarlos arbitrariamente no ofrece hoy un contrato independiente.
Esa fachada debe conservar las dimensiones responsive, consentimiento, selección
de assets y sanitización; no se debe prometer que basta con cambiar el nombre
de carpeta. El cliente editaría campos simples definidos para cada diseño y
listas de componentes declaradas; el agente editaría HTML/SCSS/JS del proyecto.

Evitaría inicialmente alias nuevos `layouts/pages` y `layouts/parts`: las rutas
oficiales de Hugo y una convención `custom/` requieren menos infraestructura.
El layout debe conservar baseof/head/SEO y elegir explícitamente qué zonas del
constructor usa (por ejemplo menú/footer). Los módulos propios declaran sus
assets; una integración no detectada puede usar la salida completa existente.
La preview estructural local recompilaría estos diseños; la alojada mantendría
sólo las vinculaciones que puedan declararse de forma fiable.

Hugo ya permite seleccionar layout/type desde front matter; la propuesta de
fachada y schemas es específica de SanSoul y aún no está implementada. Referencia:
https://gohugo.io/templates/lookup-order/

## Slider infinito — aprobado e implementado en13.1.0

Distinguiría «volver al primero con los botones/autoplay» de «arrastre circular
sin extremo visible». La primera ya existe en `sideScroll` para flechas/avance automático: reutiliza
los nodos y vuelve al inicio al llegar al final, pero no simula continuidad durante
el gesto.
La segunda necesita una franja de elementos de apoyo o reordenación del DOM y
compensación de scroll. No duplicaría todas las tarjetas ni sus reproductores.

Para continuidad real propondría una opción desactivada por defecto, activada
sólo si hay suficientes elementos, que reutilice un pequeño número de elementos
de borde. Debe evitar IDs duplicados, sacar los apoyos del foco y del árbol
accesible, evitar precargas/reproducción de sus medios y mantener los índices
lógicos de pips. Formularios, iframes y elementos interactivos complejos no deben
clonarse sin un tratamiento explícito. Un resize, cambio de columnas o retirada
de consentimiento debe restaurar una posición válida. Con movimiento reducido,
sin animación de compensación visible ni autoplay decorativo.

El scroll nativo con snap sigue siendo la base. Es viable mantener bajo el coste
si se inicializa sólo donde exista un slider y al aproximarse al viewport; eso
no garantiza una puntuación PageSpeed concreta. Antes de adoptarlo mediría DOM,
peticiones de imágenes/players, tareas largas, CLS, foco y comportamiento táctil
en el carrusel más pesado. Fuentes técnicas consultadas:
https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-snap-type
https://web.dev/articles/animations-guide

## rate y sizes de fondos — criterio

El parámetro existe como `box.rate` y se transforma en min-height según el ancho.
Su proporción permite estimar un mínimo geométrico para cover, no la altura final:
texto, padding, fuentes, hijos y contenido dinámico pueden excederlo. La cobertura
horizontal necesaria es max(ancho de caja, alto efectivo × proporción original).
Reducir sizes a la proporción declarada podría elegir una imagen demasiado pequeña
cuando el contenido crece. La estimación actual de altura de viewport tampoco
es una garantía para cajas arbitrariamente altas. Conservaría la escala de
candidatos hasta el original y documentaría esa limitación; para afinar el caso
vacío hay que probar primero el CSS efectivo de rate y las variantes de padding,
sides y cover. No presento una reducción de bytes hipotética como optimización
ya medida. Queda registrado como trabajo específico de imágenes responsive.


Actualización 22 de octubre, 13.0.2: se reprodujo una subestimación incluso
para la altura mínima conocida (caja vacía rate=1/4). El cálculo incorpora
ahora ese mínimo como suelo adicional de cover, compartiendo la resolución
de rate con el CSS. Se conserva la estimación de viewport y el techo original;
no se ha reducido la calidad de cajas con contenido ni se infiere su altura
máxima. No se han introducido recortes automáticos.


Implementación aprobada22 de octubre: `box.infinite`/`review.infinite`, opcionales,
reciclan sólo nodos originales totalmente fuera de vista y compensan el scroll.
No hay clones de apoyo. Los indicadores usan índices lógicos, los cálculos se
activan cerca del viewport y resize revisa si hay espacio. No se mueve la tarjeta
con foco. Sin `moveBefore`, un carrusel con reproductores o iframes usa modo
finito desde el inicio; no se afirma disponibilidad de esa API en Safari26.
La continuidad por gestos nativos, los índices y el foco se verifican en Chrome;
la validación táctil en iOS conserva el límite de entrada de la herramienta.
La preview estructural queda en espera por petición expresa de Loren.
