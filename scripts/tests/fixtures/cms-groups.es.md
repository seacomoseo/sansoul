---
slug: cms-grupos
title: Prueba de grupos
seo:
  noindex: true
unknown:
  empty: ''
  nil: null
  enabled: false
  amount: 0
  items: []
  mapping: {}
tpl:
  sections:
  - params:
      id: grouped-section
      pt: 0
      pb: null
      view: [bg, titles]
      boxes:
      - title: Primera caja
        sub: ''
        pd: null
        lock: false
        tags: []
        unknown: {empty: '', nil: null, enabled: false, amount: 0, items: [], mapping: {}}
        boxes:
        - title: Caja anidada
          md: Contenido anidado
      - title: Segunda caja
        md: Segundo contenido
      modals:
      - id: prueba-modal
        title: Modal de prueba
        md: Contenido del modal
        mute: false
        box:
          color: ''
---

Cuerpo Markdown con **negrita**.
