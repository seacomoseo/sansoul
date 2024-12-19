---
title: Página de Ejemplo
slug: unica
image: base/poster.png
draft: true
noindex: true
translationKey: single
seo: null # string
description: llll➤ Ésto es una página de ejemplo que me servirá para copiar y pegar valores ✅ by lorensansol.
background:
  color: null # [ main, main-light, main-dark, alt, alt-light, alt-dark, link, link-light, link-dark, white, light, grey, dark, black ]
  gradient: null # [ main, main-light, main-dark, alt, alt-light, alt-dark, link, link-light, link-dark, white, light, grey, dark, black ]
  gradient_type: null # [ linear-r, linear-b, linear-t, linear-r, linear-l, linear-tr, linear-br, linear-tl, linear-bl, circle, circle-alt, radial, radial-alt ]
  bg: null # string
  alpha: 0 # [ 0.00 - 1.00 ]
  parallax: null # [ none, fix, soft ]
menu:
  hide: false
  logo: false
  sticky: null # [ auto, xs, sm, md, lg, xl, none ]
  logo_sticky: false # color and gradient is only active with this and when screen < sticky
  logo_align: null # [ left, center, right ]
  size: null # [ xs, sm, md, lg, xl, fluid ]
  transparent: true
  color: null # [ main, main-light, main-dark, alt, alt-light, alt-dark, link, link-light, link-dark, white, light, grey, dark, black ]
  gradient: null # ¿?
  gradient_type: null # ¿?
  show_sections: true
  show_modals: false
  hide_icons: false
  # es: <- in data/template.yml
  image: null # string image path
  title: null # string
  subtitle: null # string
  items:
  - link: null # string; `langs` to relocate langs; `translate` to relocate translate
    icon: 1 # https://fontawesome.com/search?o=r&s=solid&f=brands%2Cclassic
    label: null # string
    anchor: null # string
    ofuscate: true
    button: none
    font_alt: false
    ga4: false
callnow:
  show: null # [ items, auto, hide ]
  es:
  - type: phone # [phone, whatsapp, mail]
    label: 123456789
    button: link # [ main, link, alt, light, dark, invert, similar, none ]
  - type: whatsapp
    label: 123456789
    button: whatsapp # [ main, link, alt, light, dark, invert, similar, none ]
  - type: custom
    link: '#principal'
    icon: person-from-portal
    label: Personalizado
    anchor: Mola Mazo
    ofuscate: false
    button: light # [ main, link, alt, light, dark, invert, similar, none ]
    ga4: false
section: []
modal: {}
sections:
- file: example
  modals:
  - file: example
---
