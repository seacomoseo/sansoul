# Evaluación de páginas plantilla para preview y SVG en desarrollo

Evaluación del 19 de octubre de 2026. No introduce páginas ni cambia el preview.
Complementa [el contrato actual](cms-live-preview.md), sin sustituir el prototipo
estructural ya existente.

## Qué aportaría una página plantilla

Sí serviría como documento inicial de iframe para entradas nuevas sin una página
publicada equivalente. Una plantilla por tipo e idioma y por cada variante de
`tpl` propio evitaría depender de una entrada de ejemplo elegida por casualidad.
Compartiría los estilos, scripts y anotaciones de edición reales del sitio. El
iframe no exige una página por entrada definitiva: puede reutilizar un shell y
recibir los valores de cada borrador por el transporte existente.

No resolvería por sí sola la actualización de estructura. Al producir HTML,
Hugo ya ha resuelto `if`, `get`, `remap`, herencia, consultas y shortcodes.
Conservar esos nombres en atributos no conserva un programa ejecutable: haría
falta definir y mantener también su evaluador. Una rama falsa ni siquiera tiene
DOM que activar. Una plantilla con todas las ramas necesita una representación
intermedia distinta del HTML definitivo y un renderer que replique la composición.
Un `<template>` dentro del documento aplaza insertar DOM; no aplaza ejecutar Hugo.

El límite se observa en las fuentes:

- `func/tpls` combina globales, defaults, tipo general, tipo y página.
- `sections/items-tpl` expande archivos, shortcodes y parámetros antes de renderizar.
- `func/if` depende también de cuerpo, sección, relaciones, comentarios y taxonomía.
- `func/get-param` recupera página y globales localizados, incluidos fallbacks de
  valores vacíos/falsos; no basta interpolar un string.
- `func/remap` modifica árboles mediante copia, traslado y eliminación.

Dos entradas de una colección pueden tener `tpl` distinto; la clave tipo/idioma
no cubre ese caso. Una variante de `single` tampoco puede compartir siempre shell
con otra cuando difieren idioma, estructura o dependencias. Y una colección de
consultas puede depender de la propia entrada y del resto del sitio.

## Build, salida y privacidad

Generar K shells en el mismo build no exige otro build completo, pero sí añade K
renders, recursos e índices que habría que excluir explícitamente. K crece con
combinaciones de tipo/idioma/estructura. No se ha implementado ese generador y no
hay una medida válida de su sobrecoste: no sería correcto prometer un porcentaje
a partir del número de páginas o del coste del prototipo completo.

Oculta al menú y `noindex` no significa privada. Si el HTML contiene ramas antes
omitidas, cualquiera que conozca su URL puede leerlas. Haría falta excluirlas de
búsqueda, sitemap, colecciones, relacionados y listados, sin confundir eso con
control de acceso. Para borradores no guardados es preferible salida temporal
local o un servicio de preview autenticado, separado de la salida pública.

## Medición reproducida del prototipo existente

Se invocó `compileStructuralDraft` el 19 de octubre, con la portada original como
borrador y destino `content/single/_home.es.md`, una vez por proyecto. El prototipo
crea y borra su workspace, copia dependencias, ejecuta prebuild + Hugo en modo
development y recoge todo el snapshot. No se tocó el servidor 13162 ni se instaló
ningún paquete. Son medidas de pared de una muestra, no un benchmark de escritura
interactiva ni medidas de los shells propuestos.

| Proyecto | Copia | Total | Total menos copia | Archivos / bytes snapshot |
| --- | ---: | ---: | ---: | ---: |
| Consumidor actual | 5486 ms | 8417 ms | 2931 ms | 87 / 4914691 |
| Copia del ejemplo canónico existente | 5208 ms | 7333 ms | 2125 ms | 99 / 4994169 |

El resto incluye prebuild, Hugo y recogida de archivos; no equivale únicamente al
render de la entrada. La copia del ejemplo es la fixture aislada previamente
compilada, no una promesa de igualdad byte a byte con cambios concurrentes del
motor. La evidencia previa de borradores de texto, rama `if/get/remap` y página
nueva con `tpl` propio sigue siendo la prueba funcional; esta repetición mide
coste y no la sustituye. Aquella midió 7995/7109/9113 ms; con carga paralela se
observaron tiempos superiores.

Artefactos fuera del repositorio:
`/private/tmp/sansoul-preview-template-evaluation-20261019/measure.mjs` y
`structural-measurements.json`. El prototipo devuelve bytes en memoria y elimina
su workspace antes de retornar. No se publicaron esos snapshots.

## Recomendación

Mantener preview ligero inmediato para los campos que ya tienen bindings y
reutilizar el documento real o un shell explícitamente identificado para páginas
nuevas. Para cambios estructurales, un segundo carril local con workspace
persistente, Hugo real y debounce/cancelación por generación conservaría la
semántica sin escribir un segundo motor en JavaScript. Primero habría que medir
el coste de reconstrucción en ese workspace: los 2–3 segundos restantes de estas
muestras no acreditan latencia de una implementación persistente.

Los shells son una mejora posible del arranque/fallback, no el componente que
hace fiel `if/get/remap`. Si se quiere preview estructural también en un CMS
publicado, la decisión adicional es dónde ejecutar Hugo y cómo autenticar,
cancelar y limpiar esa ejecución. No existe hoy ese servicio en el prototipo.
No recomiendo generar todas las ramas en HTML público ni duplicar el intérprete
completo para intentar evitar esa decisión.

## SVG: la optimización pedida ya está activa

La consulta original detectó correctamente trabajo innecesario y la vía rápida
se implementó en la tanda anterior. `files/svg-deferred` selecciona
`files/svg-development` cuando `not hugo.IsProduction`. Tanto `dev` como `cms`
usaban esa vía antes de esta evaluación; un modo fiel a producción debe usar la
rama de producción, aunque su servidor esté en localhost.

En desarrollo no se ejecuta `files/svg-plan`: no descubre firmas globales por
conjuntos de páginas, no agrupa iconos/imágenes/divisores entre páginas y no hace
la auditoría global de colisiones para construir sprites compartidos. Los iconos
se publican individualmente con hash y raíz referenciable; los SVG de imagen
siguen como imagen; los divisores usan una hoja por conjunto local. Cada documento
separa IDs de los de otros iconos y mantiene gradientes/animación. La fuente
completa local se cachea, sin recalcular subset por página.

Sí sigue habiendo lectura de recursos usados por la página, hash, publicación y
transformaciones locales necesarias; no se ha eliminado el procesamiento SVG
entero. Producción conserva su agrupación y optimización. La regresión
`scripts/tests/development-svg.test.js` sustituye `svg-plan` por un error para
probar que desarrollo no lo invoca, además de cubrir subrutas, IDs repetidos,
animación y cambio de URL al editar recurso.

La medición anterior sigue siendo la evidencia comparativa, no una novedad de
esta evaluación: mismo ejemplo, Hugo 0.168, `--disableFastRender`, tres ediciones
de contenido por variante. Antes 1143/1121/1171 ms; después 758/917/1190 ms;
medianas 1143 → 917 ms (aprox. 20 %). La dispersión y tres muestras impiden
prometer ese ahorro para otros sitios. El JSON original sigue en
`/private/tmp/sansoul-audit-20261017/svg-rebuild-comparison-20261018.json`.
No se ha rehecho el experimento histórico sustituyendo parciales de una versión
antigua sobre el motor que está cambiando ahora: eso mezclaría implementaciones
y produciría una comparación engañosa.


## Continuación aprobada — 20 de octubre

Se implementó el [prototipo local persistente](cms-live-preview.md) con
`sh do preview --demo`: una sola copia inicial, un proceso Hugo entre borradores
y comprobación del hash fuente antes de presentar cada generación. En tres
ediciones medidas: 1725/1502/1716 ms totales por petición; la copia inicial fue
9885 ms y no se repitió. Son muestras de este consumidor y equipo, no un plazo
garantizado. Evidencia: `/private/tmp/sansoul-structural-metrics-20261020.log`.
La evaluación histórica del shell por tipo y del SVG permanece sin reescribir.
