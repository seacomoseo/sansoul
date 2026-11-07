---
slug: laterales-y-etiquetas
title: Medios laterales y etiquetas flotantes
seo:
  noindex: true
tpl:
  sections:
  - id: side-alternating
    title: Laterales automáticos en container pequeño
    size: xs
    box:
      cols: 2
      sides: true
    boxes:
      - title: Lateral izquierdo
        img: /u/base/poster.png
      - title: Lateral derecho
        img: /u/base/poster.png
  - id: side-center
    title: Lateral central
    size: xs
    box:
      cols: 1
    boxes:
      - title: Ancho de viewport
        side: center
        img: /u/base/poster.png
  - id: floating-labels
    title: Etiquetas flotantes
    boxes:
      - form:
          id: floating-audit
          labels: both
          action: about:blank
          mail: info@example.com
        inputs:
          - type: text
            name: Nombre
            req: true
            icon: person
          - type: phone
            name: Teléfono
          - type: mail
            name: Email
          - type: date
            name: Fecha
          - type: time
            name: Hora
          - type: select
            name: Tema
            items:
              - key: one
                label: Uno
              - key: two
                label: Dos
          - type: area
            name: Mensaje
---
