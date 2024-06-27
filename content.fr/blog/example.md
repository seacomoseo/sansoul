---
title: Exemple d'article
title_seo: ▷ Exemple d'article 【With striking characters】
slug: exemple
description: Il s'agit d'un exemple d'article qui montre comment utiliser le format MarkDown et la façon dont vous pouvez le visualiser.
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
Voici un exemple de paragraphe :

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Ensuite, des en-têtes de différentes hiérarchies :

# h1 En-tête (Ne pas l'utiliser)

## h2 En-tête 🙂

### h3 En-tête

#### h4 En-tête

##### h5 En-tête

###### h6 En-tête

## Lignes horizontales

- - -

---

___


## Soulignement

**Ce texte est en gras**

*Ce texte est en italique*

~~Barré~~

## Citations

> Esto es un ejemplo de texto citado
> con varias líneas
> que están muy
> pero que muy bien
> <cite>Personne</cite>

## Listes

### Non ordonné

- Élément
- Élément
  - Élément
    - Élément
    - Élément
    - Élément
- Élément

Les [icônes](#icones) peuvent être placées au début de chaque élément :

- icon-check Élément
- icon-check Élément
  - icon-xmark Élément
    - icon-minus Élément
    - icon-minus Élément
    - icon-minus Élément
- icon-check Élément

### Commandé

1. Élément
    1. Élément
    2. Élément
    3. Élément
2. Élément
3. Élément

Vous pouvez toujours utiliser le même numéro

1. Élément
1. Élément
1. Élément

À partir d'un numéro spécifique

57. Élément
58. Élément
59. Élément
60. Élément

### Définitions

Terme 1
: Définition 1.
: Poursuivre sur une autre ligne.

Terme 2
: Définition 2.
: Un autre paragraphe de la définition 2.

## Code

Dans la ligne `code`.

Dans le bloc identifié (4 espaces)

```javascript
// Quelques commentaires
Ligne 1 du code
Ligne 2 du code
Ligne 3 du code
```

Dans un bloc délimité

```javascript
Exemple de code...
```

Marquer la syntaxe

```javascript
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
```

## Tableaux

| Option          | Description                                 |
| --------------- | ------------------------------------------- |
| Données         | Échantillon du contenu d'une cellule.       |
| Plus de données | Autre échantillon du contenu d'une cellule. |
| Autres données  | Autres exemples de contenu de cellules.     |

Alignement des cellules à droite

| Option          | Description                                 |
| --------------: | ------------------------------------------: |
| Données         | Échantillon du contenu d'une cellule.       |
| Plus de données | Autre échantillon du contenu d'une cellule. |
| Autres données  | Autres exemples de contenu de cellules.     |

Centrage des cellules

| Option          | Description                                 |
| :-------------: | :-----------------------------------------: |
| Données         | Échantillon du contenu d'une cellule.       |
| Plus de données | Autre échantillon du contenu d'une cellule. |
| Autres données  | Autres exemples de contenu de cellules.     |

Si `{.compare}` est ajouté à la fin des tableaux, le [icônes](#icones) `check` sera vert et le `times` sera rouge :

| Fonctionnalités                   | Netlify CMS                  | Forestry               |
| --------------------------------- | :--------------------------: | :--------------------: |
| Interface épurée<br>(groupes...)  | icon-xmark<br>menu déroulant | icon-check<br>curseurs |
| Prévisualisations                 | icon-xmark                   | icon-check             |
| Adapté aux mobiles                | icon-xmark                   | icon-check             |
| Pas de limites d'utilisateurs     | icon-check                   | icon-xmark 3           |
| Interfaz en español               | icon-check                   | icon-xmark casi        |
| Permite imágenes externas         | icon-check                   | icon-xmark             |
| Edición de código razonable       | icon-check                   | icon-xmark             |
| Sistema independiente de terceros | icon-check                   | icon-xmark             |
{.compare}

## Liens

Il s'agit d'un [lien textuel externe](http://seacomoseo.com) (s'ouvre dans une nouvelle fenêtre).

Ceci est un [lien textuel interne](/blog/) (s'ouvre dans la même fenêtre).

Ceci est un [lien obscurci](/blog/ "nofollow") (caché de google).

### Notes de bas de page

Lien de note de bas de page premier [^premier].

Lien de note de bas de page deuxième [^second].

Lien de note de bas de page dupliqué [^second].

[^premier] : Texte de la note **qui peut comporter des balises** et plusieurs paragraphes.

[^second] : Autre texte de note.

### Boutons

Ajouter `btn + espace` devant un lien.

S'il y a un bouton au début de la ligne, celui-ci et tous les boutons seront ajustés en largeur et en marge (**recommandé**) :

[btn Bouton 1](#boutons)
[btn Bouton 2](#boutons)

S'il n'y a pas de bouton en début de ligne, ce bouton et les suivants sautent la ligne, prennent toute la largeur et n'ont pas de marges (**non recommandé**) :

Ceci est un bouton : [btn Bouton 1](#boutons) [btn Bouton 2](#boutons)

## Icônes

N'importe où en ajoutant comme texte `icon-` + suivi d'un emoji ou de l'ID de l'icône désirée qui peut être trouvée dans le bouton suivant :

[btn icon-font-awesome Font Awesome Icons](https://fontawesome.com/v6/icons?s=brands,solid).

Exemples :

- `star`: icon-star
- `tag`: icon-tag
- `home`: icon-house
- Voici une icône icon-apple de la célèbre pomme
- Ci-dessous un bouton avec icône :

[btn icon-star Bouton](#icones)


## Images

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Image avec lien vers la note de page

![Alt text](logo.png "Logo")

Avec référence URL après

## Iframes

C'est ainsi que vous intégrez des vidéos de Youtube ou de toute autre plateforme :

![](https://youtu.be/I8WU52s5PcQ)

Jusqu'ici !