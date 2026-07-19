# Ejemplos y chuletas de SanSoul

Esta carpeta tiene dos funciones inseparables:

1. es un sitio de demostración que permite probar tipos, contenido y componentes del tema;
2. es una referencia humana de los parámetros disponibles y del formato que espera cada uno.

Se mantiene todo bajo `_examples/` para que `data/` y `content/` puedan copiarse directamente a la raíz de un proyecto vacío. Las chuletas viven dentro de esa misma estructura y también se renderizan, por lo que es más difícil que la documentación se quede obsoleta.

## Copiar el ejemplo a un proyecto

Haz primero una copia de seguridad o revisa las colisiones: estos comandos fusionan carpetas y pueden reemplazar archivos con el mismo nombre.

```sh
cp -R themes/sansoul/_examples/data/. data/
cp -R themes/sansoul/_examples/content/. content/
sh do hugo
```

No es necesario copiar `README.md` ni `AGENTS.md`.

El ejemplo presupone que el proyecto dispone de los recursos habituales de la plantilla en `uploads/base/`, especialmente `icon.png`, `logo.svg` y `poster.png`. Las URLs externas sirven para mostrar el comportamiento con recursos remotos y pueden fallar sin red.

## Qué consultar

- `data/section/example.yml`: catálogo amplio de sección, cajas, bloques, formulario, mapa y modales.
- `content/single/componentes.es.md`: página que renderiza el catálogo anterior.
- `content/blog/2020-01-01-entrada.es.md`: sintaxis Markdown, tablas, botones, iconos, imágenes e iframes.
- `content/page/divisores.es.md`: galería visual de separadores.
- `data/types/example.yml`: ejemplo funcional de un tipo y referencia comentada de sus parámetros disponibles.
- `data/config.yml`, `data/langs.yml`, `data/styles.yml`, `data/defaults.yml`, `data/customs.yml` y `data/remote.yml`: esquemas orientativos de configuración.
- los demás archivos de `data/types/` y `content/`: ejemplos semánticos de colecciones y schema.org.

Los comentarios `# [ ... ]` enumeran valores habituales, pero el generador del CMS y el código del tema son la autoridad cuando discrepen. Tras una compilación, consulta `public/admin/config.<hash>.yml` para ver el esquema efectivo.

## Reglas de mantenimiento

- Todo parámetro público nuevo debe aparecer en un ejemplo mínimo y válido.
- Un valor de ejemplo debe demostrar comportamiento, no incluir credenciales ni datos personales reales.
- Los ejemplos deben compilar sin depender de servicios privados.
- Las fechas históricas son deliberadas; evitan que el contenido cambie solo con el paso del tiempo.
- Las páginas de referencia usan `seo.noindex: y` cuando no aportan contenido público real.
- Si se renombra un parámetro, actualiza a la vez renderizado, CMS, i18n, defaults, ejemplos y documentación; añade también una entrada a `MIGRATIONS.md` con la adaptación del proyecto consumidor.

## Validación

La carpeta debe probarse como un proyecto consumidor, no construirse directamente como tema. Copia `data/` y `content/` a un proyecto temporal, ejecuta `sh do hugo` y revisa como mínimo:

- inicio, índices y entradas de cada tipo;
- `/componentes/`;
- `/divisores/`;
- `/admin/`;
- consola del navegador y responsive.
