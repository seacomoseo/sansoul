---
slug: carrusel-infinito
title: Carrusel infinito opcional
seo:
  noindex: true
tpl:
  sections:
  - title: Continuidad con elementos originales
    md: Arrastra horizontalmente o usa las flechas para pasar del ocho al uno en ambos sentidos. Los indicadores conservan el número original y los enlaces mantienen su foco. El movimiento automático está desactivado en este ejemplo.
    box:
      cols: 2
      cols_vs: 1
      slider: true
      infinite: true
      time: 0
      pips: pill
      arrows: main
    boxes:
    - id: tarjeta-uno
      title: Uno
      md: Primer elemento, que vuelve después del ocho.
      url: /componentes/
      label: Ver componentes
    - id: tarjeta-dos
      title: Dos
      md: Segunda tarjeta del recorrido.
    - id: tarjeta-tres
      title: Tres
      md: Tercera tarjeta del recorrido.
    - id: tarjeta-cuatro
      title: Cuatro
      md: Cuarta tarjeta del recorrido.
    - id: tarjeta-cinco
      title: Cinco
      md: Quinta tarjeta del recorrido.
    - id: tarjeta-seis
      title: Seis
      md: Sexta tarjeta del recorrido.
    - id: tarjeta-siete
      title: Siete
      md: Séptima tarjeta del recorrido.
    - id: tarjeta-ocho
      title: Ocho
      md: Última tarjeta, seguida de nuevo por la primera.
  - title: Sin contenido suficiente
    md: Este carrusel conserva sus extremos cuando no hay suficientes tarjetas fuera de la vista para mantener una vuelta continua.
    box:
      cols: 2
      cols_vs: 1
      slider: true
      infinite: true
      time: 0
      pips: dot
    boxes:
    - title: Uno
      md: Un elemento.
    - title: Dos
      md: Otro elemento.
---
