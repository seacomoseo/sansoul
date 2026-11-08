# Ejemplos y chuletas de SanSoul

Esta carpeta tiene dos funciones inseparables:

1. es un sitio de demostración que permite probar tipos, contenido y componentes del tema;
2. es una referencia humana de los parámetros disponibles y del formato que espera cada uno.

Se mantiene todo bajo `_examples/` para que `data/` y `content/` puedan copiarse directamente a la raíz de un proyecto vacío. Las chuletas viven dentro de esa misma estructura y también se renderizan, por lo que es más difícil que la documentación se quede obsoleta.

## Copiar el ejemplo a un proyecto

Haz primero una copia de seguridad o revisa las colisiones: estos comandos fusionan carpetas y pueden reemplazar archivos con el mismo nombre.

```sh
cp -R core/_examples/data/. data/
cp -R core/_examples/content/. content/
sh do build
```

No es necesario copiar `README.md` ni `AGENTS.md`.
Si mantienes la ubicación antigua, sustituye `core` por `themes/sansoul`.

El ejemplo presupone que el proyecto dispone de los recursos habituales de la plantilla en `uploads/base/`, especialmente `icon.png`, `logo.svg` y `poster.png`. Las URLs externas sirven para mostrar el comportamiento con recursos remotos y pueden fallar sin red.

## Qué consultar

- `data/section/example.yml`: catálogo amplio de sección, cajas, bloques, formulario, mapa y modales.
- `content/single/componentes.es.md`: página que renderiza el catálogo anterior.
- `content/blog/2020-01-01-entrada.es.md`: sintaxis Markdown, tablas, botones, iconos, imágenes e iframes.
- `content/page/divisores.es.md`: galería visual de separadores.
- `data/types/example.yml`: ejemplo funcional de un tipo y referencia comentada de sus parámetros disponibles.
- `data/config.yml`, `data/langs.yml`, `data/styles.yml`, `data/defaults.yml`, `data/customs.yml` y `data/remote.yml`: esquemas orientativos de configuración.
- los demás archivos de `data/types/` y `content/`: ejemplos semánticos de colecciones y schema.org.
- [`commerce-backend/`](commerce-backend/README.md): backend de comercio opt-in aislado (Worker o Pages Functions); no se copia con los datos y el contenido generales ni incluye UI o productos.

Los comentarios `# [ ... ]` enumeran valores habituales, pero el generador del CMS y el código del tema son la autoridad cuando discrepen. Tras una compilación, consulta `public/admin/config.<hash>.yml` para ver el esquema efectivo.

## Comercio opt-in

El sitio general no activa comercio. El ejemplo `commerce-backend/` demuestra
API-only (`enabled: false`, `functions_enabled: true`) sin añadir productos o
datos comerciales ficticios. Para probar UI sobre un consumidor que ya tenga
productos con UUID/SKU válidos, sigue [catálogo y carrito](../README-ROOT.md#catálogo-carrito-e-identidades),
usa `enabled: true` y conserva `checkout_approved: false`. Copia el ejemplo de
`single/carrito.<lang>.md` con `commerce-cart` para ES/EN; no hace falta una plantilla
propia. Comprueba acciones, panel, página y campos opcionales del CMS en ambos
idiomas. No copies el registro de identidades de otra tienda ni lo publiques como
asset. Mantén el ejemplo/divisores sin comercio como regresión independiente.

## Reglas de mantenimiento

- Todo parámetro público nuevo debe aparecer en un ejemplo mínimo y válido.
- Un valor de ejemplo debe demostrar comportamiento, no incluir credenciales ni datos personales reales.
- Los ejemplos deben compilar sin depender de servicios privados.
- Las fechas históricas son deliberadas; evitan que el contenido cambie solo con el paso del tiempo.
- Las páginas de referencia usan `seo.noindex: true` cuando no aportan contenido público real.
- Si se renombra un parámetro, actualiza a la vez renderizado, CMS, i18n, defaults, ejemplos y documentación; añade también una entrada a `MIGRATIONS.md` con la adaptación del proyecto consumidor.

## Validación

La carpeta debe probarse como un proyecto consumidor, no construirse directamente como tema. Copia `data/` y `content/` a un proyecto temporal, ejecuta `sh do build` y revisa como mínimo:

- inicio, índices y entradas de cada tipo;
- `/componentes/`;
- `/divisores/`;
- `/admin/`;
- consola del navegador y responsive.

La agrupación visual del CMS no añade objetos al YAML de los ejemplos. El antiguo
selector `view` se ha retirado; consulta [los grupos plegables](../docs/cms-field-groups.md).

### Contrato 9.0: enlaces, formularios y geografía

El catálogo `data/section/example.yml` muestra `link` como defaults de `links`,
columnas en `link`/`form` y proporciones `fit`/`fit_vs` por elemento. Omitir
columnas y fit conserva distribución automática; un fit explícito sin columnas
usa base 100 %. `align_x: grow` es default sólo para enlaces. Los mapas usan
`geo`/`geos`. Los antiguos `full` individuales y tipos de enlaces separadores
no forman parte del nuevo contrato; conserva `full` de sección y `when`.


## Preview estructural local

`content/single/preview-estructural.es.md` permite probar `sh do preview --demo`:
al vaciar Resumen desaparece su bloque y al escribir vuelve a generarse el
título con `get` y el Markdown con `remap`. No guardes los cambios de prueba.
Consulta [el alcance del prototipo](../docs/cms-live-preview.md).


## Autoría 10.0 e imágenes

Consulta [prefijos, iconos, eventos e imágenes](../README-ROOT.md#autoría-100-prefijos-iconos-y-eventos).
Config de imágenes: `imgs_webp`, `imgs_quality: 60`, `imgs_dpr: 2`; `img_sizes`
se retira. `il`/`ir` son iconos de enlaces y reseñas, sin cambiar `box.icon`.


`content/single/laterales-y-etiquetas.es.md` muestra `box.sides`, `side: center`
y formularios `labels: both` con tipos habituales. Sus formularios usan
`about:blank`; no se deben realizar envíos reales desde esta demostración.
Los campos anidados de `data/customs.yml` usan `fields` desde11.0.0.


## Autoría 12.0

`content/single/espaciado-y-pips.es.md` combina márgenes base/grandes, separación
de bloques, `set` después de `remap` e indicadores `pips: pill`. Los campos de
cada sección se escriben directamente junto a `file`, sin `params`. El grupo
«Contenido» del CMS es plegable y sólo visual. Véase [la migración](../MIGRATIONS.md#1200--2026-10-21)
antes de actualizar un consumidor anterior.


Desde 13.0, los mismos ejemplos incluyen `dot/dots`, `when/whens` y `gss` como
objeto. Los tres defaults admiten `mt`/`mt_vl`; dot y when añaden `align_x`.
La migración de composición no cambia la información de organización `org.when`.


`content/single/calendario.es.md` muestra la vista opcional `list.view: calendar`,
con barras continuas de varios días, solapamientos en filas separadas, año de
doce meses y mes compacto móvil. Los días marcados abren todos sus eventos al
pasar el ratón, enfocar o pulsar; también se puede elegir la vista agenda.
Conserva los artículos como lista; los eventos de febrero/marzo son ficticios.
`content/single/carrusel-infinito.es.md` demuestra `box.infinite: true` con ocho
tarjetas originales y un caso que permanece finito por falta de elementos.
Los sliders con medios incrustados usan modo finito si no hay `moveBefore`.


El calendario utiliza `btn btn--dot btn--sm` para flechas y cierre pequeños,
con un área pulsable mínima de 48 × 48px y superficie visible de 2em.

`content/single/espaciado-y-pips.es.md` comienza con ejemplos de `btn_full`,
`btn_mt` y `btn_mt_vl`, incluidos fondo directo, ancho forzado y herencia.
`data/section/example.yml` muestra `form.ajax` y `data/config.yml` documenta
`imgs_remote`. Ambas opciones de transporte/descarga son opcionales; consulta
sus condiciones y fallback en el manual para consumidores.
