const withResetButton = (OriginalComponent) => {
  return ({ label, value, onChange, ...props }) => {
    const isSet = value !== undefined
    const isDefault = props.field.default !== undefined

    let wrapClass = isSet ? 'is-set' : 'is-not-set'
    if (isDefault || value === '') wrapClass = 'is-default'
    if (!isSet) wrapClass = wrapClass + ' is-empty'

    let isButton = isSet && !isDefault && !props.field.required
    // if (isDefault && props.field.default === value) isButton = false
    // if (isDefault && props.field.widget === 'boolean') isButton = false
    if (props.forSingleList) isButton = false

    const handleReset = (e) => {
      if (props.field.widget === 'image') {
        const widgetWrap = e.target.closest('.CMS_EditorControl_root')
        const remove = widgetWrap.querySelector('[data-testid="remove-upload"]')
        if (remove) remove.click()
        setTimeout(() => onChange(undefined), 500)
        console.log(remove)
      } else {
        onChange(undefined)
      }
      console.log(label, value, props)
      // let remove
      // setTimeout(() => {
      //   if (['string', 'text', ''].includes(props.field.widget)) {
      //     remove = widgetWrap.querySelector('input')
      //     if (remove) remove.value = props.field.default || ''
      //   } else if (props.field.widget === 'textarea') {
      //     remove = widgetWrap.querySelector('textarea')
      //     if (remove) remove.value = props.field.default || ''
      //   } else if (props.field.widget === 'select') {
      //     remove = widgetWrap.querySelector('input')
      //     if (remove) remove.value = props.field.default || ''
      //   } else if (props.field.widget === 'list') {
      //     remove = widgetWrap.querySelector('[data-testid="object-fields"]')
      //     if (remove) {
      //       remove.firstChild.remove()
      //       remove.firstChild.remove()
      //       remove.firstChild.remove()
      //     }
      //   } else {}
      // }, 1000)
    }

    return h('div',
      { className: wrapClass },
      [
        h(OriginalComponent, {
          label: label.replace(' (opcional)', ''),
          value,
          onChange,
          ...props
        }),
        isButton && h('button',
          {
            className: 'button--reset',
            title: 'Valor por defecto / eliminar',
            type: 'button',
            onClick: handleReset
          },
          h('svg',
            { className: 'CMS_IconButton_icon CMS_Autocomplete_button-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor', xmlns: 'http://www.w3.org/2000/svg' },
            [ h('path', { d: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z' }) ]
          )
        )
      ]
    )
  }
}
const widgets = [
  'boolean',
  // 'code',
  'color',
  'datetime',
  // 'file',
  'image',
  'list',
  'keyvalue',
  'map',
  'markdown',
  'number',
  // 'relation',
  'select',
  'string',
  'text'
]
widgets.forEach(widget => {
  const ExistingControl = CMS.getWidget(widget).control
  const CustomControl = withResetButton(ExistingControl)
  CMS.registerWidget(widget, CustomControl)
})
