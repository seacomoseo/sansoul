# Metadatos de vídeo

Los comandos de SanSoul completan `data/video_metadata.json` antes de iniciar Hugo. Es una caché pública persistente: conservarla permite reutilizar metadatos en otros entornos y construir sin volver a consultar los proveedores ni instalar FFprobe para los vídeos locales ya analizados. La persistencia técnica no determina el derecho a conservar datos de un proveedor; véase la política de YouTube más abajo. Durante desarrollo, el supervisor detecta referencias nuevas en `content/` y `data/`, y cambios en los vídeos de `uploads/`.

El generador solo recorre texto de esas dos carpetas, no todos los vídeos del proyecto. Reconoce archivos `/u/…` y enlaces YouTube/Vimeo. No descarga vídeos externos ni ejecuta FFprobe contra URLs. Si un recurso se introduce exclusivamente mediante JavaScript, HTML externo o una fuente remota, no puede descubrirlo automáticamente.

## Obtención y caché

- **Local:** FFprobe lee resolución, rotación, relación de píxeles, duración y etiquetas disponibles. Un SHA-256 identifica el contenido. La caché local generada en `resources/_gen/video-metadata/stats.json` evita incluso recalcular el hash cuando tamaño y fechas del archivo no han cambiado. Se comprueba de nuevo tras un clon o al eliminar `resources/`; si el hash coincide, no se ejecuta FFprobe.
- **Vimeo:** oEmbed proporciona dimensiones de visualización, duración, título y miniatura, según acceso y respuesta del proveedor.
- **YouTube:** oEmbed proporciona título y miniatura. Sus dimensiones describen el reproductor solicitado; **no se guardan como resolución del vídeo**. Con `YOUTUBE_API_KEY` en el entorno se consultan además título, descripción, publicación, duración y `player.embedWidth/embedHeight` mediante Data API. Con los límites de reproductor solicitados, YouTube devuelve ambas medidas cuando conoce la proporción; se guarda únicamente su cociente como `ratio`, no como resolución original. Las entradas antiguas se enriquecen una vez al disponer de clave. La API pública con una clave no proporciona la resolución original; ese dato requiere acceso del propietario o una sobrescritura manual. No se instala ni configura ninguna API de pago.

Los proveedores externos quedan cacheados por identificador, sin caducidad
automática. Los builds reutilizan los datos existentes aunque sean antiguos o no
tengan `fetchedAt`; esa fecha informa de su procedencia, no activa consultas ni
borrados. Las referencias nuevas se consultan y las entradas YouTube sin Data
API se enriquecen una vez al disponer de clave. Los overrides manuales y las
entradas ya no referenciadas se conservan. No se instala un servicio periódico.

Con la cuota estándar de 10.000 unidades diarias, cada `videos.list` consume una
unidad del mismo proyecto de Google Cloud, aunque la clave se use en varios
sitios. No se hacen consultas por visita. Como ejemplo, 70 sitios con 20 vídeos
distintos cada uno sumarían 1.400 unidades al consultar todos. La cuota real
se comprueba en la consola; la implementación actual consulta cada ID por
separado. Véanse [cuotas](https://developers.google.com/youtube/data/determine_quota_cost)
y [retención de datos](https://developers.google.com/youtube/terms/developer-policies#refreshing-storing-and-displaying-api-data).

**Política del proveedor:** Google sigue exigiendo actualizar o eliminar los
datos API no autorizados después de 30 días. No se ha encontrado una excepción
para duración o proporción por considerarlas estables. La caché sin caducidad es
la decisión técnica solicitada para SanSoul; no acredita conformidad con esa
política ni elimina sus requisitos. Git conservaría versiones antiguas aunque
se reemplazase el JSON actual. Antes de distribuir esta integración a otros
proyectos, hay que resolver su conservación conforme a las condiciones
aplicables. No se ha implementado sincronización de la caché con GitHub Actions,
autocommits, un servicio compartido ni cambios de despliegue.

Para refrescar explícitamente los vídeos referenciados, incluso antes de que
termine la espera tras un fallo:

```sh
sh do videos --refresh
```

El mismo ID no garantiza que sus datos permanezcan iguales: el autor puede
[recortar un vídeo conservando su URL](https://support.google.com/youtube/answer/9057455?hl=en-GB)
y cambiar su duración, además de editar título o descripción.
Cuando se conozca uno de estos cambios, `--refresh` permite reemplazar los datos
obtenidos y conserva los overrides. No refresca entradas sin referencias.

El mismo comando funciona tanto con `core` como con `themes/sansoul`. `FFPROBE_BIN` y `FFMPEG_BIN` permiten elegir los ejecutables. FFprobe obtiene los metadatos locales; FFmpeg extrae el primer fotograma cuando hace falta un póster. Con la caché y los pósteres guardados, producción no necesita ninguno de los dos. Ante archivos, herramientas, permisos o red no disponibles se conservan los datos previos y el comportamiento manual. Los fallos de proveedores tienen una espera de 24 horas antes de reintentar; `--refresh` permite hacerlo antes. Los errores no guardan ni imprimen claves de API.

La escritura del JSON es atómica y solo ocurre si cambia su contenido. Al obtener metadatos de nuevo se reemplazan los datos obtenidos anteriormente, para no conservar hechos obsoletos; el objeto manual `overrides` se conserva. No se borran entradas al retirar una referencia: otras páginas o integraciones pueden seguir utilizándolas. El archivo generado de estadísticas no se versiona. El supervisor debe ignorarlo y evitar dispararse por su propia escritura de `video_metadata.json`; Hugo sí lee este último como datos normales.

## Pósteres locales

La prioridad es: `img` de la caja → `#poster=…` → imagen hermana con el mismo nombre → primer fotograma cacheado. Para proveedores se usa la miniatura disponible. Un archivo local referenciado sin `#poster` ni imagen hermana puede preparar un fotograma de respaldo aunque una caja tenga `img`; esa imagen explícita mantiene prioridad al renderizar.

FFmpeg genera un JPEG de hasta 1080 píxeles por lado en `uploads/video-posters/<sha256>-first-frame-v1.jpg`. Es una fuente pública que debe guardarse en Git junto a la caché. Se reutiliza por hash y se recrea si se elimina, incluso con metadatos vigentes y sin `--refresh`. Cambiar el vídeo produce otro nombre; los anteriores se conservan porque pueden seguir referenciados. No se descargan vídeos externos para extraer imágenes. Si FFmpeg falta o falla, se avisa y se conservan las opciones manuales. Sin póster, un vídeo sin `mute` muestra controles y no se reproduce automáticamente.

## Proporciones, dimensiones y datos manuales

El vídeo y su póster usan los mismos atributos HTML `width` y `height`. Se priorizan las dimensiones conocidas; si solo se conoce el ratio, se calculan con el lado mayor de 1080 píxeles. Después se usan las dimensiones del póster elegido explícitamente o del póster local. La miniatura del proveedor no permite deducir la forma del vídeo. Si tampoco hay esas dimensiones y la URL original usa `youtube.com/shorts/`, el respaldo de presentación es vertical 608 × 1080 (9/16 redondeado); no se registra como un hecho ni como un indicador de Short. Una proporción conocida, incluso cuadrada, tiene prioridad. El respaldo restante es 1080 × 608: los atributos HTML requieren enteros, por lo que 607,5 se redondea. Estos respaldos son dimensiones de presentación y nunca se guardan como hechos del vídeo ni pasan al schema.

Solo el `ratio` del autor activa `.img--ratio` y `--img-ratio` en el envoltorio. Ningún medio recibe `aspect-ratio` CSS. Sin ratio explícito, los medios conservan su tamaño natural con `max-width: 100%`. Un observador ajusta la altura del póster y del iframe al ancho disponible, sin estirar su ancho por encima del declarado; también respeta la proporción al sustituir el póster por el reproductor.

En Markdown, el texto alternativo es el nombre accesible y la proporción se indica al final del título:

```md
![Ejemplo de alt](/u/base/video-demo.mp4 "Ejemplo de caption {3/2}")
```

El nombre local automático se humaniza del archivo (`video-demo.mp4` → `Video demo`), sin usar títulos internos ni nombres ficticios. El `alt` de la instancia tiene prioridad; para proveedores se conserva el título obtenido cuando no hay uno explícito.

Los parámetros públicos de metadatos opcionales son `vid_width`, `vid_height`,
`vid_duration`, `vid_upload`, `vid_title` y `vid_desc`. Están disponibles en el
CMS dentro del grupo Imagen de cajas y modales. Sus valores sobrescriben la
caché en esa instancia; omitirlos conserva los datos obtenidos. Los nombres
anteriores se siguen leyendo como alias para no romper contenido existente.
`ratio`, `disc`, `contain`, `mute` y `#poster=…` mantienen su función.

```yaml
vid_width: 1080
vid_height: 1920
vid_duration: PT12S
vid_upload: '2025-01-01 00:00:00'
vid_title: Título del vídeo
vid_desc: Descripción del vídeo
```

`vid_upload` acepta `YYYY-MM-DD HH:mm:ss`, interpretado como UTC, y fechas ISO
8601 con zona. El CMS ofrece selector con segundos y guarda ese formato con
espacio; Hugo normaliza la fecha del JSON-LD a UTC, por ejemplo
`2025-01-01T00:00:00Z`. No se asigna una fecha de publicación por defecto.
El formato de la caché conserva los nombres estándar de metadatos (`width`,
`height`, `duration`, `uploadDate`, `name`, `description`). Para corregir un dato globalmente sin que una actualización lo sobrescriba, añade un objeto `overrides` junto a `metadata` en su entrada:

```json
{
  "version": 1,
  "entries": {
    "youtube:IDENTIFICADOR": {
      "fingerprint": "youtube:IDENTIFICADOR",
      "metadata": { "name": "Título obtenido" },
      "overrides": { "width": 1080, "height": 1920, "ratio": 0.5625 }
    }
  }
}
```

Prioridad: datos obtenidos → `overrides` → valores de esa instancia de medios. Los schemas `VideoObject` incorporan datos reales disponibles. Solo se emiten cuando tienen `name`, `thumbnailUrl` HTTP(S) y `uploadDate` válida, los tres campos requeridos por Google; si falta alguno, se omite el objeto y se emite un aviso para completarlo. `description`, `duration`, `contentUrl` y `embedUrl` enriquecen el resultado cuando están disponibles. `PT1S` es una duración ISO 8601 válida de un segundo; no es un marcador ni un error, y `duration` es recomendable, no obligatoria. La etiqueta local `creation_time` expresa creación y se guarda como `dateCreated`, nunca como `uploadDate`. No se infiere una fecha de publicación a partir de la página, de la creación del vídeo o de la fecha de modificación de un archivo. Sin publicación verificable, proporciona `vid_upload` con la fecha real o un `overrides.uploadDate`; no se inventa para superar el validador. Un JSON-LD completo no garantiza indexación: las miniaturas y vídeos deben ser accesibles para Google.

Fuentes: [Google VideoObject](https://developers.google.com/search/docs/appearance/structured-data/video), [FFprobe](https://ffmpeg.org/ffprobe.html), [Vimeo oEmbed](https://developer.vimeo.com/api/oembed/videos), [YouTube videos.list](https://developers.google.com/youtube/v3/docs/videos/list) y [recurso Video](https://developers.google.com/youtube/v3/docs/videos).

YouTube no publica `isShort` en el recurso Video. La resolución original está en
`fileDetails`, accesible solo al propietario. Los Shorts pueden ser cuadrados o
verticales: no todos son 9/16. La misma ID `xAylvGvkaZg` devolvió por oEmbed
113 × 200 con la URL `/shorts/` y 200 × 150 con `/watch`, con idéntica miniatura
480 × 360. Esto confirma por qué no se usan esas cajas como hechos del vídeo.
Véanse [player y fileDetails](https://developers.google.com/youtube/data/reference/rest/v3/videos#player.embedHeight)
y [los formatos admitidos de Shorts](https://support.google.com/youtube/answer/15424877?hl=en).
