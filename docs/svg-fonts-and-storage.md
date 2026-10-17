# SVG, fuentes de iconos y almacenamiento local

Evaluación del 15 de octubre de 2026. La conversión de SVG a fuentes no se ha
implementado: esta fase evalúa si compensa antes de añadir otro pipeline.

## Dónde están los catálogos

- Iconos propios: `core/assets/u/icons/`, incluidas sus marcas en `brands/`.
- Font Awesome: `node_modules/@fortawesome/fontawesome-free/svgs/brands/`.
- Simple Icons: `node_modules/simple-icons/icons/`.
- Material Symbols: `node_modules/material-symbols/`.

Las rutas de paquetes son enlaces del árbol de dependencias. Hugo monta esos
recursos como entradas y publica las salidas utilizadas; no copia los catálogos
enteros a `public/`. Los sitios antiguos pueden seguir teniendo el motor en
`themes/sansoul/`.

## ¿Convertir iconos SVG a WOFF2?

Es viable para siluetas monocromas, pero **no se recomienda sustituir el sistema
actual por defecto**. WOFF2 comprime tablas de una fuente OpenType/TrueType: no
es simplemente un contenedor al que añadir SVG arbitrarios. Harían falta
conversión de contornos, métricas, asignación estable de glifos, CSS y validación
visual. Se deben preservar proporciones, huecos y el sentido de los trazados.

Excluir los SVG con varios colores es necesario para un conversor monocromo,
pero no suficiente: hay que considerar strokes, transformaciones, máscaras,
clipping, referencias internas, gradientes, animaciones y estilos variables.
Existen fuentes de color como COLR, con un pipeline más complejo; no resuelven
automáticamente todos esos comportamientos de un SVG. Véanse
[WOFF2](https://www.w3.org/TR/WOFF2/) y
[OpenType COLR](https://learn.microsoft.com/en-us/typography/opentype/spec/colr).

En el estado de referencia anterior a ampliar la demo había 24 SVG propios,
14.414 bytes en total. La inspección inicial marcó al menos siete potencialmente
multicolor/complejos; es una criba, no un validador de conversión. La salida que
combinaba logo, cuatro marcas y un divisor pesaba 4.971 bytes, **2.092 con gzip**;
otra marca aislada, 995/549 bytes. El sprite grande de la galería de divisores
no era un catálogo de marcas y no debe atribuirse a esos iconos.

En desarrollo, generar/subdividir una fuente cada vez que cambian sus iconos
añadiría trabajo. Una fuente precompilada y cacheada evitaría repetirlo, a cambio
de mantener otro artefacto y de reconstruirlo al añadir marcas. No se ha medido
una mejora frente al sistema SVG. En producción podría ganar en páginas con
muchas siluetas repetidas; las pocas marcas actuales ya son pequeñas y comparten
sprites comprimidos. El navegador tendría además que cargar la fuente antes de
mostrar los glifos, salvo fallback.

Solo retomaría un prototipo si un sitio representativo usa cientos de iconos y
la medición muestra que sus SVG son un coste relevante. Compararía bytes
comprimidos, primera visualización, navegación, fidelidad y tiempo de build;
no convertiría todos los catálogos por anticipado.

## Por qué existe `node_modules/.pnpm`

pnpm estable comparte un almacén de contenido entre proyectos y mantiene un
virtual store local para su resolución de dependencias. Las rutas visibles se
repiten; eso no implica que todos sus datos ocupen bloques físicos distintos.

La instalación actual contiene 12.664 archivos regulares, **103,05 MiB aparentes**
en `.pnpm` (el visor puede redondearlos a unos 108 MB decimales). Su almacén
real es `~/Library/pnpm/store/v10`.
Se comprobó que el WOFF2 de Material Symbols tiene su contrapartida de contenido
en ese almacén y está en el mismo volumen, con otro inodo. En APFS los clones
pueden compartir extents aunque tengan inodos diferentes; no se determinó su
ocupación física exacta. No debe sumarse el tamaño visible y presentarlo como
duplicación física demostrada.

Con hardlinks la reutilización se puede comprobar por inodos; el benchmark
aislado de dos proyectos la demostró. El modo automático de importación mantiene
mejor aislamiento al editar archivos, por lo que se conserva como configuración
estable. El Global Virtual Store comparte también la estructura local, pero es
experimental y no se activa para eliminar una cifra aparente del explorador.

## Imágenes animadas en Hugo 0.168

Una animación tiene varios fotogramas. Para una miniatura o un favicon estático
solo interesa uno: `firstFrameOnly` permite procesarlo sin convertir toda la
animación, y `FrameCount` permite detectar si la imagen está animada. Hugo también
evita decodificar todos los fotogramas cuando el formato de salida no admite
animación. No acelera una imagen estática ni convierte automáticamente las
animaciones del sitio en imágenes quietas; no se cambió esa decisión visual.

Fuentes: [configuración de imágenes](https://gohugo.io/configuration/imaging/),
[FrameCount](https://gohugo.io/methods/resource/framecount/).
