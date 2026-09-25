import { t } from '@params'
import { createIconPreviewElement } from './custom-fields'

const SUMMARY_SEPARATOR = '\u2063'
const INLINE_COMPONENT_SELECTOR = '[data-component-name="x-icon"], [data-component-name="x-link"], [data-component-name="x-shortcode"]'
const INLINE_CARET_COMPONENTS = new Set([
  'x-icon',
  'x-link',
  'x-mark',
  'x-ins',
  'x-sub',
  'x-sup',
  'x-inline-image',
  'x-shortcode'
])
let inlinePreviewObserver

function initEditorComponentStyles () {
  if (document.getElementById('sansoul-editor-component-styles')) return

  const style = document.createElement('style')

  style.id = 'sansoul-editor-component-styles'
  style.textContent = `
    :root:not(#aux) {
      [data-component-name="x-link"] {
        color: var(--sui-primary-accent-color-text);
        border-color: var(--sui-button-primary-background-color, var(--sui-primary-accent-color));
        border-width: 0;
        margin: 0;
      }

      [data-component-name="x-icon"] {
        width: auto;
        max-width: none;
        max-height: none;
        overflow: visible;
        border: 0;
        padding: 0;
        margin: 0;
        color: inherit;
        font-family: inherit;
        font-weight: normal;
        font-style: normal;
        line-height: 1;
        letter-spacing: normal;
        text-transform: none;
        white-space: nowrap;
        word-wrap: normal;
        direction: ltr;
        font-feature-settings: normal;
        -webkit-font-feature-settings: normal;
        -webkit-font-smoothing: antialiased;
        border-width: 0;
        margin: 0;
      }

      [data-component-name="x-icon"][data-sansoul-enhanced="true"],
      [data-component-name="x-link"][data-sansoul-enhanced="true"],
      [data-component-name="x-shortcode"][data-sansoul-enhanced="true"] {
        font-size: 0;
      }

      .sansoul-editor-preview {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        color: inherit;
        font-size: var(--sui-control-font-size, 16px);
        line-height: 1;
        vertical-align: middle;
        pointer-events: none;
      }

      .sansoul-editor-preview--icon {
        min-width: 24px;
        min-height: 24px;
      }

      .sansoul-editor-preview--link {
        border-bottom: 1px solid currentColor;
        gap: 0.3em;
        max-width: 100%;
        line-height: var(--sui-control-line-height, 1.4);
      }

      .sansoul-editor-preview--link.is-button {
        border: 1px solid currentColor;
        border-radius: var(--sui-control-border-radius, 4px);
        padding: 0.15em 0.4em;
        text-decoration: none;
      }

      .sansoul-editor-link-text {
        overflow: hidden;
        min-width: 0;
        max-width: 100%;
        font-size: inherit;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      [data-field-type="markdown"] li:has(> [data-component-name="x-icon"]:first-child) {
        list-style-type: none;
      }

      [data-field-type="markdown"] li:has(> [data-component-name="x-icon"]:first-child) > [data-component-name="x-icon"] {
        margin-left: -27px;
      }

      [data-component-name="x-mark"] {
        border: 0;
        margin: 0;
        background-color: mark;
        color: marktext;
      }

      [data-component-name="x-ins"] {
        border: 0;
        padding: 0;
        margin: 0;
        text-decoration: underline;
      }

      [data-component-name="x-sub"] {
        bottom: -0.25em;
      }

      [data-component-name="x-sup"] {
        top: -0.5em;
      }

      [data-component-name="x-sub"],
      [data-component-name="x-sup"] {
        position: relative;
        border: 0;
        padding: 0;
        margin: 0;
        color: var(--sui-primary-accent-color-text);
        font-size: 75%;
        vertical-align: baseline;
      }

      [data-component-name="x-inline-image"],
      [data-component-name="x-shortcode"] {
        margin: 0;
        font-family: var(--sui-font-family-monospace);
      }

      [data-component-name="x-shortcode"] {
        padding: 4.5px;
      }

      .sansoul-editor-preview--shortcode {
        font-family: var(--sui-font-family-monospace);
      }
    }
  `

  document.head.appendChild(style)
}

function getSummaryText (element) {
  const summary = Array.from(element.childNodes)
    .filter(function (node) {
      return node.nodeType === 3
    })
    .map(function (node) {
      return node.nodeValue || ''
    })
    .join('')

  if (summary) {
    element.dataset.sansoulSummary = summary
    return summary
  }

  return element.dataset.sansoulSummary || ''
}

function getPreviewHost (element, type) {
  let preview = Array.from(element.children).find(function (child) {
    return child.classList.contains('sansoul-editor-preview')
  })

  if (!preview) {
    preview = document.createElement('span')
    element.appendChild(preview)
  }

  preview.className = `sansoul-editor-preview sansoul-editor-preview--${type}`
  element.dataset.sansoulEnhanced = 'true'

  return preview
}

function isInitialComponentLabel (element, value) {
  const normalized = normalizeLabelText(value).toLocaleLowerCase()
  const candidates = [
    element.getAttribute('aria-label'),
    element.getAttribute('title')
  ]
    .map(normalizeLabelText)
    .filter(Boolean)
    .map(function (label) {
      return label.toLocaleLowerCase()
    })

  return Boolean(normalized && candidates.includes(normalized))
}

function decorateIconPlaceholder (element) {
  const icon = getSummaryText(element).trim()

  // Sveltia briefly renders the component label (for example "Icono") before
  // resolving the summary after a new component is inserted. Leave that
  // framework-owned text node untouched and wait for the real value.
  if (!icon || isInitialComponentLabel(element, icon)) return

  const preview = getPreviewHost(element, 'icon')

  if (preview.dataset.source === icon && preview.childNodes.length) return

  preview.dataset.source = icon
  preview.replaceChildren(createIconPreviewElement(icon, { size: '24px' }))
}

function decorateLinkPlaceholder (element) {
  const source = getSummaryText(element)

  // The custom summary always contains our invisible separators. If they are
  // not present yet, Sveltia is still showing its temporary component label.
  if (!source.includes(SUMMARY_SEPARATOR)) return

  const [icon = '', anchor = '', btn = '0', swap = '0'] = source.split(SUMMARY_SEPARATOR)
  const preview = getPreviewHost(element, 'link')

  if (preview.dataset.source === source && preview.childNodes.length) return

  preview.dataset.source = source
  preview.classList.toggle('is-button', btn === '1')
  preview.replaceChildren()

  const iconPreview = icon
    ? createIconPreviewElement(icon, { size: '1.15em' })
    : null
  const text = document.createElement('span')

  text.className = 'sansoul-editor-link-text'
  text.textContent = anchor

  if (swap === '1') {
    preview.appendChild(text)
    if (iconPreview) preview.appendChild(iconPreview)
  } else {
    if (iconPreview) preview.appendChild(iconPreview)
    preview.appendChild(text)
  }
}

function formatShortcode ({ type = '', name = '', params = '', closing = false } = {}) {
  const prefix = type === '<' ? '< ' : type === '%' ? '% ' : ''
  const suffix = type === '<' ? ' >' : type === '%' ? ' %' : ''
  const shortcodeParams = !closing && params ? ` ${params}` : ''

  return `{{${prefix}${closing ? '/' : ''}${name}${shortcodeParams}${suffix}}}`
}

function decorateShortcodePlaceholder (element) {
  const source = getSummaryText(element)

  // As with icon/link, wait until Sveltia replaces the temporary component
  // label with the actual summary values from the dialog.
  if (!source.includes(SUMMARY_SEPARATOR)) return

  const [type = '', name = '', params = '', closing = '0'] = source.split(SUMMARY_SEPARATOR)
  const preview = getPreviewHost(element, 'shortcode')

  if (preview.dataset.source === source && preview.childNodes.length) return

  preview.dataset.source = source
  preview.textContent = formatShortcode({
    type,
    name,
    params,
    closing: closing === '1'
  })
}

function decorateInlinePlaceholder (element) {
  if (!(element instanceof HTMLElement)) return

  if (element.dataset.componentName === 'x-icon') {
    decorateIconPlaceholder(element)
  } else if (element.dataset.componentName === 'x-link') {
    decorateLinkPlaceholder(element)
  } else if (element.dataset.componentName === 'x-shortcode') {
    decorateShortcodePlaceholder(element)
  }
}

function decorateInlinePlaceholdersWithin (root) {
  if (!(root instanceof Element) && root !== document) return

  if (root instanceof Element && root.matches(INLINE_COMPONENT_SELECTOR)) {
    decorateInlinePlaceholder(root)
  }

  root.querySelectorAll(INLINE_COMPONENT_SELECTOR).forEach(decorateInlinePlaceholder)
}

function isPreviewMutation (mutation) {
  const target = mutation.target.nodeType === 1
    ? mutation.target
    : mutation.target.parentElement

  if (target?.closest('.sansoul-editor-preview')) return true

  if (
    mutation.type === 'childList' &&
    mutation.removedNodes.length === 0 &&
    mutation.addedNodes.length > 0 &&
    Array.from(mutation.addedNodes).every(function (node) {
      return node.nodeType === 1 && node.classList.contains('sansoul-editor-preview')
    })
  ) {
    return true
  }

  return false
}

function getComponentPlaceholder (node) {
  if (!(node instanceof Element)) return null
  if (node.matches('[data-component-name]')) return node
  return node.querySelector('[data-component-name]')
}

function moveCaretAfterInlineComponent (element) {
  if (!(element instanceof HTMLElement)) return
  if (!INLINE_CARET_COMPONENTS.has(element.dataset.componentName)) return

  requestAnimationFrame(function () {
    if (!element.isConnected) return

    const editor = element.closest('[contenteditable="true"]')
    const selection = window.getSelection()
    const anchor = getElementFromNode(selection?.anchorNode)

    // Only adjust the caret after a live insertion. When switching modes or
    // rehydrating the editor, focus/selection is outside the editable root.
    if (!editor || !selection || !selection.isCollapsed || !anchor || !editor.contains(anchor)) return

    const range = document.createRange()

    range.setStartAfter(element)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    if (document.activeElement !== editor) {
      editor.focus({ preventScroll: true })
    }
  })
}

function initInlineComponentPreviews () {
  if (inlinePreviewObserver) return

  if (!document.body) {
    requestAnimationFrame(initInlineComponentPreviews)
    return
  }

  decorateInlinePlaceholdersWithin(document)

  inlinePreviewObserver = new MutationObserver(function (mutations) {
    const placeholders = new Set()

    mutations.forEach(function (mutation) {
      if (isPreviewMutation(mutation)) return

      const target = mutation.target.nodeType === 1
        ? mutation.target
        : mutation.target.parentElement
      const placeholder = target?.closest?.(INLINE_COMPONENT_SELECTOR)

      if (placeholder) placeholders.add(placeholder)

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) return

          if (node.matches(INLINE_COMPONENT_SELECTOR)) placeholders.add(node)
          node.querySelectorAll(INLINE_COMPONENT_SELECTOR).forEach(function (child) {
            placeholders.add(child)
          })

          const component = getComponentPlaceholder(node)

          if (component) moveCaretAfterInlineComponent(component)
        })
      }
    })

    placeholders.forEach(decorateInlinePlaceholder)
  })

  inlinePreviewObserver.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true
  })
}

function renderLinkPreview ({ icon = '', anchor = '', btn = false, swap = false } = {}) {
  const preview = document.createElement('span')
  const text = document.createElement('span')
  const iconPreview = icon
    ? createIconPreviewElement(icon, { size: '1.15em' })
    : null

  preview.className = 'sansoul-editor-preview sansoul-editor-preview--link'
  preview.classList.toggle('is-button', Boolean(btn))

  text.className = 'sansoul-editor-link-text'
  text.textContent = anchor

  if (swap) {
    preview.appendChild(text)
    if (iconPreview) preview.appendChild(iconPreview)
  } else {
    if (iconPreview) preview.appendChild(iconPreview)
    preview.appendChild(text)
  }

  return preview
}

let pendingRichTextSelection = null
let lastRichTextSelection = null
let selectionPrefillObserver

function getElementFromNode (node) {
  return node?.nodeType === Node.ELEMENT_NODE
    ? node
    : node?.parentElement ?? null
}

function getSelectedRichText () {
  const selection = window.getSelection()

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const start = getElementFromNode(range.startContainer)
  const end = getElementFromNode(range.endContainer)
  const editor = start?.closest('[contenteditable="true"]')
  const text = selection.toString()

  if (!editor || !end || !editor.contains(end) || !text) return null

  const field = editor.closest('[data-field-type="markdown"], [data-field-type="richtext"]')

  return { editor, field, text }
}

function rememberRichTextSelection () {
  const selected = getSelectedRichText()

  if (!selected) return

  lastRichTextSelection = {
    editor: selected.editor,
    field: selected.field,
    text: selected.text,
    time: performance.now()
  }
}

function normalizeLabelText (value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getControlLabelText (control) {
  const labels = control.labels ? Array.from(control.labels) : []
  const explicit = control.getAttribute('aria-label') || ''
  const labelledBy = control.getAttribute('aria-labelledby')
  const labelledText = labelledBy
    ? labelledBy.split(/\s+/).map(function (id) {
        return document.getElementById(id)?.textContent || ''
      }).join(' ')
    : ''

  return normalizeLabelText([
    explicit,
    labelledText,
    ...labels.map(function (label) { return label.textContent || '' })
  ].join(' '))
}

function getVisibleTextControls (dialog) {
  return Array.from(dialog.querySelectorAll('input, textarea')).filter(function (control) {
    if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement)) return false
    if (control instanceof HTMLInputElement && ['checkbox', 'radio', 'hidden', 'button', 'submit'].includes(control.type)) return false
    return control.getClientRects().length > 0 && !control.disabled
  })
}

function findDialogFieldControl (dialog, label) {
  const wanted = normalizeLabelText(label).toLocaleLowerCase()

  if (!wanted) return null

  const controls = getVisibleTextControls(dialog)
  const labelled = controls.find(function (control) {
    const actual = getControlLabelText(control).toLocaleLowerCase()
    return actual === wanted || actual.startsWith(`${wanted} `) || actual.includes(` ${wanted} `)
  })

  if (labelled) return labelled

  // Fallback for Sveltia field wrappers where the visible label is not a
  // native <label> associated with the input.
  return controls.find(function (control) {
    let wrapper = control.parentElement

    for (let depth = 0; wrapper && depth < 4; depth += 1, wrapper = wrapper.parentElement) {
      const text = normalizeLabelText(wrapper.textContent).toLocaleLowerCase()
      if (text.startsWith(wanted) || text.includes(`${wanted} `)) return true
    }

    return false
  }) ?? null
}

function setTextControlValue (control, value) {
  if (!control || control.value) return false

  const prototype = control instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')

  descriptor?.set?.call(control, value)
  control.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  control.dispatchEvent(new Event('change', { bubbles: true, composed: true }))

  return true
}

function getOpenDialogs () {
  return Array.from(document.querySelectorAll('dialog[open], [role="dialog"]'))
    .filter(function (dialog) {
      return dialog instanceof HTMLElement && (
        dialog.matches('dialog[open]') || dialog.getClientRects().length > 0
      )
    })
    .reverse()
}

function dialogMatchesLabel (dialog, label) {
  const wanted = normalizeLabelText(label).toLocaleLowerCase()

  if (!wanted) return false

  const names = [
    dialog.getAttribute('aria-label'),
    dialog.getAttribute('title'),
    dialog.querySelector('h1, h2, h3, [role="heading"]')?.textContent
  ]
    .map(normalizeLabelText)
    .filter(Boolean)
    .map(function (value) { return value.toLocaleLowerCase() })

  if (names.some(function (value) {
    return value === wanted || value.startsWith(`${wanted} `)
  })) return true

  return normalizeLabelText(dialog.textContent).toLocaleLowerCase().includes(wanted)
}

function submitSingleFieldDialog (dialog) {
  const submitButtons = Array.from(dialog.querySelectorAll('button[type="submit"]')).filter(function (button) {
    return button instanceof HTMLButtonElement && !button.disabled && button.getClientRects().length > 0
  })

  if (submitButtons.length !== 1) return false

  requestAnimationFrame(function () {
    if (submitButtons[0].isConnected) submitButtons[0].click()
  })

  return true
}

function applyPendingSelectionToDialogs () {
  if (!pendingRichTextSelection) return

  if (performance.now() - pendingRichTextSelection.time > 2500) {
    pendingRichTextSelection = null
    return
  }

  for (const dialog of getOpenDialogs()) {
    const controls = getVisibleTextControls(dialog)
    const anchorControl = findDialogFieldControl(dialog, t.md_anchor)

    if (anchorControl) {
      if (setTextControlValue(anchorControl, pendingRichTextSelection.text)) {
        pendingRichTextSelection = null
      }
      return
    }

    const markTextControl = findDialogFieldControl(dialog, t.md_mark_text)
    const dialogText = normalizeLabelText(dialog.textContent).toLocaleLowerCase()
    const markSign = normalizeLabelText(t.md_mark_sign).toLocaleLowerCase()
    const looksLikeMarkDialog = Boolean(markSign && dialogText.includes(markSign))

    if (markTextControl && looksLikeMarkDialog) {
      if (setTextControlValue(markTextControl, pendingRichTextSelection.text)) {
        pendingRichTextSelection = null
      }
      return
    }

    const isSimpleTextComponent = [t.md_ins, t.md_sub, t.md_sup].some(function (label) {
      return dialogMatchesLabel(dialog, label)
    })

    if (isSimpleTextComponent && controls.length === 1) {
      if (setTextControlValue(controls[0], pendingRichTextSelection.text)) {
        pendingRichTextSelection = null
        submitSingleFieldDialog(dialog)
      }
      return
    }

    // Last-resort structural fallbacks. The link component has several text
    // fields, while the mark component has one text field plus its sign field.
    if (controls.length >= 3 && normalizeLabelText(dialog.textContent).includes(normalizeLabelText(t.url))) {
      if (setTextControlValue(controls[1], pendingRichTextSelection.text)) {
        pendingRichTextSelection = null
      }
      return
    }

    if (controls.length === 1 && looksLikeMarkDialog) {
      if (setTextControlValue(controls[0], pendingRichTextSelection.text)) {
        pendingRichTextSelection = null
      }
      return
    }
  }
}

function captureRichTextSelection (event) {
  const trigger = event.target?.closest?.('button, [role="button"]')

  if (!trigger || trigger.closest('[data-component-name]')) return

  const selected = getSelectedRichText()
  const cached = lastRichTextSelection && performance.now() - lastRichTextSelection.time < 5000
    ? lastRichTextSelection
    : null
  const source = selected || cached

  if (!source?.text) return

  pendingRichTextSelection = {
    text: source.text,
    time: performance.now()
  }

  requestAnimationFrame(applyPendingSelectionToDialogs)
}

function initSelectionPrefill () {
  if (selectionPrefillObserver) return

  document.addEventListener('selectionchange', rememberRichTextSelection)
  document.addEventListener('pointerdown', captureRichTextSelection, true)

  selectionPrefillObserver = new MutationObserver(function () {
    applyPendingSelectionToDialogs()
  })

  selectionPrefillObserver.observe(document.body, {
    childList: true,
    subtree: true
  })
}

export function initEditorComponents () {
  const { CMS } = window
  if (!CMS) return

  initEditorComponentStyles()
  initInlineComponentPreviews()
  initSelectionPrefill()

  CMS.registerEditorComponent({
    id: 'link',
    label: t.url,
    icon: 'link',
    trigger: 'button',
    mode: 'dialog',
    summary: `{{icon}}${SUMMARY_SEPARATOR}{{anchor}}${SUMMARY_SEPARATOR}{{btn | ternary('1', '0')}}${SUMMARY_SEPARATOR}{{swap | ternary('1', '0')}}`,
    fields: [
      { name: 'url', label: t.url },
      { name: 'anchor', label: t.md_anchor, required: false },
      { name: 'title', label: t.md_title, required: false },
      { name: 'icon', label: t.icon, widget: 'icon', hint: t.icon_hint, required: false },
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
    toPreview: renderLinkPreview
  })

  CMS.registerEditorComponent({
    id: 'icon',
    label: t.icon,
    icon: 'emoji_symbols',
    trigger: 'button',
    mode: 'dialog',
    summary: '{{icon}}',
    fields: [
      { name: 'icon', label: t.icon, widget: 'icon', hint: t.icon_hint, no_dialog: true }
    ],
    pattern: /::(?<icon>.+?)::/,
    toBlock: ({ icon = '' }) => `::${icon}::`,
    toPreview: ({ icon = '' } = {}) => createIconPreviewElement(icon, { size: '1.35em' })
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
    toPreview: ({ text }) => `<mark>${text}</mark>`
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
    summary: `{{type}}${SUMMARY_SEPARATOR}{{name}}${SUMMARY_SEPARATOR}{{params}}${SUMMARY_SEPARATOR}{{closing | ternary('1', '0')}}`,
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
        display: formatShortcode({ type, name, params, closing })
      }
    },
    toBlock: ({
      type = '',
      name = '',
      params = '',
      closing = false
    }) => {
      return formatShortcode({ type, name, params, closing })
    },
    toPreview: ({ type = '', name = '', params = '', closing = false } = {}) => {
      const preview = document.createElement('span')

      preview.className = 'sansoul-editor-preview sansoul-editor-preview--shortcode'
      preview.textContent = formatShortcode({ type, name, params, closing })

      return preview
    }
  })
}
