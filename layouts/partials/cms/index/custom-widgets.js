const withResetButton = (OriginalComponent) => {
  return ({ label, value, onChange, ...props }) => {
    // const [key, setKey] = window.useState(Date.now())

    const isSet = value !== undefined
    const isDefault = props.field.default !== undefined

    let wrapClass = isSet ? 'is-set' : 'is-not-set'
    if (isDefault || value === '') wrapClass = 'id-default'
    // if (!isSet) wrapClass = wrapClass + ' is-empty'

    let isButton = isSet
    if (isDefault && props.field.default === value) isButton = false
    if (isDefault && props.field.widget === 'boolean') isButton = false
    if (props.forSingleList) isButton = false

    const handleReset = (e) => {
      const reset = props.field.required || props.field.default !== undefined
        ? props.field.default
        : undefined
      onChange(reset)
      // setTimeout(() => {
      //   onChange(reset)
      //   setKey(Date.now())
      //   setTimeout(() => {
      //     onChange(reset)
      //   }, 1500)
      // }, 1500)
      // const widgetWrap = e.target.closest('.CMS_EditorControl_root')
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
      //   } else if (props.field.widget === 'image') {
      //     remove = widgetWrap.querySelector('[data-testid="remove-upload"]')
      //     if (remove) remove.click()
      //     setTimeout(() => onChange(reset), 500)
      //   }
      //   console.log(remove)
      // }, 1000)
      console.log(label, value, props)
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
  'code',
  'color',
  'datetime',
  'file',
  'image',
  'list',
  'map',
  'markdown',
  'number',
  'relation',
  'select',
  'string',
  'text'
]
widgets.forEach(widget => {
  const ExistingControl = CMS.getWidget(widget).control
  const CustomControl = withResetButton(ExistingControl)
  CMS.registerWidget(widget, CustomControl)
})
