function processMarkdown(string) {
  const htmlText = string
    .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
    .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a class="CMS_Hint_link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return htmlText;
}

const CustomBooleanControl = ({ label, value, onChange, field }) => {
  const { hint } = field;

  const handleToggle = () => {
    // Change the value between true and false when the switch is clicked
    const newValue = value === true ? false : true;
    onChange(newValue);
  };

  const handleClear = () => {
    // Clears the value if it exists, otherwise does nothing
    if (value !== undefined) {
      onChange(undefined);
    }
  };

  const isNull = value === undefined;

  let rootClassName = 'CMS_Field_root CMS_WidgetBoolean_root CMS_WidgetBoolnew_root CMS_Field_cursor-pointer group/active CMS_Field_inline';
  if (isNull) rootClassName += ' CMS_Field_disabled';

  return h('div', { className: rootClassName }, [
    h('div', { className: 'CMS_Field_wrapper' }, [
      h('div', { className: 'CMS_Field_inline-wrapper' }, [
        h('label', { className: 'CMS_Label_root CMS_Label_cursor-pointer CMS_Label_inline CMS_Field_label' }, label),
        h('button', {
          className: 'CMS_Switch_clear CMS_Autocomplete_button CMS_IconButton_root CMS_IconButton_sm CMS_Button_root-sm CMS_Button_text-primary',
          onClick: handleClear,
          type: 'button',
          role: 'button',
          tabindex: '0',
          'data-no-dnd': 'true',
        }, [
          h('svg', {
            viewBox: '0 0 24 24',
            'aria-hidden': 'true',
            focusable: 'false',
            fill: 'currentColor',
            xmlns: 'http://www.w3.org/2000/svg',
            className: 'CMS_IconButton_icon CMS_Autocomplete_button-icon',
          }, [
            h('path', {
              d: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
            })
          ])
        ]),
        h('label', { className: 'CMS_Switch_root CMS_WidgetBoolean_input' }, [
          h('input', {
            type: 'checkbox',
            checked: value === true,
            onChange: handleToggle,
            className: 'CMS_Switch_input',
          }),
          h('div', { className: 'CMS_Switch_toggle' }),
        ]),
        hint && h('div', {
          className: 'CMS_Hint_root CMS_Hint_cursor-pointer CMS_Hint_inline CMS_Field_hint',
          dangerouslySetInnerHTML: { __html: processMarkdown(hint) },
        }),
      ])
    ])
  ]);
};

/*
const CustomBooleanPreview = ({ value }) => {
  const isNull = value === undefined;

  let rootClassName = 'CMS_Field_root CMS_WidgetBoolean_root CMS_WidgetBoolnew_root CMS_Field_cursor-pointer group/active CMS_Field_inline';
  if (isNull) rootClassName += ' CMS_Field_disabled';

  return h('div', { className: rootClassName }, [
    h('div', { className: 'CMS_Field_wrapper' }, [
      h('div', { className: 'CMS_Field_inline-wrapper' }, [
        h('label', { className: 'CMS_Label_root CMS_Label_cursor-pointer CMS_Label_inline' }, 'Custom Boolean'),
        h('label', { className: 'CMS_Switch_root CMS_WidgetBoolean_input' }, [
          h('input', {
            type: 'checkbox',
            checked: value === true,
            disabled: isNull,
            className: 'CMS_Switch_input',
          }),
          h('div', { className: 'CMS_Switch_toggle' }),
        ]),
      ])
    ])
  ]);
};
*/

CMS.registerWidget('boolnew', CustomBooleanControl /*, CustomBooleanPreview */);
