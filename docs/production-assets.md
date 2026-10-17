# Recursos de producción compartidos por uso

SanSoul selecciona módulos completos a partir del cuerpo final renderizado de
cada página: datos, herencia, Markdown, shortcodes y modales ocultos ya están
expandidos. En producción, las páginas con conjuntos distintos reutilizan código
común por URL. Desarrollo conserva un único CSS completo y un único JavaScript
completo.

## JavaScript

Las entradas usan imports estáticos e inicializadores explícitos. `js.Batch`
compila conjuntamente sus grafos y extrae fragmentos compartidos según el uso
real del sitio. Una página con formulario no descarga mapa o reproductor si no
los necesita. Dos páginas con componentes distintos pueden reutilizar el mismo
fragmento base y otros fragmentos coincidentes; no se compila un bundle completo
por cada combinación. Los módulos conservan todos sus selectores y estados.

Las entradas se registran al renderizar cada página y el lote se publica en
`templates.Defer`, después de conocer todas las páginas. Los scripts selectivos
usan `type="module"`. Cada configuración global distinta obtiene su propio lote,
incluidas las diferencias entre idiomas. Los módulos compartidos leen
`@params/config`; los mapas SVG por página siguen disponibles para integraciones
que solicitan recursos completos.

Los fragmentos reciben los hashes de esbuild. Además se publica cada entrada con
un hash de su contenido, en su misma carpeta: cambiar una dependencia cambia
su import y también la URL de entrada, sin romper las rutas relativas. Un guard
impide instalar dos veces los inicializadores de la entrada.

## CSS y cascada

Los segmentos autocontenidos de hasta **1.024 bytes** se insertan en `<style>`
en la misma posición que su enlace. Se conservan selectores, origen y orden;
no son atributos `style=` y no aumentan la especificidad. Cualquier segmento
con referencias `url()`, imports o escapes se mantiene externo para conservar
la base de sus recursos. `params.assets_inline_css: false` mantiene todos los
enlaces, por ejemplo para una CSP que no permita nuevos bloques inline.
La exclusividad de una página no justifica insertar una hoja grande.

El receptor de preview usa un bootstrap pequeño: sólo se descarga su módulo
con hash dentro de un iframe con token. Una visita normal no lo pide.
Los chunks de producción y el receptor con hash tienen reglas `immutable` en
`_headers`; la cabecera efectiva queda pendiente de comprobar tras un despliegue.

En la misma fixture de inicio, el cambio elimina cinco peticiones CSS y una
del receptor. HTML + CSS externo + receptor pasan de **40.786 a 34.964 B gzip**
(−5.822 B); esta suma excluye el JS común y las fuentes. El HTML crece de 8.144
a 9.132 B gzip. Es una comparación de bytes, no una puntuación de PageSpeed.
En visitas repetidas, los segmentos inline vuelven a viajar con el documento;
los grandes siguen aprovechando la caché compartida.

Los módulos JS siguen externos. Insertar una entrada con imports relativos
cambiaría su base a la del documento y también puede cambiar la ejecución de
scripts clásicos. Una futura optimización debe resolver esas rutas y comprobar
subrutas, CSP, caché y orden; no se decide sólo por tamaño.

El grafo Sass selectivo se compila **una sola vez por configuración**. Antes se
marcan los límites entre grupos contiguos de `@use` utilizados por las mismas
páginas; después se separa el CSS compilado en esos límites. El HTML enlaza los
segmentos en el orden original. El código base puede ocupar varios segmentos:
juntarlo en un solo archivo movería reglas a través de los componentes y podría
cambiar la cascada.

Esta separación no recompila cada componente con sus dependencias ni repite las
propiedades personalizadas compartidas. La prueba reconstruye todos los
segmentos y verifica que, al minificarlos conjuntamente, el resultado coincide
exactamente con el CSS completo. Conserva también los estados de error, abierto,
focus, etc. Las hojas selectivas bloquean el primer pintado para que la página no
aparezca con solo algunos segmentos cargados.

El preview del CMS sigue publicando su hoja completa independiente. El parcial
`styles` devuelve un recurso; la lista ordenada selectiva queda en
`page.Store["sansoul.assets.styles"]`. El preview guarda y restaura esta lista
al solicitar su CSS completo.

## Integraciones y modo completo

HTML/scripts inyectados, `custom.js`, entradas sobrescritas y SCSS personalizado
con imports, extensiones o interpolación conservan los recursos completos. Los
bloques `application/ld+json` y `application/json` permiten la selección;
los scripts ejecutables o de tipo desconocido requieren el modo completo.

Para una integración dinámica que no pueda inferirse:

```yaml
# hugo.yml
params:
  assets_full: true
```

También se admite `assets_full: true` en el front matter. Es una salida técnica,
sin control editorial adicional en el CMS. Desarrollo y modo completo mantienen
su ruta de compilación única y sus scripts clásicos.

## Fuentes e iconos

Todos los `@font-face` configurados permanecen disponibles. Producción selectiva
precarga el peso normal del cuerpo y el del título cuando hay títulos,
deduplicando URLs. No fuerza las variantes cursivas o negritas por estar
configuradas. Si varios pesos comparten un WOFF2 variable se reutiliza su URL;
el lector remoto conserva el peso correspondiente a cada variante.

Material Symbols mantiene su subset global de producción y el catálogo local
completo en desarrollo. SVG conserva sus grupos por uso. La prueba de un único
sprite en desarrollo apenas mejoró el tiempo un 2% y añadió aproximadamente
60 KB a una página sencilla; no justificó cambiarlo. Véase la
[evaluación SVG/WOFF2 y almacenamiento](svg-fonts-and-storage.md).

## Mediciones y coste inicial

Comparación aislada del mismo consumidor y compilador Hugo 0.168, antes y después
de agrupar. Los valores son bytes gzip de CSS y JavaScript propios; se sigue el
grafo de imports y se cuentan una vez las URLs ya visitadas. No incluyen HTML,
imágenes, fuentes, peticiones diferidas de terceros ni el receptor del CMS.

| Recorrido inicio → componentes → vídeos → blog | Antes | Compartido | Reducción |
| --- | ---: | ---: | ---: |
| JavaScript | 47.089 B | 16.649 B | 65% |
| CSS | 61.088 B | 27.257 B | 55% |

La caché compensa visitas sucesivas. Una visita fría al inicio aumenta:

| Inicio sin caché | Antes | Compartido |
| --- | ---: | ---: |
| JavaScript gzip | 12.995 B | 16.000 B |
| CSS gzip | 22.657 B | 26.741 B |
| Archivos JS / CSS | 1 / 1 | 7 / 13 |

La compresión separada pierde diccionario y suma peticiones. En esta muestra el
inicio frío necesita un 23% más de JS y un 18% más de CSS; el ahorro corresponde
al recorrido con caché, no a una promesa de mejorar el primer acceso ni a una
medición de PageSpeed. El número y tamaño de fragmentos dependen de los conjuntos
presentes en cada sitio. El CSS y JS completos del preview no se descargan en la
visita pública normal.

## Verificación

`scripts/tests/asset-delivery.test.js` comprueba el orden CSS exacto entre
segmentos inline y externos, referencias relativas, subrutas, el flag de
desactivación, las reglas de caché y la descarga condicional del receptor.

`node --test scripts/tests/production-assets.test.js`, desde el motor, usa Hugo
real en un consumidor temporal, con fuentes locales para evitar depender de la
red. Comprueba reutilización entre conjuntos, reconstrucción exacta de la
cascada, propiedades compartidas sin duplicar, cambios transitivos y hashes,
modales/shortcodes, atributos sin comillas, JSON-LD, estados de componentes,
traducción, fallbacks, fuentes remotas simuladas y desarrollo con un bundle por
tipo. Se verificó con Hugo 0.164 y 0.168.

También se compiló el consumidor y el ejemplo copiable con el pipeline completo,
y se abrió la página de vídeos en producción, sin errores de módulos en consola.
Los avisos de DNS de Google Fonts se registraron aparte; estas cifras no son un
resultado de PageSpeed. La validación del consumidor debe incluir `sh do check`,
el ejemplo copiable y navegador en producción. No hagas envíos reales desde los
formularios de demostración.
