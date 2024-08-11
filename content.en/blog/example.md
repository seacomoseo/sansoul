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

    // Some comments
    Line 1 of code
    Line 2 of code
    Line 3 of Code

In a delimited block

```javascript
// Example of code ...
```

Marking the syntax

```javascript
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
```

## Tables

| Option     | Description                   |
| ---------- | ----------------------------- |
| Data       | Sample cell contents.         |
| More data  | Other sample cell content.    |
| Other data | And more sample cell content. |

Aligning the cells to the right

| Option     | Description                   |
| ---------: | ----------------------------: |
| Data       | Sample cell contents.         |
| More data  | Other sample cell content.    |
| Other data | And more sample cell content. |

Focusing the cells

| Option     | Description                   |
| :--------: | :---------------------------: |
| Data       | Sample cell contents.         |
| More data  | Other sample cell content.    |
| Other data | And more sample cell content. |

If added `{.compare}` at the end of the tables, the [icons](#icons) `check` they will have green color and `times` red:

| Features                        | Netlify CMS             | Forestry              |
| ------------------------------- | :---------------------: | :-------------------: |
| Clean interface<br>(drop-down…) | icon-xmark<br>drop-down | icon-check<br>sliders |
| Previews                        | icon-xmark              | icon-check            |
| Adapted to cell phones          | icon-xmark              | icon-check            |
| No user limits                  | icon-check              | icon-xmark 3          |
| English interface               | icon-check              | icon-xmark almost     |
| Allows external images          | icon-check              | icon-xmark            |
| Reasonable code editing         | icon-check              | icon-xmark            |
| Third party independent system  | icon-check              | icon-xmark            |
{.compare}

## Links

This is an [external text link](http://seacomoseo.com) (opens in a new window).

This is an [internal text link](/blog/) (opens in the same window).

This is an [obfuscated link](/blog/ "nofollow") (hidden from google).

### Footnotes page

Note link first [^first].

Note link second [^second].

Note link duplicate[^second].

[^first]: Note text **which may have markup** and multiple paragraphs.

[^second]: Other note text.

### Buttons

Adding `btn + space` in front of a link.

If there is a button at the beginning of the line, it and all buttons will be adjusted in widths and margins (**recommended**):

[btn Button 1](#buttons).
[btn Button 2](#buttons)

If there is no button at the beginning of the line, this and the following buttons will jump the line, occupy the whole width and will have no margins (**not recommended**):

This is a button: [btn Button 1](#buttons) [btn Button 2](#buttons).

## Icons

Anywhere adding as text `icon-` + followed by an emoji or the ID of the desired icon that can be consulted in the following button:

[btn icon-font-awesome Font Awesome Icons](https://fontawesome.com/v6/icons?s=brands,solid).

Examples:

- `star`: icon-star
- `tag`: icon-tag
- house`: icon-house
- Here is an icon-apple icon of the famous apple
- Below is a button with icon:

[btn icon-star Button](#icons)


## Images

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")

Image with page note link

![Alt text](logo.png "Logo")

With URL reference after

## Iframes

This is how to embed videos from youtube or any other platform:

![](https://youtu.be/I8WU52s5PcQ)

Up to here!