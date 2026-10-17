---
slug: vista-previa
title: Vista previa visual de SanSoul
sum: Edita este título, resumen e imagen en Sveltia. El iframe actualiza la página real sin guardar.
img: /u/base/poster.png
seo:
  noindex: true
tpl:
  sections:
  - params:
      id: hero
      name: Presentación vinculada a los campos de página
      color: main-light
      boxes:
      - get:
        - to: title
        - from: sum
          to: md
        - to: img
        hn: h1
  - params:
      id: preview-story
      boxes:
      - title: Una sección editable
        md: Este texto se actualiza al escribir. En esta prueba el Markdown se muestra como texto plano para mantener el canal de datos seguro y acotado.
        img: /u/base/poster.png
        alt: Imagen de muestra
        ratio: 16/9
  - params:
      id: preview-card
      boxes:
      - title: Una segunda sección
        md: Puedes reordenar y quitar secciones. Las nuevas secciones sencillas reutilizan el HTML de esta sección, generado por Hugo.
        img: /u/base/icon.png
        alt: Icono de ejemplo
        ratio: 16/9
---
