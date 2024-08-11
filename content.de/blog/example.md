---
title: Beispielbeitrag
title_seo: ▷ Beispielbeitrag 【Mit auffälligen Zeichen】
slug: beispiel
description: Dies ist ein Beispielbeitrag, um die Verwendung des Markdown-Formats und dessen Darstellung zu zeigen.
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
Dies ist ein Beispielabsatz:

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Im Folgenden Überschriften verschiedener Hierarchien:

# h1 Überschrift (Nicht verwenden)

## h2 Überschrift 🙂

### h3 Überschrift

#### h4 Überschrift

##### h5 Überschrift

###### h6 Überschrift

## Horizontale Linien

- - -

---

___


## Hervorhebungen

**Dies ist fetter Text**

*Dies ist kursiver Text*

~~Durchgestrichen~~

## Zitate

> Dies ist ein Beispiel für einen zitierten Text
>   mit mehreren Zeilen,
>   die sehr gut
>   aber wirklich sehr gut sind
> <cite>Niemand</cite>

## Listen

### Ungeordnet

- Element
- Element
  - Element
    - Element
    - Element
    - Element
- Element

Sie können [Symbole](#symbole) am Anfang jedes Elements hinzufügen:

- icon-check Element
- icon-check Element
  - icon-xmark Element
    - icon-minus Element
    - icon-minus Element
    - icon-minus Element
- icon-check Element

### Geordnet

1. Element
    1. Element
    2. Element
    3. Element
2. Element
3. Element

Sie können immer dieselbe Nummer verwenden

1. Element
1. Element
1. Element

Starten bei einer bestimmten Nummer

57. Element
58. Element
59. Element
60. Element

### Definitionen

Begriff 1
: Definition 1.
fortsetzend in einer anderen Zeile.

Begriff 2
: Definition 2.
: Ein weiterer Absatz der Definition 2.

## Code

Inline `code`

Im eingerückten Block (4 Leerzeichen)

    // Einige Kommentare
    Zeile 1 des Codes
    Zeile 2 des Codes
    Zeile 3 des Codes

Im abgetrennten Block

```javascript
// Beispielcode...
```

Syntax-Hervorhebung

```javascript
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
```

## Tabellen

| Option      | Beschreibung                              |
| ----------- | ----------------------------------------- |
| Daten       | Beispielinhalt einer Zelle.               |
| Mehr Daten  | Weitere Beispielinhalte einer Zelle.      |
| Andere Daten| Und mehr Beispielinhalte einer Zelle.     |

Zellen rechtsbündig ausrichten

| Option       | Beschreibung                              |
| -----------: | ----------------------------------------: |
| Daten        | Beispielinhalt einer Zelle.               |
| Mehr Daten   | Weitere Beispielinhalte einer Zelle.      |
| Andere Daten | Und mehr Beispielinhalte einer Zelle.     |

Zellen zentrieren

| Option       | Beschreibung                              |
| :----------: | :---------------------------------------: |
| Daten        | Beispielinhalt einer Zelle.               |
| Mehr Daten   | Weitere Beispielinhalte einer Zelle.      |
| Andere Daten | Und mehr Beispielinhalte einer Zelle.     |

Wenn `{.compare}` am Ende der Tabellen hinzugefügt wird, werden die [Symbole](#symbole) `check` grün und `times` rot:

| Eigenschaften                    | Netlify CMS               | Forestry                |
| ---------------------------------| :-----------------------: | :---------------------: |
| Saubere Oberfläche<br>(Gruppen…) | icon-xmark<br>ausklappbar | icon-check<br>schiebbar |
| Vorschauen                       | icon-xmark                | icon-check              |
| Mobil angepasst                  | icon-xmark                | icon-check              |
| Keine Benutzerbegrenzungen       | icon-check                | icon-xmark 3            |
| Oberfläche auf Deutsch           | icon-check                | icon-xmark fast         |
| Erlaubt externe Bilder           | icon-check                | icon-xmark              |
| Zumutbare Codebearbeitung        | icon-check                | icon-xmark              |
| Unabhängiges System von Dritten  | icon-check                | icon-xmark              |
{.compare}

## Links

Dies ist ein [externer Textlink](http://seacomoseo.com) (öffnet in einem neuen Fenster).

Dies ist ein [interner Textlink](/blog/) (öffnet im selben Fenster).

Dies ist ein [verschleierter Link](/blog/ "nofollow") (versteckt für Google).

### Fußnoten

Erste Fußnotenanmerkung[^first].

Zweite Fußnotenanmerkung[^second].

Duplizierte Fußnotenanmerkung[^second].

[^first]: Fußnotentext **der Markup enthalten kann** und mehrere Absätze umfassen.

[^second]: Ein weiterer Fußnotentext.

### Buttons

Hinzufügen von `btn + Leerzeichen` vor einem Link.

Wenn ein Button am Anfang der Zeile steht, werden dieser und alle folgenden in Breite und Abständen angepasst (**empfohlen**):

[btn Button 1](#buttons)
[btn Button 2](#buttons)

Wenn kein Button am Anfang der Zeile steht, springen dieser und die folgenden auf die nächste Zeile, nehmen die gesamte Breite ein und haben keine Abstände (**nicht empfohlen**):

Dies ist ein Button: [btn Button 1](#buttons) [btn Button 2](#buttons)

## Symbole

An jeder Stelle können Symbole eingefügt werden, indem `icon-` + gefolgt von einem Emoji oder der ID des gewünschten Symbols, das im folgenden Button aufgerufen werden kann:

[btn icon-font-awesome Font Awesome Icons](https://fontawesome.com/v6/icons?s=brands,solid).

Beispiele:

- `star`: icon-star
- `tag`: icon-tag
- `home`: icon-house
- Hier ist ein Symbol icon-apple des berühmten Apfels
- Hier ist ein Button mit Symbol:

[btn icon-star Button](#symbole)


## Bilder

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Bild mit Fußnotenlink

![Alt text](logo.png "Logo")

Mit Verweis auf die URL danach

## Iframes

So werden YouTube-Videos oder andere Plattformen eingebettet:

![](https://youtu.be/I8WU52s5PcQ)

Das war's!
