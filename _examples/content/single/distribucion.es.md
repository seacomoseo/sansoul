---
slug: distribucion
title: Columnas de enlaces y formularios
sum: Casos de referencia para columnas, proporciones y mínimos de campos.
seo:
  noindex: true
tpl:
  sections:
  - id: enlaces-naturales
    title: Enlaces con defaults
    boxes:
      - link:
          url: /componentes/
          il: construction
          btn: cta
        links:
          - type: custom
            label: Uno
          - type: custom
            label: Otro enlace con texto largo
  - id: enlaces-columnas
    title: Enlaces por columnas
    boxes:
      - link:
          cols: 3
          cols_vs: 2
          align_x: flex-start
          url: /componentes/
        links:
          - type: custom
            label: Una columna
          - type: custom
            label: Media columna
            fit: 0.5
            fit_vs: 1
  - id: enlaces-proporcion
    title: Proporción sin columnas
    boxes:
      - link:
          align_x: flex-start
          url: /componentes/
        links:
          - type: custom
            label: 100 % pequeño, 75 % grande
            fit: 0.75
            fit_vs: null
  - id: campos-automaticos
    title: Campos automáticos sin desbordamiento
    box:
      cols: 1
      pd: 2
      pd_vs: 2
    boxes:
      - form:
          id: automaticos
          action: about:blank
          mail: info@example.com
          label: Prueba sin envío
        inputs:
          - type: text
            name: Nombre
            label: Nombre de prueba
          - type: mail
            name: Email
            label: Email de prueba
          - type: area
            name: Mensaje
            label: Campo completo por defecto
  - id: campos-columnas
    title: Campos por columnas
    boxes:
      - form:
          id: columnas
          action: about:blank
          mail: info@example.com
          label: Prueba sin envío
          cols: 3
          cols_vs: 2
        inputs:
          - type: text
            name: Normal
            label: Una columna
          - type: text
            name: Proporcion
            label: Media columna grande
            fit: 0.5
            fit_vs: 1
          - type: area
            name: Completo
            label: Completo aunque haya columnas
          - type: area
            name: Explicito
            label: Columna explícita en un textarea
            fit: 1
  - id: cajas-grow
    title: Cajas con crecimiento optativo
    box:
      cols: 3
      cols_vs: 2
      align_x: grow
    boxes:
      - title: Una caja
        md: Contenido de muestra.
      - title: Otra caja
        md: Contenido de muestra.
---

No envíes datos personales: estos formularios sólo sirven para comprobar su
distribución y no están conectados a un servicio de envío.
