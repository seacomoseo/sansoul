---
title: Example article
title_seo: ▷ Example article 【With striking characters】
slug: example
description: This is an example article to show how to use the MarkDown format and the way you can view it.
image: fondo.jpg
categories: [general]
tags: []
author: admin
toc: true
draft: true
noindex: false
date: 2020-01-01
lastmod: 2021-01-01
translationKey: example
---
This is an example paragraph:

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Next, headers from different hierarchies:

# h1 Header (Do not use it)

## h2 Header 🙂

### h3 Header

#### h4 Header

##### h5 Header

###### h6 Header

## Horizontal Lines

- - -

---

___


## Emphasis

**This is text in bold**

**This is text in bold**

*This is text in italics*

*This is text in italics*

~~Tacked~~

## Quotes

> This is an example of cited text
>   with several lines
>   they are very
>   but very well
>   <cite>No one</cite>

## Lists

### Messy

- Element
- Element
  - Element
    - Element
    - Element
    - Element
- Element

You can put [icons](#icons) at the beginning of each element:

- icon-check Element
- icon-check Element
  - icon-xmark Element
    - icon-minus Element
    - icon-minus Element
    - icon-minus Element
- icon-check Element

### Ordenized

1. Element
    1. Element
    2. Element
    3. Element
2. Element
3. Element

You can always use the same number

1. Element
1. Element
1. Element

Starting on a specific number

57. Element
58. Element
59. Element
60. Element

### Definitions

Term 1
: Definition 1.
Continuing on another line.

Term 2
: Definition 2.
: Another paragraph of definition 2.

## Code.

Online `code`

In identized block (4 spaces)

```javascript
// Algunos comentarios
Line 1 of code
Line 2 of code
Line 3 of Code
```

In a delimited block

```javascript
Example of code ...
```

Marking the syntax

```javascript
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
```

## Tables

| Opción      | Descripción                              |
| ----------- | ---------------------------------------- |
| Datos       | Contenido de ejemplo de una celda.       |
| Más datos   | Otro contenido de ejemplo de una celda.  |
| Otros datos | Y más contenido de ejemplo de una celda. |

Aligning the cells to the right

| Opción      | Descripción                              |
| ----------: | ---------------------------------------: |
| Datos       | Contenido de ejemplo de una celda.       |
| Más datos   | Otro contenido de ejemplo de una celda.  |
| Otros datos | Y más contenido de ejemplo de una celda. |

Focusing the cells

| Opción      | Descripción                              |
| :---------: | :--------------------------------------: |
| Datos       | Contenido de ejemplo de una celda.       |
| Más datos   | Otro contenido de ejemplo de una celda.  |
| Otros datos | Y más contenido de ejemplo de una celda. |

If added `{.compare}` at the end of the tables, the [icons](#icons) `check` they will have green color and `times` red:

| Características | Netlify CMS | Forestry |
| ------ | :------: | :-------: |
| Interfaz limpia<br>(grupos…) | icon-xmark<br>desplegables | icon-check<br>deslizables |
| Previsualizaciones | icon-xmark | icon-check |
| Adaptado a móviles | icon-xmark | icon-check |
| Sin límites de usuarios | icon-check | icon-xmark 3 |
| Interfaz en español | icon-check | icon-xmark casi |
| Permite imágenes externas | icon-check | icon-xmark |
| Edición de código razonable | icon-check | icon-xmark |
| Sistema independiente de terceros | icon-check | icon-xmark |
{.compare}

## Links

Esto es un [enlace externo de texto](http://seacomoseo.com) (se abre en una ventana nueva).

Esto es un [enlace interno de texto](/blog/) (se abre en la misma ventana).

Esto es un [enlace ofuscado](/blog/ "nofollow") (oculto de cara a google).

### Footnotes page

Enlace de nota primero[^first].

Enlace de nota segundo[^second].

Enlace de nota duplicado[^second].

[^first]: Texto de nota **que puede tener marcado** y múltiples párrafos.

[^second]: Otro texto de nota.

### Buttons

Añadiendo `btn + espacio` delante de un enlace.

Si hay un botón al comienzo de la linea, éste y todos los que hayan se ajustarán en anchos y márgenes (**recomendado**):

[btn Botón 1](#botones)
[btn Botón 2](#botones)

Si no hay un botón al comienzo de la linea, éste y los siguientes saltan de línea, ocupan todo el ancho y no tendrán márgenes (**no recomendado**):

Ésto es un botón: [btn Botón 1](#botones) [btn Botón 2](#botones)

## Icons

En cualquier lugar añadiendo como texto `icon-` + seguido de un emoji o del ID del icono deseado que se puede consultar en el siguiente botón:

[btn icon-font-awesome Font Awesome Icons](https://fontawesome.com/v6/icons?s=brands,solid).

Ejemplos:

- `star`: icon-star
- `tag`: icon-tag
- `house`: icon-house
- Aquí hay un icono icon-apple de la famosa manzana
- A continuación hay un botón con icono:

[btn icon-star Botón](#icons)


## Images

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Imagen con enlace de nota de página

![Alt text](logo.png "Logo")

Con la referencia a la URL después

## Iframes

Así se incrustan vídeos de youtube o cualquier otra plataforma:

![](https://youtu.be/I8WU52s5PcQ)

¡Hasta aquí!