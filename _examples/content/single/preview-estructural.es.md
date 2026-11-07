---
slug: preview-estructural
title: Preview estructural local
sum: Este bloque se resuelve con get y se copia a Markdown mediante remap.
seo:
  noindex: true
tpl:
  sections:
  - id: structural-proof
    boxes:
      - hn: h1
        get:
          - to: title
      - if: sum
        hn: h2
        get:
          - from: sum
            to: title
        remap:
          - from: title
            to: md
            copy: true
---
