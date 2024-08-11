---
title: Exemplo de Entrada
title_seo: ▷ Exemplo de Entrada 【Com Caracteres Chamativos】
slug: exemplo
description: Este é um exemplo de entrada para mostrar como usar o formato markdown e como visualizá-lo.
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
Este é um exemplo de parágrafo:

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

A seguir, cabeçalhos de diferentes hierarquias:

# h1 Cabeçalho (Não usar)

## h2 Cabeçalho 🙂

### h3 Cabeçalho

#### h4 Cabeçalho

##### h5 Cabeçalho

###### h6 Cabeçalho

## Linhas Horizontais

- - -

---

___


## Ênfase

**Este é um texto em negrito**

*Este é um texto em itálico*

~~Tachado~~

## Citações

> Este é um exemplo de texto citado
>   com várias linhas
>   que estão muito
>   mas muito bem feitas
> <cite>Ninguém</cite>

## Listas

### Não Ordenadas

- Item
- Item
  - Item
    - Item
    - Item
    - Item
- Item

Você pode adicionar [ícones](#icones) no início de cada item:

- icon-check Item
- icon-check Item
  - icon-xmark Item
    - icon-minus Item
    - icon-minus Item
    - icon-minus Item
- icon-check Item

### Ordenadas

1. Item
    1. Item
    2. Item
    3. Item
2. Item
3. Item

Você pode usar sempre o mesmo número

1. Item
1. Item
1. Item

Começando de um número específico

57. Item
58. Item
59. Item
60. Item

### Definições

Termo 1
: Definição 1.
continuando em outra linha.

Termo 2
: Definição 2.
: Outro parágrafo da definição 2.

## Código

Em linha `code`

Em bloco indentado (4 espaços)

    javascript
    // Alguns comentários
    Linha 1 de código
    Linha 2 de código
    Linha 3 de código

Em bloco delimitado

```javascript
// Exemplo de código...
```

Destaque de sintaxe

```javascript
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
```

## Tabelas

| Opção        | Descrição                                 |
| ------------ | ----------------------------------------- |
| Dados        | Exemplo de conteúdo de uma célula.        |
| Mais dados   | Outro exemplo de conteúdo de uma célula.  |
| Outros dados | E mais exemplo de conteúdo de uma célula. |

Alinhando as células à direita

| Opção        | Descrição                                 |
| -----------: | ----------------------------------------: |
| Dados        | Exemplo de conteúdo de uma célula.        |
| Mais dados   | Outro exemplo de conteúdo de uma célula.  |
| Outros dados | E mais exemplo de conteúdo de uma célula. |

Centrando as células

| Opção        | Descrição                                 |
| :----------: | :---------------------------------------: |
| Dados        | Exemplo de conteúdo de uma célula.        |
| Mais dados   | Outro exemplo de conteúdo de uma célula.  |
| Outros dados | E mais exemplo de conteúdo de uma célula. |

Se você adicionar `{.compare}` ao final das tabelas, os [ícones](#icones) `check` ficarão verdes e os `times` vermelhos:

| Características                   | Netlify CMS            | Forestry                 |
| --------------------------------- | :--------------------: | :----------------------: |
| Interface limpa<br>(grupos…)      | icon-xmark<br>dropdown | icon-check<br>deslizante |
| Pré-visualizações                 | icon-xmark             | icon-check               |
| Adaptado para dispositivos móveis | icon-xmark             | icon-check               |
| Sem limites de usuários           | icon-check             | icon-xmark 3             |
| Interface em português            | icon-check             | icon-xmark quase         |
| Permite imagens externas          | icon-check             | icon-xmark               |
| Edição de código razoável         | icon-check             | icon-xmark               |
| Sistema independente de terceiros | icon-check             | icon-xmark               |
{.compare}

## Links

Este é um [link de texto externo](http://seacomoseo.com) (abre em uma nova janela).

Este é um [link de texto interno](/blog/) (abre na mesma janela).

Este é um [link ofuscado](/blog/ "nofollow") (oculto para o Google).

### Notas de Rodapé

Primeira nota de rodapé[^first].

Segunda nota de rodapé[^second].

Nota de rodapé duplicada[^second].

[^first]: Texto da nota **que pode conter marcação** e vários parágrafos.

[^second]: Outro texto da nota.

### Botões

Adicionando `btn + espaço` antes de um link.

Se houver um botão no início da linha, ele e todos os outros se ajustarão em largura e margens (**recomendado**):

[btn Botão 1](#botoes)
[btn Botão 2](#botoes)

Se não houver um botão no início da linha, ele e os próximos quebrarão a linha, ocuparão toda a largura e não terão margens (**não recomendado**):

Este é um botão: [btn Botão 1](#botoes) [btn Botão 2](#botoes)

## Ícones

Em qualquer lugar adicionando como texto `icon-` + seguido de um emoji ou do ID do ícone desejado, que pode ser consultado no botão a seguir:

[btn icon-font-awesome Font Awesome Icons](https://fontawesome.com/v6/icons?s=brands,solid).

Exemplos:

- `star`: icon-star
- `tag`: icon-tag
- `home`: icon-house
- Aqui está um ícone icon-apple da famosa maçã
- A seguir, um botão com ícone:

[btn icon-star Botão](#icones)


## Imagens

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Imagem com link para nota de rodapé

![Alt text](logo.png "Logo")

Com a referência para a URL após

## Iframes

É assim que você incorpora vídeos do YouTube ou de qualquer outra plataforma:

![](https://youtu.be/I8WU52s5PcQ)

É isso aí!
