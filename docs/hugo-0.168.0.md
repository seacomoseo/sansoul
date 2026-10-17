# Hugo 0.164.0 → 0.168.0

Revisión del 15 de octubre de 2026. **Recomendación: actualizar por seguridad.**
Hugo 0.168.0 Extended/deploy ya está instalado en el Mac mediante Homebrew.
Se conservaron la instalación anterior y una copia independiente del binario.
La actualización no requiere convertir el pipeline de recursos de SanSoul.

## Cambios entre versiones

| Versión y publicación | Novedades y cambios relevantes |
| --- | --- |
| [0.165.0 — 12 de agosto](https://github.com/gohugoio/hugo/releases/tag/v0.165.0) | Contexto de imports en compiladores CSS/JS; generación Chroma clara/oscura; información de artefactos. Tailwind deja de estar permitido por defecto como ejecutable. SanSoul no utiliza Tailwind. |
| [0.166.0 — 9 de septiembre](https://github.com/gohugoio/hugo/releases/tag/v0.166.0) | Retornos condicionales en plantillas; contexto adicional en `.Render`; `resources.Publish`. Endurece peticiones remotas, proxies, symlinks y globs. Algunos títulos con `/` generan ahora un único segmento de URL. |
| [0.167.0 — 28 de septiembre](https://github.com/gohugoio/hugo/releases/tag/v0.167.0) | Referencias relativas a partials, slug en páginas de rama, resúmenes HTML más equilibrados. Sustituye `cleanDestinationDir` por `build.cleanDestinationDir.enable`; corrige escape e imports fuera de las rutas permitidas. |
| [0.168.0 — 13 de octubre](https://github.com/gohugoio/hugo/releases/tag/v0.168.0) | Correcciones de seguridad de Go y del minificador, especialmente escape de JavaScript inline y HTTP. Añade `FrameCount`, `firstFrameOnly` para imágenes animadas, métodos de traducción/formato de idiomas y `charset` en compiladores CSS/JS. |

**Lo más destacable para SanSoul:** seguridad; mejor control del coste de imágenes
animadas si se usan en el futuro. El retorno dentro de `if` ya funciona con flujo
normal, pero no se reescriben partials solo por esa posibilidad. `js.Batch` y AVIF
ya existían antes de 0.164.0: no son novedades de esta actualización. Tampoco hay
un nuevo sistema de agrupación de fuentes que sustituya al actual.

## Compatibilidad inspeccionada

- El motor conserva su mínimo 0.164.0: no se introduce una dependencia de APIs
  recientes. Sus partials mantienen un retorno final por compatibilidad. Se
  corrige la explicación antigua de `return` en `AGENTS.md`.
- Las fuentes de Google, Material Symbols, imágenes remotas y el adaptador de
  contenido usan `resources.GetRemote`. Desde 0.166 los destinos privados se
  restringen y los proxies de entorno requieren autorización explícita. No se
  relajan los permisos del proyecto para evitar estas comprobaciones.
- pnpm estable mantiene la resolución dentro de `node_modules/.pnpm`. El modo
  global experimental apunta fuera del proyecto y puede necesitar permisos de
  lectura específicos. Sus benchmarks con 0.164 no prueban compatibilidad con
  0.168; no se habilita en esta referencia.
- Se inspeccionaron los mounts/globs, imports, URLs, resúmenes y configuración.
  No se usa la antigua clave raíz `cleanDestinationDir`, Org, Tailwind,
  `transform.ToMath` ni reemplazos de módulos declarados dentro del tema.
  Los consumidores que sí los usen deben consultar las notas originales.

## Versiones de despliegue

Los archivos `netlify.toml` y `wrangler.toml`, tanto de la referencia como del
motor, indican **HUGO_VERSION=0.168.0**. Node continúa en 22.22.3 y pnpm en
10.28.2 en el consumidor; no se actualizaron paquetes Node sin necesidad.
La consulta al registro encontró pendientes únicamente cambios fuera del rango
actual: Material Symbols 0.34.1 → 0.48.0 y Simple Icons 15.22.0 → 16.35.0.
Cambiar catálogos puede afectar nombres o diseños: no es necesario para Hugo.

Netlify admite `HUGO_VERSION` en `[build.environment]` de `netlify.toml`.
Loren confirma que su flujo de Cloudflare Pages toma las versiones de
`wrangler.toml`; esta referencia conserva allí `HUGO_VERSION=0.168.0`,
`NODE_VERSION=22.22.3` y `PNPM_VERSION=10.28.2`. `.node-version` fija además Node
desde las fuentes. No se modificó ese flujo ni se ejecutó un despliegue remoto.

Fuentes: [Hugo en Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/hugo/),
[herramientas y variables de Pages](https://developers.cloudflare.com/pages/configuration/build-image/),
[configuración de build de Pages](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Evidencia y reversión

La suite inicial de actualización a 0.168.0 pasó: **17 tests, 17 correctos**, sintaxis, prebuild,
producción, imágenes y YAML del CMS. Se compararon builds de las mismas fuentes
con ambos binarios:

- Las rutas publicadas solo cambian por el hash del CSS principal.
- El CSS aumenta 44 bytes: 11 declaraciones pasan de `background-color:initial`
  a `background-color:transparent`, equivalentes para esa propiedad. Cambia el
  minificador incorporado; no se cambió el SCSS del sitio.
- El HTML conserva su contenido tras descontar la versión del generador Hugo y
  la referencia al nuevo hash CSS; no cambiaron URLs ni resúmenes en la referencia.
- El PNG favicon cambia de codificación, pero sus píxeles decodificados son
  idénticos. Las fuentes, SVG y JavaScript mantienen sus bytes.

Los builds de la referencia y del ejemplo copiable también pasaron con caches
remotas nuevas, sin advertencias ni fallback de Google Fonts. El subset de
Material Symbols de esa referencia, antes de ampliar la demo, medía 12.980 bytes.
En `live` se ejercitó un cambio válido de título, YAML inválido y restauración:
el archivo de configuración generado conservó sus bytes durante el fallo y el
servidor recuperó HTTP 200 al corregirlo, sin panic. El YAML inválido sí puede
mostrar HTTP 500 porque Hugo lee también esos datos directamente; conservar el
prebuild no significa servir siempre la página anterior. Una primera aserción
de la prueba exigía erróneamente HTTP 200 durante ese error; se corrigió para
comprobar la conservación del archivo y la recuperación real.
En navegador, la galería recuperada mostró sus 69 divisores, fuentes cargadas,
sin desbordamiento horizontal ni avisos/errores de consola.

El backup de esta actualización está en
`/private/tmp/sansoul-hugo-upgrade-20261015`: binario 0.164.0, configuración previa,
logs y comparación de salidas. Para una reversión temporal puede colocarse el
binario preservado en un directorio propio del PATH; para la reversión de CI hay
que restaurar también `HUGO_VERSION` en los archivos de despliegue. No
borres la instalación nueva ni las copias hasta decidir conservar el resultado.
`/tmp` no es una ubicación de backup permanente.

No se hicieron commits, push, despliegues ni cambios en otros proyectos.
