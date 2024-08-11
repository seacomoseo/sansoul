---
title: Esempio di Articolo
title_seo: ▷ Esempio di Articolo 【Con Caratteri Evidenti】
slug: esempio
description: Questo è un articolo di esempio per mostrare come utilizzare il formato markdown e come visualizzarlo.
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
Questo è un esempio di paragrafo:

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Di seguito, intestazioni di diversi livelli:

# h1 Intestazione (Non usare)

## h2 Intestazione 🙂

### h3 Intestazione

#### h4 Intestazione

##### h5 Intestazione

###### h6 Intestazione

## Linee Orizzontali

- - -

---

___


## Enfasi

**Questo è testo in grassetto**

*Questo è testo in corsivo*

~~Barrato~~

## Citazioni

> Questo è un esempio di testo citato
>   con più righe
>   che sono molto
>   ma davvero molto ben fatte
> <cite>Nessuno</cite>

## Elenchi

### Non Ordinati

- Elemento
- Elemento
  - Elemento
    - Elemento
    - Elemento
    - Elemento
- Elemento

Puoi aggiungere [icone](#icone) all'inizio di ogni elemento:

- icon-check Elemento
- icon-check Elemento
  - icon-xmark Elemento
    - icon-minus Elemento
    - icon-minus Elemento
    - icon-minus Elemento
- icon-check Elemento

### Ordinati

1. Elemento
    1. Elemento
    2. Elemento
    3. Elemento
2. Elemento
3. Elemento

Puoi usare sempre lo stesso numero

1. Elemento
1. Elemento
1. Elemento

Iniziando da un numero specifico

57. Elemento
58. Elemento
59. Elemento
60. Elemento

### Definizioni

Termine 1
: Definizione 1.
continuando su un'altra riga.

Termine 2
: Definizione 2.
: Un altro paragrafo della definizione 2.

## Codice

In linea `code`

In blocco indentato (4 spazi)

    // Alcuni commenti
    Riga 1 di codice
    Riga 2 di codice
    Riga 3 di codice

In blocco delimitato

```javascript
// Esempio di codice...
```

Evidenziazione della sintassi

```javascript
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
```

## Tabelle

| Opzione    | Descrizione                                     |
| ---------- | ----------------------------------------------- |
| Dati       | Contenuto di esempio di una cella.              |
| Altri dati | Altro contenuto di esempio di una cella.        |
| Altri dati | E ancora più contenuto di esempio di una cella. |

Allineamento delle celle a destra

| Opzione    | Descrizione                                     |
| ---------: | ----------------------------------------------: |
| Dati       | Contenuto di esempio di una cella.              |
| Altri dati | Altro contenuto di esempio di una cella.        |
| Altri dati | E ancora più contenuto di esempio di una cella. |

Centrando le celle

| Opzione    | Descrizione                                     |
| :--------: | :---------------------------------------------: |
| Dati       | Contenuto di esempio di una cella.              |
| Altri dati | Altro contenuto di esempio di una cella.        |
| Altri dati | E ancora più contenuto di esempio di una cella. |

Se aggiungi `{.compare}` alla fine delle tabelle, le [icone](#icone) `check` saranno verdi e le `times` rosse:

| Caratteristiche                 | Netlify CMS               | Forestry                 |
| ------------------------------- | :-----------------------: | :----------------------: |
| Interfaccia pulita<br>(gruppi…) | icon-xmark<br>a scomparsa | icon-check<br>scorrevole |
| Anteprime                       | icon-xmark                | icon-check               |
| Adattato per dispositivi mobili | icon-xmark                | icon-check               |
| Nessun limite di utenti         | icon-check                | icon-xmark 3             |
| Interfaccia in italiano         | icon-check                | icon-xmark quasi         |
| Permette immagini esterne       | icon-check                | icon-xmark               |
| Modifica del codice ragionevole | icon-check                | icon-xmark               |
| Sistema indipendente da terzi   | icon-check                | icon-xmark               |
{.compare}

## Collegamenti

Questo è un [collegamento di testo esterno](http://seacomoseo.com) (si apre in una nuova finestra).

Questo è un [collegamento di testo interno](/blog/) (si apre nella stessa finestra).

Questo è un [collegamento offuscato](/blog/ "nofollow") (nascosto ai motori di ricerca).

### Note a piè di pagina

Prima nota a piè di pagina[^first].

Seconda nota a piè di pagina[^second].

Nota a piè di pagina duplicata[^second].

[^first]: Testo della nota **che può includere formattazione** e più paragrafi.

[^second]: Altro testo della nota.

### Pulsanti

Aggiungendo `btn + spazio` davanti a un collegamento.

Se c'è un pulsante all'inizio della riga, esso e tutti gli altri si adatteranno in larghezza e margini (**consigliato**):

[btn Pulsante 1](#pulsanti)
[btn Pulsante 2](#pulsanti)

Se non c'è un pulsante all'inizio della riga, esso e i successivi andranno a capo, occuperanno tutta la larghezza e non avranno margini (**non consigliato**):

Questo è un pulsante: [btn Pulsante 1](#pulsanti) [btn Pulsante 2](#pulsanti)

## Icone

In qualsiasi punto, aggiungendo come testo `icon-` + seguito da un'emoji o dall'ID dell'icona desiderata che si può consultare nel pulsante seguente:

[btn icon-font-awesome Font Awesome Icons](https://fontawesome.com/v6/icons?s=brands,solid).

Esempi:

- `star`: icon-star
- `tag`: icon-tag
- `home`: icon-house
- Ecco un'icona icon-apple della famosa mela
- Di seguito un pulsante con icona:

[btn icon-star Pulsante](#icone)


## Immagini

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Immagine con collegamento alla nota a piè di pagina

![Alt text](logo.png "Logo")

Con il riferimento all'URL dopo

## Iframe

Ecco come incorporare video di YouTube o qualsiasi altra piattaforma:

![](https://youtu.be/I8WU52s5PcQ)

Fino a qui!
