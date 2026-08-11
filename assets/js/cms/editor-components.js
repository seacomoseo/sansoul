import { t } from '@params'

export function initEditorComponents () {
  const { CMS } = window
  if (!CMS) return

  CMS.registerEditorComponent({
    id: 'link',
    label: t.url,
    icon: 'link',
    trigger: 'button',
    mode: 'dialog',
    summary: '{{btn | ternary(\'🔳 \', \'\')}}{{anchor}}',
    fields: [
      { name: 'url', label: t.url },
      { name: 'anchor', label: t.md_anchor, required: false },
      { name: 'title', label: t.md_title, required: false },
      { name: 'icon', label: t.icon, hint: t.icon_hint, required: false },
      { name: 'btn', label: t.md_btn, widget: 'boolean', required: false },
      { name: 'dot', label: t.md_dot, widget: 'boolean', required: false },
      { name: 'swap', label: t.swap, widget: 'boolean', required: false },
      {
        name: 'color',
        label: t.md_color,
        widget: 'select',
        required: false,
        dropdown_threshold: 14,
        options: [
          { value: '', label: t['opt-color-cta'] },
          { value: 'main', label: t['opt-color-main'] },
          { value: 'alt', label: t['opt-color-alt'] },
          { value: 'light', label: t['opt-color-light'] },
          { value: 'dark', label: t['opt-color-dark'] },
          { value: 'turn', label: t['opt-color-turn'] },
          { value: 'such', label: t['opt-color-such'] },
          { value: 'whatsapp', label: t['opt-color-whatsapp'] }
        ]
      },
      {
        name: 'follow',
        label: 'Follow',
        widget: 'select',
        required: false,
        options: [
          { value: '', label: t['opt-scroll-none'] },
          { value: 'nofollow', label: t.lock },
          { value: 'homefollow', label: t.md_homefollow }
        ]
      },
      { name: 'blank', label: t.md_blank, widget: 'boolean', required: false },
      { name: 'ga4', label: t.ga4, hint: t.ga4_hint, widget: 'boolean', required: false }
    ],
    pattern: /(?<!!)\[(?![!])(\[)?(?:::(.+?)::\s*)?([^\]]+?)(\])?\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/,
    fromBlock: match => {
      const metadata = match[6] ?? ''
      const customMatch = metadata.match(/\[([^\]]+)\]$/)
      const custom = customMatch ? customMatch[1].trim().split(/\s+/) : []
      const colors = [
        'main',
        'alt',
        'light',
        'dark',
        'turn',
        'such',
        'whatsapp'
      ]
      return {
        url: decodeURI(match[5]),
        icon: match[2] ?? '',
        anchor: match[3],
        title: metadata.replace(/\s*\[[^\]]+\]$/, ''),
        btn: Boolean(match[1] && match[4]),
        color: custom.find(value => colors.includes(value)) ?? '',
        dot: custom.includes('dot'),
        swap: custom.includes('swap'),
        follow: custom.includes('homefollow')
          ? 'homefollow'
          : custom.includes('nofollow')
            ? 'nofollow'
            : '',
        blank: custom.includes('blank'),
        ga4: custom.includes('ga4')
      }
    },
    toBlock: ({
      url,
      icon = '',
      anchor = '',
      title = '',
      btn = false,
      color = '',
      dot = false,
      swap = false,
      follow = '',
      blank = false,
      ga4 = false
    }) => {
      const customValues = [
        btn && color,
        btn && dot && 'dot',
        btn && swap && 'swap',
        follow,
        blank && 'blank',
        ga4 && 'ga4'
      ].filter(Boolean)
      const customText = customValues.join(' ')
      const metadata = `${title}${customText ? `${title ? ' ' : ''}[${customText}]` : ''}`
      const content = `${icon ? `::${icon}:: ` : ''}${anchor}`
      return `[${btn ? '[' : ''}${content}${btn ? ']' : ''}](${url}${
        metadata ? ` "${metadata}"` : ''
      })`
    },
    toPreview: () => ''
  })

  CMS.registerEditorComponent({
    id: 'icon',
    label: t.icon,
    icon: 'emoji_symbols',
    trigger: 'button',
    mode: 'dialog',
    summary: '{{icon}}',
    fields: [
      { name: 'icon', label: t.icon, hint: t.icon_hint }
    ],
    pattern: /::(?<icon>.+?)::/,
    toBlock: ({ icon = '' }) => `::${icon}::`,
    toPreview: ({ icon }) => `<i class="icon">${icon}</i>`
  })

  CMS.registerEditorComponent({
    id: 'mark',
    label: t.md_mark,
    icon: 'ink_marker',
    trigger: 'button',
    mode: 'dialog',
    summary: '{{text}}',
    fields: [
      {
        name: 'sign',
        label: t.md_mark_sign,
        widget: 'select',
        required: false,
        options: [
          { value: '', label: t['opt-sign-none'] },
          { value: 'simple', label: t['opt-sign-simple'] },
          { value: 'circle', label: t['opt-sign-circle'] }
        ]
      },
      { name: 'text', label: t.md_mark_text }
    ],
    pattern: /==(?:::svg:sign-(simple|circle)::\s*)?(.+?)==/,
    fromBlock: match => ({
      sign: match[1] ?? '',
      text: match[2]
    }),
    toBlock: ({ sign = '', text = '' }) => `==${sign ? `::svg:sign-${sign}:: ` : ''}${text}==`,
    toPreview: ({ text }) => `<mark>${text}<mark>`
  })

  CMS.registerEditorComponent({
    id: 'ins',
    label: t.md_ins,
    icon: 'add_box',
    trigger: 'button',
    mode: 'dialog',
    summary: '{{text}}',
    fields: [
      { name: 'text', label: t.md_mark_text }
    ],
    pattern: /\+\+(?<text>.+?)\+\+/,
    toBlock: ({ text = '' }) => `++${text}++`,
    toPreview: ({ text }) => `<ins>${text}</ins>`
  })

  CMS.registerEditorComponent({
    id: 'sub',
    label: t.md_sub,
    icon: 'subscript',
    trigger: 'button',
    mode: 'dialog',
    summary: '{{text}}',
    fields: [
      { name: 'text', label: t.md_mark_text }
    ],
    pattern: /~(?<text>[^~]+?)~/,
    toBlock: ({ text = '' }) => `~${text}~`,
    toPreview: ({ text }) => `<sub>${text}</sub>`
  })

  CMS.registerEditorComponent({
    id: 'sup',
    label: t.md_sup,
    icon: 'superscript',
    trigger: 'button',
    mode: 'dialog',
    summary: '{{text}}',
    fields: [
      { name: 'text', label: t.md_mark_text }
    ],
    pattern: /\^(?<text>[^^]+?)\^/,
    toBlock: ({ text = '' }) => `^${text}^`,
    toPreview: ({ text }) => `<sup>${text}</sup>`
  })

  CMS.registerEditorComponent({
    id: 'gallery',
    label: t.md_gallery,
    icon: 'wallpaper_slideshow',
    trigger: 'button',
    collapsed: true,
    fields: [
      {
        name: 'images',
        label: t.limgs,
        widget: 'list',
        collapsed: true,
        summary: '{{src}}',
        thumbnail: 'src',
        fields: [
          { name: 'src', label: t['opt-widget-vimg'], widget: 'file', choose_url: true, max_file_size: 25000000, accept: '.mp4,.mov,.avi,.webm,.MP4,.MOV,.AVI,.WEBM' },
          { name: 'ratio', label: t.ratio, hint: t.ratio_hint, pattern: [/^[\d/]*$/, t.ratio_pattern], required: false },
          { name: 'title', label: t.md_title, required: false },
          { name: 'url', label: t.url, required: false }
        ]
      }
    ],
    pattern: /(?<!<!-- gallery-simple -->\n)^(?<gallery>(?:!\[[^\n]*\]\([^\n]+\)|\[!\[[^\n]*\]\([^\n]+\)\]\([^\n]+\))(?:\n(?:!\[[^\n]*\]\([^\n]+\)|\[!\[[^\n]*\]\([^\n]+\)\]\([^\n]+\)))*)$/m,
    fromBlock: match => {
      const gallery = match.groups?.gallery ?? match[1] ?? ''
      return {
        images: gallery.split('\n').map(line => {
          const linkedMatch = line.match(/^\[!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\)\]\((.*?)\)$/)
          if (linkedMatch) {
            return {
              ratio: linkedMatch[1],
              src: decodeURI(linkedMatch[2]),
              title: linkedMatch[3] ?? '',
              url: decodeURI(linkedMatch[4])
            }
          }
          const imageMatch = line.match(/^!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\)$/)
          return {
            ratio: imageMatch?.[1] ?? '',
            src: imageMatch?.[2] ? decodeURI(imageMatch[2]) : '',
            title: imageMatch?.[3] ?? '',
            url: ''
          }
        })
      }
    },
    toBlock: ({ images = [] }) =>
      images
        .filter(({ src }) => src)
        .map(({ src, ratio = '', title = '', url = '' }) => {
          const image = `![${ratio}](${src}${title ? ` "${title}"` : ''})`
          return url ? `[${image}](${url})` : image
        })
        .join('\n'),
    toPreview: () => ''
  })

  CMS.registerEditorComponent({
    id: 'gallery-simple',
    label: t.md_gallery_simple,
    icon: 'collections',
    trigger: 'button',
    collapsed: true,
    fields: [
      { name: 'images', label: t.imgs, widget: 'file', multiple: true, choose_url: true, max_file_size: 25000000, accept: '.mp4,.mov,.avi,.webm,.MP4,.MOV,.AVI,.WEBM' },
      { name: 'ratio', label: t.ratio, hint: t.ratio_hint, required: false },
      { name: 'title', label: t.md_title, required: false }
    ],
    pattern: /^<!-- gallery-simple -->\n(?<gallery>(?:!\[[^\n]*\]\([^\n]+\)(?:\n|$))+)/m,
    fromBlock: match => {
      const gallery = match.groups?.gallery ?? match[1] ?? ''
      const images = []
      let ratio = ''
      let title = ''
      gallery
        .trim()
        .split('\n')
        .forEach((line, index) => {
          const imageMatch = line.match(/^!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\)$/)
          if (!imageMatch) return
          images.push(decodeURI(imageMatch[2]))
          if (index === 0) {
            ratio = imageMatch[1]
            title = (imageMatch[3] ?? '').replace(/\s+\d+$/, '')
          }
        })
      return { images, ratio, title }
    },
    toBlock: ({ images = [], ratio = '', title = '' }) => {
      const imageValues = Array.isArray(images) ? images : [images].filter(Boolean)
      const lines = imageValues.map((src, index) => {
        const number = index === 0 ? '' : ` ${index + 1}`
        const imageRatio = ratio
        const imageTitle = title ? `${title}${number}` : ''
        return `![${imageRatio}](${src}${imageTitle ? ` "${imageTitle}"` : ''})`
      })
      return `<!-- gallery-simple -->\n${lines.join('\n')}`
    },
    toPreview: () => ''
  })

  CMS.registerEditorComponent({
    id: 'inline-image',
    label: t.md_inline_image,
    icon: 'image',
    trigger: 'button',
    mode: 'dialog',
    summary: '🖼️ {{src}}',
    fields: [
      { name: 'src', label: t.imgs, widget: 'file', choose_url: true, max_file_size: 25000000, accept: '.mp4,.mov,.avi,.webm,.MP4,.MOV,.AVI,.WEBM' },
      { name: 'ratio', label: t.ratio, hint: t.ratio_hint, required: false },
      { name: 'title', label: t.md_title, required: false },
      { name: 'url', label: t.url, required: false }
    ],
    pattern: /(?:^|(?<=[^\n]))(?:\[!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\)\]\(([^)\s]+)\)|(?<!\[)!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\))/,
    fromBlock: match => {
      const linked = Boolean(match[1] !== undefined)
      return {
        ratio: linked ? match[1] ?? '' : match[5] ?? '',
        src: decodeURI(linked ? match[2] ?? '' : match[6] ?? ''),
        title: linked ? match[3] ?? '' : match[7] ?? '',
        url: linked ? decodeURI(match[4] ?? '') : ''
      }
    },
    toBlock: ({ src = '', ratio = '', title = '', url = '' }) => {
      const image = `![${ratio}](${src}${title ? ` "${title}"` : ''})`
      return url ? `[${image}](${url})` : image
    },
    toPreview: () => ''
  })

  CMS.registerEditorComponent({
    id: 'shortcode',
    label: t.md_shortcode,
    icon: 'data_object',
    trigger: 'button',
    mode: 'dialog',
    summary: '{{display}}',
    fields: [
      {
        name: 'type',
        label: t.md_shortcode_type,
        hint: t.md_shortcode_type_hint,
        widget: 'select',
        options: [
          { label: t.md_shortcode_tag, value: '<' },
          { label: t.md_shortcode_percent, value: '%' },
          { label: t.md_shortcode_none, value: '' }
        ]
      },
      { name: 'name', label: t.md_shortcode_name },
      { name: 'params', label: t.md_shortcode_params, required: false },
      { name: 'closing', label: t.md_shortcode_closing, widget: 'boolean', required: false },
      { name: 'display', widget: 'hidden', required: false }
    ],
    pattern: /\{\{\s*(?:(<|%)\s*)?(\/)?\s*([^\s}>%]+)(?:\s+((?:(?!\s*(?:>|%)?\s*\}\}).)+?))?\s*(?:>|%)?\s*\}\}/,
    fromBlock: match => {
      const type = match[1] ?? ''
      const closing = Boolean(match[2])
      const name = match[3] ?? ''
      const params = closing ? '' : match[4] ?? ''
      const prefix = type === '<' ? '< ' : type === '%' ? '% ' : ' '
      const suffix = type === '<' ? ' >' : type === '%' ? ' %' : ' '
      return {
        type,
        closing,
        name,
        params,
        display: `{{${prefix}${closing ? '/' : ''}${name}${params ? ` ${params}` : ''}${suffix}}}`
      }
    },
    toBlock: ({
      type = '',
      name = '',
      params = '',
      closing = false
    }) => {
      const prefix = type === '<' ? '< ' : type === '%' ? '% ' : ''
      const suffix = type === '<' ? ' >' : type === '%' ? ' %' : ''
      const shortcodeParams = !closing && params ? ` ${params}` : ''
      return `{{${prefix}${closing ? '/' : ''}${name}${shortcodeParams}${suffix}}}`
    },
    toPreview: () => ''
  })
}
