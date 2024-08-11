---
title: Entrada de ejemplo
title_seo: ▷ Entrada de ejemplo 【Con caracteres llamativos】
slug: ejemplo
description: Esto es una entrada de ejemplo para mostrar la forma de usar el formato markdown y la forma de visualizarlo.
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
Este es un ejemplo de párrafo:

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

A continuación, encabezados de diferentes jerarquías:

# h1 Encabezado (No usarlo)

## h2 Encabezado 🙂

### h3 Encabezado

#### h4 Encabezado

##### h5 Encabezado

###### h6 Encabezado

## Líneas Horizontales

- - -

---

___


## Énfasis

**Esto es texto en negrita**

*Esto es texto en cursiva*

~~Tachado~~

## Citas

> Esto es un ejemplo de texto citado
>   con varias líneas
>   que están muy
>   pero que muy bien
> <cite>Nadie</cite>

## Listas

### Desordenadas

- Elemento
- Elemento
  - Elemento
    - Elemento
    - Elemento
    - Elemento
- Elemento

Se pueden poner [iconos](#iconos) al inicio de cada elemento:

- icon-check Elemento
- icon-check Elemento
  - icon-xmark Elemento
    - icon-minus Elemento
    - icon-minus Elemento
    - icon-minus Elemento
- icon-check Elemento

### Ordenadas

1. Elemento
    1. Elemento
    2. Elemento
    3. Elemento
2. Elemento
3. Elemento

Puedes usar siempre el mismo número

1. Elemento
1. Elemento
1. Elemento

Empezando en un número concreto

57. Elemento
58. Elemento
59. Elemento
60. Elemento

### Definiciones

Término 1
: Definición 1.
continuando en otra línea.

Término 2
: Definición 2.
: Otro párrafo de la definición 2.

## Código

En línea `code`

En bloque identado (4 espacios)

    // Algunos comentarios
    Línea 1 de código
    Línea 2 de código
    Línea 3 de código

En bloque delimitado

```javascript
// Ejemplo de código...
```

Marcando la sintaxis

```javascript
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
```

## Tablas

| Opción      | Descripción                              |
| ----------- | ---------------------------------------- |
| Datos       | Contenido de ejemplo de una celda.       |
| Más datos   | Otro contenido de ejemplo de una celda.  |
| Otros datos | Y más contenido de ejemplo de una celda. |

Alineando las celdas a la derecha

| Opción      | Descripción                              |
| ----------: | ---------------------------------------: |
| Datos       | Contenido de ejemplo de una celda.       |
| Más datos   | Otro contenido de ejemplo de una celda.  |
| Otros datos | Y más contenido de ejemplo de una celda. |

Centrando las celdas

| Opción      | Descripción                              |
| :---------: | :--------------------------------------: |
| Datos       | Contenido de ejemplo de una celda.       |
| Más datos   | Otro contenido de ejemplo de una celda.  |
| Otros datos | Y más contenido de ejemplo de una celda. |

Si se le añade `{.compare}` al final de las tablas, los [iconos](#iconos) `check` tendrán color verde y los `times` rojo:

| Características                   | Netlify CMS                | Forestry                  |
| --------------------------------- | :------------------------: | :-----------------------: |
| Interfaz limpia<br>(grupos…)      | icon-xmark<br>desplegables | icon-check<br>deslizables |
| Previsualizaciones                | icon-xmark                 | icon-check                |
| Adaptado a móviles                | icon-xmark                 | icon-check                |
| Sin límites de usuarios           | icon-check                 | icon-xmark 3              |
| Interfaz en español               | icon-check                 | icon-xmark casi           |
| Permite imágenes externas         | icon-check                 | icon-xmark                |
| Edición de código razonable       | icon-check                 | icon-xmark                |
| Sistema independiente de terceros | icon-check                 | icon-xmark                |
{.compare}

## Enlaces

Esto es un [enlace externo de texto](http://seacomoseo.com) (se abre en una ventana nueva).

Esto es un [enlace interno de texto](/blog/) (se abre en la misma ventana).

Esto es un [enlace ofuscado](/blog/ "nofollow") (oculto de cara a google).

### Notas al pie de página

Enlace de nota primero[^first].

Enlace de nota segundo[^second].

Enlace de nota duplicado[^second].

[^first]: Texto de nota **que puede tener marcado** y múltiples párrafos.

[^second]: Otro texto de nota.

### Botones

Añadiendo `btn + espacio` delante de un enlace.

Si hay un botón al comienzo de la linea, éste y todos los que hayan se ajustarán en anchos y márgenes (**recomendado**):

[btn Botón 1](#botones)
[btn Botón 2](#botones)

Si no hay un botón al comienzo de la linea, éste y los siguientes saltan de línea, ocupan todo el ancho y no tendrán márgenes (**no recomendado**):

Ésto es un botón: [btn Botón 1](#botones) [btn Botón 2](#botones)

## Iconos

En cualquier lugar añadiendo como texto `icon-` + seguido de un emoji o del ID del icono deseado que se puede consultar en el siguiente botón:

[btn icon-font-awesome Font Awesome Icons](https://fontawesome.com/v6/icons?s=brands,solid).

Ejemplos:

- `star`: icon-star
- `tag`: icon-tag
- `home`: icon-house
- Aquí hay un icono icon-apple de la famosa manzana
- A continuación hay un botón con icono:

[btn icon-star Botón](#iconos)


## Imágenes

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Imagen con enlace de nota de página

![Alt text](logo.png "Logo")

Con la referencia a la URL después

## Iframes

Así se incrustan vídeos de youtube o cualquier otra plataforma:

![](https://youtu.be/I8WU52s5PcQ)

¡Hasta aquí!