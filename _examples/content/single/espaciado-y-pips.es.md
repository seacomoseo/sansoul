---
slug: espaciado-y-pips
title: Márgenes, valores hermanos e indicadores
seo:
  noindex: true
tpl:
  sections:
  - id: hero
    title: Ancho y separación del botón de caja
    box:
      cols: 2
      cols_vs: 1
      url: '#hero'
      label: Acción de muestra
    boxes:
    - title: Fondo y ancho predeterminado
      color: light
      md: El botón ocupa todo el ancho cuando su propia caja tiene fondo.
    - title: Fondo con ancho automático
      color: light
      btn_full: false
      btn_mt: 0
      md: btn_full false conserva el ancho del contenido y btn_mt 0 elimina el margen automático.
    - title: Ancho completo sin fondo
      btn_full: true
      btn_mt: 1
      btn_mt_vl: 2
      md: El ancho completo también puede activarse sin fondo. El margen crece de uno a dos em.
    - title: Herencia y anulación explícita
      color: light
      box:
        btn_full: true
      boxes:
      - title: Botón heredado
        url: '#hero'
        label: Ancho completo
      - title: Botón con anulación
        url: '#hero'
        label: Ancho automático
        btn_full: false
        btn_mt_vl: 2
  - id: margenes
    title: Márgenes de caja y de bloques
    box:
      cols: 2
      cols_vs: 1
    boxes:
    - title: Separación explícita cero
      mt: 0
      mt_vl: 2
      md: El bloque siguiente conserva margen cero en todos los tamaños.
      step:
        mt: 0
        mt_vl: 0
      steps:
      - title: Primer paso
        md: Texto de muestra.
      - title: Segundo paso
        md: Otro texto de muestra.
    - title: Separación adaptable
      custom: indicadores
      remap:
      - from: custom
        to: target
      url: '#{{ set target }}'
      label: Ver indicadores
      md: El enlace toma su destino de una clave hermana después de remap.
      faq:
        mt: 1
        mt_vl: 3
      faqs:
      - title: ¿Qué cambia con el tamaño?
        md: El margen superior se interpola entre uno y tres em.
  - id: indicadores
    title: Indicadores pill
    box:
      cols: 2
      cols_vs: 1
      slider: true
      time: 0
      pips: pill
    boxes:
    - title: Uno
      md: Primer elemento del slider.
    - title: Dos
      md: Segundo elemento del slider.
    - title: Tres
      md: Tercer elemento del slider.
  - id: defaults-de-bloques
    title: Acciones circulares y horarios
    boxes:
    - dot:
        align_x: flex-start
        mt: 0
        mt_vl: 2
        btn: cta
        ga4: none
      dots:
      - url: /componentes/
        label: Componentes
        il: construction
      - url: /divisores/
        label: Divisores
        il: cut
      when:
        align_x: flex-start
        mt: 0
        mt_vl: 2
      whens:
      - days: Lunes a viernes
        hours: 9–17 h
      - days: Sábados
        hours: 10–13 h
      gss:
        id: null
        sheet: 0
        mt: 0
        mt_vl: 2
---
