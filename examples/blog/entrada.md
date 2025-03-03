---
slug: entrada
title: Entrada de ejemplo
summary: Esto es una entrada de ejemplo para mostrar la forma de usar el formato markdown y la forma de visualizarlo.
image: base/poster.png

date: 2020-01-01 00:00:00
lastmod: 2021-01-01 00:00:00
category:
- categoria-3
author: admin

toc: true
draft: false
noindex: false
translationKey: post
seo: ▷ Título SEO Entrada de ejemplo 【Con caracteres llamativos】
description: Esto es una descripción SEO de entrada de ejemplo para mostrar la forma de usar el formato markdown y la forma de visualizarlo.
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

- :check: Elemento
- :check: Elemento
  - :xmark: Elemento
    - :minus: Elemento
    - :minus: Elemento
    - :minus: Elemento
- :check: Elemento

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

Si se le añade `{.compare}` al final de las tablas, los [iconos](#iconos) `check` tendrán color verde y los `xmark` rojo:

| Características                   | Netlify CMS                | Forestry                  |
| --------------------------------- | :------------------------: | :-----------------------: |
| Interfaz limpia<br>(grupos…)      | :xmark:<br>desplegables | :check:<br>deslizables |
| Previsualizaciones                | :xmark:                 | :check:                |
| Adaptado a móviles                | :xmark:                 | :check:                |
| Sin límites de usuarios           | :check:                 | :xmark: 3              |
| Interfaz en español               | :check:                 | :xmark: casi           |
| Permite imágenes externas         | :check:                 | :xmark:                |
| Edición de código razonable       | :check:                 | :xmark:                |
| Sistema independiente de terceros | :check:                 | :xmark:                |
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

Envolviendo el texto que hay **dentro** de un enlace entre corchetes (`[[ejemplo]](https://ejemplo.com/)`).

Si hay un botón al comienzo de la linea, éste y todos los que hayan se ajustarán en anchos y márgenes (**recomendado**):

[[Botón 1]](#botones)
[[Botón 2]](#botones)

Si no hay un botón al comienzo de la linea, éste y los siguientes saltan de línea, ocupan todo el ancho y no tendrán márgenes (**no recomendado**):

Ésto es un botón: [[Botón 1]](#botones) [[Botón 2]](#botones)

## Iconos

En cualquier lugar añadiendo como texto el ID del icono deseado (que se puede consultar en el siguiente botón) envuelto entre el caracter `|`:

[[:font-awesome: Font Awesome Icons]](https://fontawesome.com/v6/icons?s=brands,solid).

Ejemplos:

- `star`: :star:
- `tag`: :tag:
- `home`: :house:
- Aquí hay un icono :apple: de la famosa manzana
- A continuación hay un botón con icono:

[[:star: Botón]](#iconos)


## Imágenes

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Imagen con enlace de nota de página

![Alt text](base/icon.png "Icono")

Con la referencia a la URL después

## Iframes

Así se incrustan vídeos de youtube o cualquier otra plataforma:

![](https://youtu.be/I8WU52s5PcQ)

¡Hasta aquí!