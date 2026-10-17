# Desarrollo y dependencias compartidas

Informe de la referencia SanSoul, mediciones del 14 y validación final del 15 de
octubre de 2026. Las mediciones de esta
sesión corresponden a macOS ARM64 y APFS; no son resultados de Linux ni de los
servidores de Netlify/Cloudflare. No se publicaron cambios ni se modificaron
otros proyectos originales.

## Conclusiones rápidas

- pnpm estable: sí; repositorios independientes y versiones fijadas, sin workspace.
- Instalar al clonar o cambiar el lock; a diario basta `sh do dev` o `sh do live`.
- El ahorro depende de versiones y sistema de archivos; no se midieron los 70 repos.
- SVG en desarrollo: conservar detección automática y catálogos completos.
- Producción: JS/CSS por componentes implementados; precarga de texto selectiva y Material Symbols global.
- Hugo actualizado a 0.168.0; [novedades y comprobaciones](hugo-0.168.0.md).

## Decisión y alcance

La referencia usa pnpm **10.28.2 estable**, con almacén de contenido compartido
y virtual store por proyecto. Se conserva npm en los consumidores que todavía
lo usan. No se crea ningún workspace común. El experimento global se activa
por comando, no como requisito del repositorio o del despliegue.

Node se fija en **22.22.3**. Los benchmarks se hicieron con Hugo Extended
**0.164.0**; posteriormente se actualizó a **0.168.0** y se volvió a validar.
Los tiempos de la tabla corresponden a la versión anterior. Antes se
usaban Node 22.22.3/npm 10.9.8 en este Mac; Netlify declaraba Node 23.5.0, fuera
del rango `engines` del proyecto. El lockfile npm existía localmente pero estaba
ignorado. La referencia pasa a tener `pnpm-lock.yaml` disponible para versionar.

No se actualizaron dependencias para convertir el gestor: las 90 identidades
nombre/versión del lockfile original, incluidas variantes de otras plataformas,
se conservaron al importar. Las dependencias directas resueltas son:

| Dependencia | Versión |
| --- | --- |
| `@fortawesome/fontawesome-free` | 7.3.1 |
| `material-symbols` | 0.34.1 |
| `sass-embedded` | 1.105.1 |
| `sharp` | 0.35.5 |
| `sharp-ico` | 0.1.5 |
| `simple-icons` | 15.22.0 |

La instalación pnpm del proyecto actual reutilizó los 27 paquetes necesarios
para esta plataforma en el almacén compartido y tardó 1,3 s según pnpm. Esa
medición es con caché caliente, no una instalación inicial. Sass y una
codificación nativa AVIF con Sharp pasaron por separado.

## Comparación medida

Se usaron copias aisladas de esta referencia y `afree.es`, con versiones
distintas de Sass y Sharp. Se importaron sus locks existentes. Los tiempos son
observaciones individuales de reloj, no diferencias estadísticamente probadas.
La segunda instalación de cada escenario aprovechó el almacén del primero:
no debe llamarse instalación fría independiente.
Los [datos de tiempos e inodos](dependency-benchmark-2026-10-14.json) conservan
las unidades originales en bytes para evitar confundir MB con MiB.
Proyecto, copias y almacenes estaban en el mismo dispositivo de archivos. No
se vació el cache global de recursos de Hugo: los tiempos de build incluyen sus
caches disponibles y el orden de ejecución puede influir. No prueban que cambiar
de gestor acelere por sí mismo el renderizado de Hugo.

| Métrica | npm | pnpm estable, proyecto | pnpm global experimental |
| --- | ---: | ---: | ---: |
| Primera instalación, almacén vacío | 10,04 s | 9,40 s | 8,25 s |
| Segundo proyecto, almacén compartido caliente | 6,50 s | 3,05 s | 2,77 s |
| Borrar solo `node_modules` de prueba y reinstalar, referencia | 1,94 s | 1,10–1,29 s | 1,48 s |
| Reinstalación, segundo proyecto | 1,96 s | 1,29 s | 1,51 s |
| Build completo, referencia | 3,88 s | 2,85 s | 2,90 s |
| Build completo, segundo proyecto | 5,55 s | 5,22 s | 5,29 s |
| Test/check existente, referencia | 3,51 s | 3,69 s | 3,76 s |
| Aparente `node_modules`, referencia, archivos regulares | 119,2 MiB | 103,1 MiB | 38 KiB más destinos compartidos |
| Bloques por proyecto, referencia | 156,4 MiB | 139,8 MiB | 44 KiB más destinos compartidos |
| Almacén/cache compartido, bloques | 63,9 MiB | 165,1 MiB | CAS 165,1 + graph store 172,4 MiB |
| Total dos proyectos + almacén, bloques únicos por inodo | 376,3 MiB | 444,5 MiB | 337,6 MiB |
| Entradas de archivos regulares, conjunto | 25.759 | 36.486 | 24.417 |
| Inodos únicos, incluidos directorios/enlaces | 26.437 | 37.663 | 25.460 |
| Enlaces simbólicos, conjunto | 4 | 106 | 98 |

**Espacio físico real de los extents APFS:** no determinado de forma fiable en
ninguno de los tres escenarios. La fila de bloques suma `st_blocks × 512`,
deduplicando `(st_dev, st_ino)` en el conjunto de proyectos y almacenes y sin
seguir symlinks. Evita duplicar hardlinks, pero no identifica bloques compartidos
por reflinks/clones CoW entre inodos distintos. Las cifras incluyen el cache npm
para mantener el mismo perímetro; no incluyen las salidas del sitio ni el
ejecutable del gestor. Las cifras aparentes cuentan archivos regulares; los
JSON de inventario también registran directorios y symlinks.

El método predeterminado `auto` de pnpm eligió clones en APFS. Por eso no se
debe interpretar 444,5 MiB como ocupación física adicional ni concluir que pnpm
usa más SSD. Se hizo un control con `package-import-method=hardlink` en otras
dos copias: el conjunto contabilizó **165,15 MiB** y se detectaron **25.302
entradas reutilizadas por inodo**, con ambos builds correctos (3,45 y 5,41 s).
Esto prueba reutilización de datos mediante hardlinks; la contabilidad no mide
todos los metadatos internos del sistema de archivos.

Los hardlinks son una opción estable de importación, independiente del modo
experimental global:

```sh
# Solo durante una instalación propia; no modifica configuración global.
pnpm install --frozen-lockfile --config.package-import-method=hardlink
```

No edites dependencias instaladas con hardlinks: cambiar el contenido de un
archivo modifica también las otras referencias al mismo inodo. El modo
automático prefiere CoW y evita esa mutación compartida cuando el sistema de
archivos lo soporta. En Linux sin CoW, `auto` puede utilizar hardlinks; debe
medirse en el mismo volumen del VPS.

### Extrapolación a 70 proyectos

Si los 70 proyectos tuvieran las mismas dos familias de dependencias de estas
copias y compartieran un único cache, el modelo de bloques contabilizados sería:

- npm: `70 × 156,2 MiB + 63,9 MiB`, aproximadamente **10,74 GiB**.
- pnpm estable con CoW automático: hasta **9,71 GiB contabilizados**, sin poder
  deducir cuánto comparten realmente los extents de APFS.
- pnpm estable con hardlinks: un almacén de **165,1 MiB** más unos 48 KiB
  adicionales por proyecto en este control, aproximadamente **0,16 GiB de
  bloques contabilizados**, más metadatos internos no medidos. Frente al modelo
  npm, el ahorro potencial sería unos **10,6 GiB**.
- global experimental: aproximadamente **0,33 GiB contabilizados** si los 70
  reutilizan los dos mismos grafos, más metadatos internos; APFS podría compartir
  datos adicionales por CoW.

Es una estimación condicional, no el ahorro medido de los 70 repositorios. Más
versiones de binarios, dependencias distintas, volúmenes diferentes y caches
históricos amplían el almacén. No se borró ni se midió todo el almacenamiento de
los 70 para prometer una cifra real. El porcentaje extremo del modelo hardlink
solo se sostiene con un conjunto muy homogéneo y no incluye todos los metadatos.

### Compatibilidad y fallos observados

Los seis builds completos (dos proyectos por tres layouts) pasaron con Sass,
CMS, imágenes y Sharp nativo. El test de la referencia pasó en los tres casos;
el segundo proyecto conserva un `test` de scaffold que termina en error con
ambos gestores. Eso es un fallo real de ese script existente, no del linker.
No se encontraron fixtures Astro, Tailwind o TypeScript; no se declaran
verificados sus builds, editores o integraciones.

Una copia nueva con el layout global se instaló offline con lock congelado y
compiló; dos copias se sirvieron a la vez en puertos distintos. El tema antiguo
del segundo proyecto admite `server`, pero todavía no `dev`. No se modificó ese
original para añadirlo. Una reinstalación offline intermedia falló por un
almacén temporal incompleto; la instalación final con red pasó. Los errores de
DNS/bind del sandbox se separaron de las pruebas ejecutadas con acceso aprobado.
Estas pruebas del modo global corresponden a Hugo 0.164.0. Hugo 0.166+ endurece
los permisos de symlinks/imports externos: no se declara validado ese layout
experimental con 0.168.0 ni se amplían permisos para habilitarlo. El modo estable
mantiene sus destinos dentro del `node_modules/.pnpm` del proyecto.

También se creó un repositorio Git temporal con una instantánea de las fuentes
y el lock pnpm, se clonó sin hardlinks de Git y se instaló desde un almacén
pnpm vacío: descargó los 27 paquetes y terminó en 9,8 s; su build completo también
pasó. Ese fixture contiene el
motor como fuentes copiadas, sin publicar un commit del submódulo original. La
primera tentativa de esta prueba falló por `ENOSPC`; después de limpiar solo
dependencias/almacenes desechables del benchmark, la instalación se repitió
correctamente. Los logs y mediciones del benchmark se conservaron.

La instalación automática de `sh do hugo` también se ejercitó con un fixture sin
`node_modules`: usó pnpm y el lock congelado y completó el build. La herramienta
de migración se ejecutó sobre otra copia completa, pasó build/test y restauró
después el gestor npm, su lock y el estado original de dependencias mediante
`--restore`.

## Uso local, CI y nuevos proyectos

En Mac o VPS, activa Node según `.node-version` y pnpm según `packageManager`.
Con Corepack disponible, `corepack pnpm --version` permite comprobar la versión
del proyecto; si instalas pnpm por otra vía debe ser exactamente 10.28.2. No se
instaló ni actualizó globalmente el gestor en esta sesión.

```sh
# Estas dos consultas son opcionales, para diagnóstico:
pnpm --version
pnpm store path
# Necesario al clonar o cambiar el lock, no antes de cada sesión:
pnpm install --frozen-lockfile
sh do dev
# O, en vez del anterior:
sh do live
```

Para usar Hugo sin estas dependencias Node no hacen falta comandos pnpm. SanSoul
sí utiliza paquetes Node para el pipeline completo. `sh do hugo` instala los
paquetes si faltan; los servidores pueden usar Dart Sass del sistema, pero eso
no sustituye los paquetes que requiera el contenido. En esta referencia ya están
instalados, de modo que normalmente basta arrancar `dev` o `live`.

Usa un almacén compartido del usuario en el mismo volumen de los proyectos.
Un sandbox puede impedir escribir en el almacén normal y hacer que pnpm proponga
uno dentro del proyecto; eso no demuestra cómo se comportará fuera del sandbox.
La instalación final de esta referencia usó explícitamente
`~/Library/pnpm/store`, sin cambiar configuración global. No necesita ese
almacén para funcionar en otra máquina: puede reconstruirse desde el lockfile.

Netlify detecta `pnpm-lock.yaml` y el pin `packageManager`; la referencia fija
`PNPM_FLAGS` para congelar el lock y desactivar el store experimental. Cloudflare
Pages conserva `sh do hugo` como comando de build. En el flujo confirmado por
Loren, las versiones se mantienen en `wrangler.toml`. `.node-version` fija Node
también desde el repositorio. Hay que
usar una imagen de build compatible y conservar el lockfile al versionar.
No se accedió al dashboard ni se ejecutó un despliegue remoto: se verificaron
documentación oficial y builds locales, no la infraestructura de los proveedores.

Para nuevos proyectos, copia la referencia con `package.json`, `.npmrc`,
`.node-version` y `pnpm-lock.yaml`, inicializa el submódulo y ejecuta
`pnpm install --frozen-lockfile`. Cambiar dependencias exige actualizar el lock
conscientemente, no ignorarlo ni generar uno nuevo durante CI. Las opciones
experimentales y las rutas absolutas de almacén no son requisitos del proyecto.

## Migración gradual y reversión

La herramienta `scripts/migrate-pnpm.js` recibe rutas explícitas, requiere Git
limpio, una versión exacta de pnpm y un lockfile npm existente. Detecta otros
gestores; rechaza Yarn, workspaces, locks ambiguos y configuraciones que no puede
preservar con seguridad. No convierte un Astro distinto solo por asumir que
tendrá las mismas dependencias: usa sus scripts existentes y comprueba versiones
resueltas, pero su compatibilidad real requiere probar ese proyecto.

Desde una copia de SanSoul con esta versión:

```sh
# Inspección predeterminada; no cambia los proyectos.
node core/scripts/migrate-pnpm.js --project /ruta/proyecto

# Un proyecto.
node core/scripts/migrate-pnpm.js --apply --project /ruta/proyecto

# Lote explícito, secuencial; se detiene ante el primer fallo.
node core/scripts/migrate-pnpm.js --apply \
  --project /ruta/proyecto-a --project /ruta/proyecto-b

# Reversión: usa el backup exacto impreso para ese proyecto.
node core/scripts/migrate-pnpm.js \
  --restore /ruta/.proyecto-pnpm-backup-XXXXXX --project /ruta/proyecto
```

La migración importa el lock, instala congelado, compara versiones resueltas y
ejecuta build/test existentes antes de declarar éxito. Si una dependencia
necesita un script no aprobado, falla: revisa el paquete/versión y declara una
autorización estrecha antes de reintentar. No concede permisos a todos los
scripts. La referencia permite únicamente `@parcel/watcher@2.6.0`, cuyo script
revisado compila desde fuentes solo cuando se solicita expresamente.

Los backups hermanos quedan fuera del proyecto y de la salida pública; contienen
configuración y dependencias originales, por lo que pueden contener un `.npmrc`
privado. Se conservan tras éxito y deben mantenerse privados. La reversión
comprueba la relación de rutas, los archivos necesarios y los cambios posteriores
en la configuración antes de actuar;
si detecta cambios que no puede preservar, se detiene. No borres el backup hasta
terminar la validación y decidir cuánto tiempo necesitas conservar la reversión.
La herramienta no hace commits, push ni despliegues.

En esta referencia la conversión se integró conservando una copia inicial en
`/private/tmp/sansoul-original-20261014`, incluido el `node_modules` npm original.
Para revertir esta sesión, detén primero cualquier servidor, conserva el
`node_modules` pnpm actual si lo necesitas, restaura `package.json`,
`package-lock.json`, `.gitignore`, `netlify.toml`, `wrangler.toml` y los módulos
npm desde esa copia, y retira los nuevos `.npmrc`, `.node-version` y
`pnpm-lock.yaml` después de preservar sus cambios. Los alias y la limpieza del
tema son independientes de la conversión de gestor; revisa su diff por separado.
Los backups temporales no son almacenamiento permanente: conserva una copia
fuera de `/tmp` si necesitas una reversión de larga duración.

## Recursos durante desarrollo

No se modificó el renderizador de SVG ni el pipeline de producción. El supuesto
de copiar todos los catálogos a `public/` no se confirmó: el servidor de prueba
publicó 49 archivos, aproximadamente 4,8 MB, siete SVG y tres sprites, sin copiar
los SVG de marca individuales de los paquetes.

Los catálogos montados contienen 609 SVG de Font Awesome (765.101 bytes), 3.383
de Simple Icons (4.950.806 bytes) y 16 archivos de Material Symbols (12.207.673
bytes). Son fuentes disponibles para Hugo, no necesariamente salidas públicas.
Moverlas a `../_tools` no elimina su indexación o vigilancia. Compartir un único
`node_modules` mutable también haría difícil usar versiones distintas; pnpm
resuelve ese problema manteniendo árboles de resolución independientes.

En una copia temporal se restringieron los mounts a las marcas ya utilizadas.
Las mediciones del servidor fueron:

| Medida | Montajes actuales | Solo marcas usadas |
| --- | ---: | ---: |
| Build inicial de Hugo servidor | 947 ms | 729 ms |
| Reconstrucción 1 | 761 ms | 605 ms |
| Reconstrucción 2 | 759 ms | 610 ms |
| Reconstrucción 3 | 737 ms | 650 ms |
| Build desarrollo completo, tres ejecuciones | 1,57 / 1,08 / 1,25 s | 0,98 / 0,90 / 0,87 s |

Son muestras pequeñas con caché caliente, no un benchmark estadístico. El
filtro conservó los mismos recursos de salida y Hugo siguió vigilando los
directorios completos. Omitir todos los catálogos falló: el contenido actual
necesita diez marcas.

Recomendación: conservar el renderizador actual hasta justificar una segunda
ruta con un proyecto que sufra reconstrucciones lentas. Los filtros manuales
ahorraron unos 120–150 ms por reconstrucción, pero fallarían al añadir una marca
no incluida. No se midió un renderizador alternativo individual/inline, por lo
que no se le atribuye una mejora de velocidad.

"Restringir los catálogos" fue permitir en una copia de prueba solo las marcas
que ya aparecían en el sitio. Si después se añade otra marca, Hugo no puede
encontrarla hasta ampliar esos mounts y reiniciar. El sistema actual ya detecta
su uso automáticamente porque dispone del catálogo completo: no hay nada que
configurar al añadir una marca instalada. Mantenerlo es la opción recomendada;
montar un catálogo como entrada no significa copiarlo entero a `public/`.

Es viable mantener `<use>` con un archivo individual servido por Hugo. Si se
usa un fragmento `archivo.svg#id`, ese ID debe existir en el documento SVG. No
se puede apuntar a una ruta de disco `../_tools/node_modules` desde el navegador:
hace falta publicar o servir el recurso. Inyectar solo los iconos utilizados
evita esa petición externa, a cambio de repetirlos en el HTML. El tema ya tiene
publicación individual y casos inline; no basta con cambiar la cadena `href`
sin conservar vistas, IDs, animaciones y referencias internas.

Material Symbols usa correctamente la fuente completa local en desarrollo
(3.301.544 bytes en la prueba), evitando peticiones de subsetting al editar
iconos. Producción publicó su subset de 12.980 bytes.

## Producción: evaluación y evolución

La evaluación inicial de esta sección precedió a SanSoul 7.7. Desde esa versión
se aplican la selección de módulos JS/SCSS y las precargas críticas descritas en
[recursos de producción](production-assets.md). Material Symbols conserva su
subset global y no se convierten SVG a fuentes. No se ejecutó PageSpeed.

**Material Symbols:** se puede generar un subset por conjunto distinto de
glifos de página y reutilizarlo cuando dos páginas tienen el mismo conjunto.
También es posible estudiar una base común y extras por familia de páginas.
La ganancia depende del número de glifos exclusivos: con un subset global de
unos 13 KB, más fuentes, peticiones y fallos de caché pueden costar más de lo que
ahorran. La unión global actual ofrece una sola descarga reutilizable al navegar.
Debe medirse transferencia comprimida en primera visita y navegación, además
de LCP, CLS y tiempo de build con los endpoints de Google funcionando.
Recomendación actual: mantener el subset global. Dividir ligaduras no se resuelve
con un `unicode-range` sobre las letras de sus nombres.

El agrupado exacto de SVG no se traslada literalmente a WOFF2: cada fuente
necesita tablas y reglas de shaping. Las ligaduras de Material Symbols son
nombres de texto; dividir por `unicode-range` de esas letras no identifica el
icono. Para varias fuentes compatibles hay que resolver explícitamente
ligaduras, selección de familia o representación por codepoints. El CMS necesita
seguir previsualizando todos los iconos, independientemente de los subsets del
sitio.

**CSS:** una base común más CSS de componentes presentes puede reducir descarga
y parseo. Hay que detectar estados dinámicos, menús, modales, validación y
contenido CMS, preservando el orden de la cascada. Un purgado por clases vistas
en el HTML inicial puede borrar estados válidos. Conviene agrupar por componentes
o familias de página antes de crear un archivo totalmente distinto por URL.

**Fuentes de texto:** cargar solo familias y pesos realmente necesarios es
razonable. Antes de generar subsets por página, conviene revisar que `head.html`
precarga actualmente todas las variantes configuradas en todas las páginas:
limitar la precarga a las fuentes críticas evita forzar descargas innecesarias.
Un subset por texto debe cubrir traducciones y contenido dinámico, además de
mantener una caché útil entre páginas. No se ha implementado ese cambio.

**JavaScript:** una base y módulos condicionales para mapa, formularios, galería,
vídeo y otros componentes tienen más posibilidades de aportar valor. Actualmente
hay imports dinámicos y algunos módulos condicionales, pero `js.Build` no pide
explícitamente splitting; escribir `import()` por sí solo no prueba que exista
una descarga independiente. Hugo ofrece `js.Batch` para grupos con splitting.
Haría falta registrar capacidades por página y
conservar módulos usados tras interacciones o por el CMS. Cientos de grupos
exactos pueden empeorar peticiones, compresión y caché. Esta fue
la evaluación inicial; la implementación posterior selecciona una entrada por
conjunto de componentes y parámetros, sin introducir `js.Batch` ni chunks por URL.

Orden recomendado de experimentación: **JS por componentes → CSS por componentes
y precargas de fuentes → Material Symbols por grupos solo si compensa**. La
misma regla de grupos exactos de SVG no es una solución universal para los cuatro.

## Comandos y limpieza

`sh do dev` hace un prebuild inicial y arranca Hugo. `sh do live` además vigila
entradas de prebuild, publica configuración válida de forma atómica y conserva
la última configuración cuando falla una regeneración. Tras una actualización
válida reinicia Hugo y reconstruye desde cero. `server` y `local`
continúan como alias compatibles. Los argumentos de Hugo se transmiten a ambos.

Conservar el prebuild válido no oculta errores del contenido original: si un
YAML que Hugo lee directamente es inválido puede aparecer su pantalla de error
HTTP 500 hasta corregirlo. El supervisor permanece activo y se recupera después.

Al cerrar los procesos administrados se eliminan `public/`, `resources/`,
`.hugo_build.lock` y `core/prebuild/public/`. No se eliminan paquetes ni
cachés globales. El bloqueo `.sansoul-dev.lock` impide compartir la salida entre
comandos administrados simultáneos del mismo proyecto; dos copias independientes
pueden trabajar a la vez. Un Hugo ejecutado directamente fuera de `sh do` no
participa en ese contrato. Ctrl-C, SIGTERM y SIGHUP permiten ejecutar limpieza;
SIGKILL o un apagado no. Cerrar un terminal permite limpiar cuando envía SIGHUP
al supervisor.
Un bloqueo abandonado se rechaza: inspecciona el PID de
`.sansoul-dev.lock/owner` y retíralo solo después de comprobar que su proceso ya
no existe. No se elimina automáticamente porque dos recuperaciones simultáneas
podrían borrar un bloqueo recién adquirido por otro proceso.

### Validación final de los cambios

`sh do check` terminó correctamente: sintaxis de scripts, **17 tests, 17
correctos**, prebuild, build de producción, imágenes y configuración CMS. Los
18 archivos SVG, WOFF2, CSS y JavaScript publicados conservaron exactamente sus
rutas y SHA-256 respecto al build npm original bajo Hugo 0.164.0. La actualización
posterior a 0.168.0 cambia la minificación CSS y la codificación PNG, como detalla
la [validación específica](hugo-0.168.0.md). Se compiló también el ejemplo
copiable; sus avisos de Google Fonts por DNS usaron el fallback local y no se
tomaron como una validación del subset remoto ni como una medición PageSpeed.

Con Hugo Extended 0.164.0, una primera implementación que refrescaba la
configuración sin reiniciar produjo un panic tras cambios rápidos
válido → inválido → restaurado. Se sustituyó por reinicio completo después de
cada prebuild válido. La prueba real repitió esa secuencia, recuperó HTTP 200 y
completó seis arranques sin panic; un prebuild inválido conservó la última
configuración válida. Los fallos al crear watchers ahora terminan con error
en lugar de dejar un servidor sin vigilancia.

Se comprobaron en navegador la home, componentes y divisores, incluida una
vista móvil de 390 px sin desbordamiento ni errores de consola, y el acceso al
CMS hasta su pantalla de autenticación. No se guardó contenido ni se enviaron
formularios. SIGTERM se ejercitó con ambos servidores y SIGHUP con `dev`: no
quedaron las cinco rutas generadas ni el bloqueo; `dev` devolvió 143 y 129
respectivamente. La suite cubre también SIGHUP en `live`.

El sandbox impidió algunas operaciones de red, bind y watchers (incluido un
`EMFILE` al crear watchers). Las comprobaciones correspondientes se repitieron
con acceso aprobado y pasaron. La validación no cubre Linux, Astro, editores
TypeScript ni despliegues remotos. Al terminar esa primera fase, la versión
compatible del proyecto quedó en 7.6.0, sin migraciones pendientes. La integración
posterior de `core` y recursos por componentes corresponde a 7.7.0. No se crearon
commits ni se adelantó el gitlink del submódulo.

## Ruta `core`

La referencia usa ahora `core/`: es corto y describe el motor compartido, que
incluye renderizado, prebuild, CMS y herramientas. Los consumidores existentes
pueden conservar `themes/sansoul/`; ambas ubicaciones se resuelven al ejecutar.
El cambio no aporta por sí mismo ahorro de dependencias ni velocidad de build.

Se conservan el repositorio remoto, el commit instalado y el almacén interno
`.git/modules/themes/sansoul`. Solo cambia la ubicación de su checkout. La
[migración y reversión](core-migration.md) explica las rutas, la configuración
Hugo y el estado Git pendiente de registrar.

## Validación integrada 7.7.0

La comprobación final `sh do check` pasó **27/27 pruebas**, sintaxis JavaScript y
shell, prebuild, producción, imágenes y configuración CMS, sin advertencias ni
fallback de fuentes. La revisión independiente corrigió dos problemas reales:
JSON-LD activaba innecesariamente los bundles completos y una carpeta `core`
ajena podía confundirse con el motor legado durante la limpieza. Sus regresiones
quedaron cubiertas. El archivo CMS editado por Loren conserva exactamente su
SHA256 inicial, incluidos `table_columns` y `bulk_edit`.

Un clon recursivo de orígenes Git **temporales locales** inicializó el submódulo
con nombre interno `themes/sansoul` en `core`. La instalación congelada reutilizó
27 paquetes, descargó cero y tardó 1,6 s. Pasaron el build del consumidor y el
del ejemplo copiable; el CMS del ejemplo se parseó y conservó esos campos.
Esto valida la reproducción de las fuentes pendientes, no su disponibilidad en
GitHub: los repositorios reales siguen sin commit ni publicación.

En `live` del clon se verificaron cambio válido, YAML inválido y restauración:
la configuración publicada conservó exactamente sus bytes durante el fallo y
el servidor recuperó HTTP 200 al corregirlo. SIGINT cerró los hijos y eliminó
`public`, `resources`, `core/prebuild/public`, `.hugo_build.lock` y el bloqueo.
Durante el YAML inválido Hugo puede dejar de servir porque también lee esos
datos directamente. No se garantiza HTTP 200 mientras la fuente sea inválida.

Una pasada intermedia agotó la espera de un watcher; la prueba aislada y las
repeticiones integradas posteriores pasaron, sin una causa demostrada para ese
timeout. Otras comprobaciones intermedias detectaron fixtures que heredaban el
token del proceso exterior o no creaban el archivo `do` del motor: se corrigieron
los fixtures sin debilitar las aserciones de seguridad.

Se verificaron en navegador portada móvil de 390 px, menú, blog y relaciones,
slider, FAQ, modal, validación de formulario vacío y los 69 divisores, sin
desbordamiento ni errores de consola en el sitio. El CMS cargó hasta su pantalla
de acceso y emitió avisos de esquema por opciones que ignora (`opts`,
`max_file_size`, `show_raw`, `extension`, `_anchors`, entre otras). Esas opciones
también están presentes en el YAML de referencia anterior a esta fase; no se
amplió la tarea a refactorizar el generador CMS. No se autenticó ni guardó una
entrada desde el editor. Los formularios no se
enviaron. Se comprobaron 132 bloques JSON-LD válidos y las referencias locales
del HTML generado sin destinos ausentes.

Los [tamaños por componentes](production-assets.md) distinguen prueba aislada y
demo real. La compatibilidad del consumidor quedó en **7.7.0**. No se midió
PageSpeed ni se probaron servidores Linux o despliegues remotos.

Evidencia temporal: `/private/tmp/sansoul-core-migration-20261015` y
`/private/tmp/sansoul-core-final-clone-20261015/independent-validation`.

## Fuentes oficiales consultadas

- [pnpm 10: configuración y almacenes](https://pnpm.io/10.x/settings)
- [pnpm: Global Virtual Store](https://pnpm.io/global-virtual-store)
- [pnpm import](https://pnpm.io/cli/import)
- [Cloudflare Pages: imagen de build y variables](https://developers.cloudflare.com/pages/configuration/build-image/)
- [Netlify: dependencias de build](https://docs.netlify.com/build/configure-builds/manage-dependencies/)
- [Google: Material Symbols y `icon_names`](https://developers.google.com/fonts/docs/material_symbols)
- [Hugo: configuración de temas](https://gohugo.io/configuration/all/)
- [Hugo: grupos JavaScript con `js.Batch`](https://gohugo.io/functions/js/batch/)
