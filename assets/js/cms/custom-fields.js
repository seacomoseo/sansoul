import { t } from '@params'

export function initCustomFields () {
  const radioStyles = `
    .radio-control {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .radio-option {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: var(--sui-focus-ring-width);
      color: var(--sui-control-foreground-color);
      font-family: var(--sui-control-font-family);
      font-size: var(--sui-control-font-size);
      line-height: var(--sui-control-line-height);
      cursor: pointer;
      -webkit-user-select: none;
      user-select: none;
    }

    .radio-option input {
      flex: none;
      justify-content: center;
      overflow: hidden;
      margin: 0 !important;
      border-width: 1.5px;
      border-color: var(--sui-checkbox-border-color);
      border-radius: var(--sui-checkbox-height);
      padding: 0;
      width: var(--sui-checkbox-height);
      height: var(--sui-checkbox-height);
      background-color: var(--sui-checkbox-background-color);
      transition: all 200ms;
      appearance: none;
      --radius-color: var(--sui-primary-accent-color);
    }

    .radio-option input::before {
      content: "";
      display: inline-block;
      border-radius: var(--sui-checkbox-height);
      width: calc(var(--sui-checkbox-height) - 7px);
      height: calc(var(--sui-checkbox-height) - 7px);
      margin: 2px;
      background-color: var(--radius-color);
      opacity: 0;
      transition: all 200ms;
      will-change: opacity;
    }

    .radio-option input:checked {
      border-color: var(--radius-color);
    }

    .radio-option input:checked::before {
      opacity: 1;
    }

    .radio-option input[title="null"] {
      --radius-color: var(--sui-disabled-foreground-color);
    }
    .radio-option input[title="true"] {
      --radius-color: var(--sui-success-border-color);
    }
    .radio-option input[title="false"] {
      --radius-color: var(--sui-error-border-color);
    }
  `

  if (!document.getElementById('radio-styles')) {
    const style = document.createElement('style')

    style.id = 'radio-styles'
    style.textContent = radioStyles

    document.head.appendChild(style)
  }

  const defaultOptions = [
    {
      label: t.def,
      value: null
    },
    {
      label: t.true,
      value: true
    },
    {
      label: t.false,
      value: false
    }
  ]

  const RadioControl = createClass({
    getOptions: function () {
      const field = this.props.field
      const hasCustomOptions = field.has('options')
      const required = field.get('required', true)

      let options

      if (hasCustomOptions) {
        options = field.get('options')

        if (options && typeof options.toJS === 'function') {
          options = options.toJS()
        }
      } else {
        options = required
          ? defaultOptions.filter(function (option) {
              return option.value !== null
            })
          : defaultOptions
      }

      if (!Array.isArray(options) || options.length === 0) {
        options = required
          ? defaultOptions.filter(function (option) {
              return option.value !== null
            })
          : defaultOptions
      }

      return options.map(function (option) {
        if (
          option !== null &&
          typeof option === 'object' &&
          Object.prototype.hasOwnProperty.call(option, 'value')
        ) {
          return {
            label: option.label ?? String(option.value ?? ''),
            value: option.value
          }
        }

        return {
          label: String(option ?? ''),
          value: option
        }
      })
    },

    handleChange: function (event) {
      const options = this.getOptions()
      const option = options[Number(event.target.value)]

      if (option) {
        this.props.onChange(option.value)
      }
    },

    render: function () {
      const options = this.getOptions()
      const currentValue = this.props.value

      return h(
        'div',
        {
          id: this.props.forID,
          className: `radio-control ${this.props.classNameWrapper || ''}`,
          role: 'radiogroup'
        },
        options.map(function (option, index) {
          const inputID = `${this.props.forID}-${index}`

          return h(
            'label',
            {
              key: inputID,
              htmlFor: inputID,
              className: 'radio-option'
            },
            h('input', {
              id: inputID,
              type: 'radio',
              name: this.props.forID,
              value: String(index),
              title: String(option.value),
              checked: Object.is(option.value, currentValue),
              onChange: this.handleChange
            }),
            h('span', null, option.label)
          )
        }, this)
      )
    }
  })

  CMS.registerFieldType('radio', RadioControl)
}
