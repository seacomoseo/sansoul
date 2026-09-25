import { t } from '@params'

const MATERIAL_SYMBOLS_URL = 'https://fonts.google.com/metadata/icons?incomplete=1&key=material_symbols'
const MATERIAL_SYMBOLS_MIRROR_URL = 'https://raw.githubusercontent.com/timmaffett/material_symbols_icons/master/lib/material_symbols_metadata.dart'
const MATERIAL_SYMBOLS_FALLBACK_URL = 'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints'
const ICONIFY_API = 'https://api.iconify.design'
const SANSOUL_ICON_RAW_BASE = 'https://raw.githubusercontent.com/seacomoseo/sansoul/refs/heads/main/assets/u/icons'

const sansoulSvgIcons = [
  'flag-de',
  'flag-en',
  'flag-es',
  'flag-fr',
  'flag-it',
  'flag-pt',
  'play-iframe',
  'sign-circle',
  'sign-simple',
  'star-fill',
  'star-fill-half',
  'youtube-iframe'
].sort()

const sansoulBrandIcons = [
  'seacomoseo',
  'whatsapp-o'
]

const modes = [
  { id: 'material', label: 'Material' },
  { id: 'emoji', label: 'Emoji' },
  { id: 'text', label: 'Text' },
  { id: 'brand', label: 'Brand' },
  { id: 'svg', label: 'SVG' }
]

const materialCategories = [
  'Audio&Video',
  'Images',
  'UI actions',
  'Social',
  'Android',
  'Maps',
  'Actions',
  'Communicate',
  'Household',
  'Business',
  'Home',
  'Hardware',
  'Text',
  'Privacy',
  'Transit',
  'Activities',
  'Travel',
  'Others'
]

const materialCategoryLabels = {
  'Audio&Video': 'Audio & Video',
  Images: 'Photo & Image',
  'UI actions': 'UI actions',
  Social: 'Social',
  Android: 'Android',
  Maps: 'Maps',
  Actions: 'Common actions',
  Communicate: 'Communication',
  Household: 'Household',
  Business: 'Business & Payments',
  Home: 'Home',
  Hardware: 'Hardware',
  Text: 'Text Formatting',
  Privacy: 'Privacy & Security',
  Transit: 'Transportation',
  Activities: 'Activities',
  Travel: 'Travel',
  Others: 'Others'
}

const materialCategoryAliases = {
  av: 'Audio&Video',
  audioandvideo: 'Audio&Video',
  audiovideo: 'Audio&Video',
  image: 'Images',
  images: 'Images',
  photoandimage: 'Images',
  uiaction: 'UI actions',
  uiactions: 'UI actions',
  social: 'Social',
  android: 'Android',
  map: 'Maps',
  maps: 'Maps',
  action: 'Actions',
  actions: 'Actions',
  commonactions: 'Actions',
  communicate: 'Communicate',
  communication: 'Communicate',
  household: 'Household',
  business: 'Business',
  businessandpayments: 'Business',
  home: 'Home',
  hardware: 'Hardware',
  text: 'Text',
  textformatting: 'Text',
  privacy: 'Privacy',
  privacyandsecurity: 'Privacy',
  transit: 'Transit',
  transportation: 'Transit',
  activities: 'Activities',
  travel: 'Travel',
  other: 'Others',
  others: 'Others'
}

const emojiCategories = [{"id":"smileys","labelKey":"icon_emoji_smileys","icon":"😀","emojis":["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","🫠","😉","😊","😇","🥰","😍","🤩","😘","😗","☺","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🫢","🫣","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😶‍🌫️","😏","😒","🙄","😬","😮‍💨","🤥","🫨","🙂‍↔️","🙂‍↕️","😌","😔","😪","🤤","😴","🫩","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","😵‍💫","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","🫤","😟","🙁","☹","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠","💩","🤡","👹","👺","👻","👽","👾","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾","🙈","🙉","🙊","💌","💘","💝","💖","💗","💓","💞","💕","💟","❣","💔","❤️‍🔥","❤️‍🩹","❤","🩷","🧡","💛","💚","💙","🩵","💜","🤎","🖤","🩶","🤍","💋","💯","💢","💥","💫","💦","💨","🕳","💬","👁️‍🗨️","🗨","🗯","💭","💤"]},{"id":"people","labelKey":"icon_emoji_people","icon":"👋","emojis":["👋","👋🏻","👋🏼","👋🏽","👋🏾","👋🏿","🤚","🤚🏻","🤚🏼","🤚🏽","🤚🏾","🤚🏿","🖐","🖐🏻","🖐🏼","🖐🏽","🖐🏾","🖐🏿","✋","✋🏻","✋🏼","✋🏽","✋🏾","✋🏿","🖖","🖖🏻","🖖🏼","🖖🏽","🖖🏾","🖖🏿","🫱","🫱🏻","🫱🏼","🫱🏽","🫱🏾","🫱🏿","🫲","🫲🏻","🫲🏼","🫲🏽","🫲🏾","🫲🏿","🫳","🫳🏻","🫳🏼","🫳🏽","🫳🏾","🫳🏿","🫴","🫴🏻","🫴🏼","🫴🏽","🫴🏾","🫴🏿","🫷","🫷🏻","🫷🏼","🫷🏽","🫷🏾","🫷🏿","🫸","🫸🏻","🫸🏼","🫸🏽","🫸🏾","🫸🏿","👌","👌🏻","👌🏼","👌🏽","👌🏾","👌🏿","🤌","🤌🏻","🤌🏼","🤌🏽","🤌🏾","🤌🏿","🤏","🤏🏻","🤏🏼","🤏🏽","🤏🏾","🤏🏿","✌","✌🏻","✌🏼","✌🏽","✌🏾","✌🏿","🤞","🤞🏻","🤞🏼","🤞🏽","🤞🏾","🤞🏿","🫰","🫰🏻","🫰🏼","🫰🏽","🫰🏾","🫰🏿","🤟","🤟🏻","🤟🏼","🤟🏽","🤟🏾","🤟🏿","🤘","🤘🏻","🤘🏼","🤘🏽","🤘🏾","🤘🏿","🤙","🤙🏻","🤙🏼","🤙🏽","🤙🏾","🤙🏿","👈","👈🏻","👈🏼","👈🏽","👈🏾","👈🏿","👉","👉🏻","👉🏼","👉🏽","👉🏾","👉🏿","👆","👆🏻","👆🏼","👆🏽","👆🏾","👆🏿","🖕","🖕🏻","🖕🏼","🖕🏽","🖕🏾","🖕🏿","👇","👇🏻","👇🏼","👇🏽","👇🏾","👇🏿","☝","☝🏻","☝🏼","☝🏽","☝🏾","☝🏿","🫵","🫵🏻","🫵🏼","🫵🏽","🫵🏾","🫵🏿","👍","👍🏻","👍🏼","👍🏽","👍🏾","👍🏿","👎","👎🏻","👎🏼","👎🏽","👎🏾","👎🏿","✊","✊🏻","✊🏼","✊🏽","✊🏾","✊🏿","👊","👊🏻","👊🏼","👊🏽","👊🏾","👊🏿","🤛","🤛🏻","🤛🏼","🤛🏽","🤛🏾","🤛🏿","🤜","🤜🏻","🤜🏼","🤜🏽","🤜🏾","🤜🏿","👏","👏🏻","👏🏼","👏🏽","👏🏾","👏🏿","🙌","🙌🏻","🙌🏼","🙌🏽","🙌🏾","🙌🏿","🫶","🫶🏻","🫶🏼","🫶🏽","🫶🏾","🫶🏿","👐","👐🏻","👐🏼","👐🏽","👐🏾","👐🏿","🤲","🤲🏻","🤲🏼","🤲🏽","🤲🏾","🤲🏿","🤝","🤝🏻","🤝🏼","🤝🏽","🤝🏾","🤝🏿","🙏","🙏🏻","🙏🏼","🙏🏽","🙏🏾","🙏🏿","✍","✍🏻","✍🏼","✍🏽","✍🏾","✍🏿","💅","💅🏻","💅🏼","💅🏽","💅🏾","💅🏿","🤳","🤳🏻","🤳🏼","🤳🏽","🤳🏾","🤳🏿","💪","💪🏻","💪🏼","💪🏽","💪🏾","💪🏿","🦾","🦿","🦵","🦵🏻","🦵🏼","🦵🏽","🦵🏾","🦵🏿","🦶","🦶🏻","🦶🏼","🦶🏽","🦶🏾","🦶🏿","👂","👂🏻","👂🏼","👂🏽","👂🏾","👂🏿","🦻","🦻🏻","🦻🏼","🦻🏽","🦻🏾","🦻🏿","👃","👃🏻","👃🏼","👃🏽","👃🏾","👃🏿","🧠","🫀","🫁","🦷","🦴","👀","👁","👅","👄","🫦","👶","👶🏻","👶🏼","👶🏽","👶🏾","👶🏿","🧒","🧒🏻","🧒🏼","🧒🏽","🧒🏾","🧒🏿","👦","👦🏻","👦🏼","👦🏽","👦🏾","👦🏿","👧","👧🏻","👧🏼","👧🏽","👧🏾","👧🏿","🧑","🧑🏻","🧑🏼","🧑🏽","🧑🏾","🧑🏿","👱","👱🏻","👱🏼","👱🏽","👱🏾","👱🏿","👨","👨🏻","👨🏼","👨🏽","👨🏾","👨🏿","🧔","🧔🏻","🧔🏼","🧔🏽","🧔🏾","🧔🏿","🧔‍♂️","🧔🏻‍♂️","🧔🏼‍♂️","🧔🏽‍♂️","🧔🏾‍♂️","🧔🏿‍♂️","🧔‍♀️","🧔🏻‍♀️","🧔🏼‍♀️","🧔🏽‍♀️","🧔🏾‍♀️","🧔🏿‍♀️","👨‍🦰","👨🏻‍🦰","👨🏼‍🦰","👨🏽‍🦰","👨🏾‍🦰","👨🏿‍🦰","👨‍🦱","👨🏻‍🦱","👨🏼‍🦱","👨🏽‍🦱","👨🏾‍🦱","👨🏿‍🦱","👨‍🦳","👨🏻‍🦳","👨🏼‍🦳","👨🏽‍🦳","👨🏾‍🦳","👨🏿‍🦳","👨‍🦲","👨🏻‍🦲","👨🏼‍🦲","👨🏽‍🦲","👨🏾‍🦲","👨🏿‍🦲","👩","👩🏻","👩🏼","👩🏽","👩🏾","👩🏿","👩‍🦰","👩🏻‍🦰","👩🏼‍🦰","👩🏽‍🦰","👩🏾‍🦰","👩🏿‍🦰","🧑‍🦰","🧑🏻‍🦰","🧑🏼‍🦰","🧑🏽‍🦰","🧑🏾‍🦰","🧑🏿‍🦰","👩‍🦱","👩🏻‍🦱","👩🏼‍🦱","👩🏽‍🦱","👩🏾‍🦱","👩🏿‍🦱","🧑‍🦱","🧑🏻‍🦱","🧑🏼‍🦱","🧑🏽‍🦱","🧑🏾‍🦱","🧑🏿‍🦱","👩‍🦳","👩🏻‍🦳","👩🏼‍🦳","👩🏽‍🦳","👩🏾‍🦳","👩🏿‍🦳","🧑‍🦳","🧑🏻‍🦳","🧑🏼‍🦳","🧑🏽‍🦳","🧑🏾‍🦳","🧑🏿‍🦳","👩‍🦲","👩🏻‍🦲","👩🏼‍🦲","👩🏽‍🦲","👩🏾‍🦲","👩🏿‍🦲","🧑‍🦲","🧑🏻‍🦲","🧑🏼‍🦲","🧑🏽‍🦲","🧑🏾‍🦲","🧑🏿‍🦲","👱‍♀️","👱🏻‍♀️","👱🏼‍♀️","👱🏽‍♀️","👱🏾‍♀️","👱🏿‍♀️","👱‍♂️","👱🏻‍♂️","👱🏼‍♂️","👱🏽‍♂️","👱🏾‍♂️","👱🏿‍♂️","🧓","🧓🏻","🧓🏼","🧓🏽","🧓🏾","🧓🏿","👴","👴🏻","👴🏼","👴🏽","👴🏾","👴🏿","👵","👵🏻","👵🏼","👵🏽","👵🏾","👵🏿","🙍","🙍🏻","🙍🏼","🙍🏽","🙍🏾","🙍🏿","🙍‍♂️","🙍🏻‍♂️","🙍🏼‍♂️","🙍🏽‍♂️","🙍🏾‍♂️","🙍🏿‍♂️","🙍‍♀️","🙍🏻‍♀️","🙍🏼‍♀️","🙍🏽‍♀️","🙍🏾‍♀️","🙍🏿‍♀️","🙎","🙎🏻","🙎🏼","🙎🏽","🙎🏾","🙎🏿","🙎‍♂️","🙎🏻‍♂️","🙎🏼‍♂️","🙎🏽‍♂️","🙎🏾‍♂️","🙎🏿‍♂️","🙎‍♀️","🙎🏻‍♀️","🙎🏼‍♀️","🙎🏽‍♀️","🙎🏾‍♀️","🙎🏿‍♀️","🙅","🙅🏻","🙅🏼","🙅🏽","🙅🏾","🙅🏿","🙅‍♂️","🙅🏻‍♂️","🙅🏼‍♂️","🙅🏽‍♂️","🙅🏾‍♂️","🙅🏿‍♂️","🙅‍♀️","🙅🏻‍♀️","🙅🏼‍♀️","🙅🏽‍♀️","🙅🏾‍♀️","🙅🏿‍♀️","🙆","🙆🏻","🙆🏼","🙆🏽","🙆🏾","🙆🏿","🙆‍♂️","🙆🏻‍♂️","🙆🏼‍♂️","🙆🏽‍♂️","🙆🏾‍♂️","🙆🏿‍♂️","🙆‍♀️","🙆🏻‍♀️","🙆🏼‍♀️","🙆🏽‍♀️","🙆🏾‍♀️","🙆🏿‍♀️","💁","💁🏻","💁🏼","💁🏽","💁🏾","💁🏿","💁‍♂️","💁🏻‍♂️","💁🏼‍♂️","💁🏽‍♂️","💁🏾‍♂️","💁🏿‍♂️","💁‍♀️","💁🏻‍♀️","💁🏼‍♀️","💁🏽‍♀️","💁🏾‍♀️","💁🏿‍♀️","🙋","🙋🏻","🙋🏼","🙋🏽","🙋🏾","🙋🏿","🙋‍♂️","🙋🏻‍♂️","🙋🏼‍♂️","🙋🏽‍♂️","🙋🏾‍♂️","🙋🏿‍♂️","🙋‍♀️","🙋🏻‍♀️","🙋🏼‍♀️","🙋🏽‍♀️","🙋🏾‍♀️","🙋🏿‍♀️","🧏","🧏🏻","🧏🏼","🧏🏽","🧏🏾","🧏🏿","🧏‍♂️","🧏🏻‍♂️","🧏🏼‍♂️","🧏🏽‍♂️","🧏🏾‍♂️","🧏🏿‍♂️","🧏‍♀️","🧏🏻‍♀️","🧏🏼‍♀️","🧏🏽‍♀️","🧏🏾‍♀️","🧏🏿‍♀️","🙇","🙇🏻","🙇🏼","🙇🏽","🙇🏾","🙇🏿","🙇‍♂️","🙇🏻‍♂️","🙇🏼‍♂️","🙇🏽‍♂️","🙇🏾‍♂️","🙇🏿‍♂️","🙇‍♀️","🙇🏻‍♀️","🙇🏼‍♀️","🙇🏽‍♀️","🙇🏾‍♀️","🙇🏿‍♀️","🤦","🤦🏻","🤦🏼","🤦🏽","🤦🏾","🤦🏿","🤦‍♂️","🤦🏻‍♂️","🤦🏼‍♂️","🤦🏽‍♂️","🤦🏾‍♂️","🤦🏿‍♂️","🤦‍♀️","🤦🏻‍♀️","🤦🏼‍♀️","🤦🏽‍♀️","🤦🏾‍♀️","🤦🏿‍♀️","🤷","🤷🏻","🤷🏼","🤷🏽","🤷🏾","🤷🏿","🤷‍♂️","🤷🏻‍♂️","🤷🏼‍♂️","🤷🏽‍♂️","🤷🏾‍♂️","🤷🏿‍♂️","🤷‍♀️","🤷🏻‍♀️","🤷🏼‍♀️","🤷🏽‍♀️","🤷🏾‍♀️","🤷🏿‍♀️","🧑‍⚕️","🧑🏻‍⚕️","🧑🏼‍⚕️","🧑🏽‍⚕️","🧑🏾‍⚕️","🧑🏿‍⚕️","👨‍⚕️","👨🏻‍⚕️","👨🏼‍⚕️","👨🏽‍⚕️","👨🏾‍⚕️","👨🏿‍⚕️","👩‍⚕️","👩🏻‍⚕️","👩🏼‍⚕️","👩🏽‍⚕️","👩🏾‍⚕️","👩🏿‍⚕️","🧑‍🎓","🧑🏻‍🎓","🧑🏼‍🎓","🧑🏽‍🎓","🧑🏾‍🎓","🧑🏿‍🎓","👨‍🎓","👨🏻‍🎓","👨🏼‍🎓","👨🏽‍🎓","👨🏾‍🎓","👨🏿‍🎓","👩‍🎓","👩🏻‍🎓","👩🏼‍🎓","👩🏽‍🎓","👩🏾‍🎓","👩🏿‍🎓","🧑‍🏫","🧑🏻‍🏫","🧑🏼‍🏫","🧑🏽‍🏫","🧑🏾‍🏫","🧑🏿‍🏫","👨‍🏫","👨🏻‍🏫","👨🏼‍🏫","👨🏽‍🏫","👨🏾‍🏫","👨🏿‍🏫","👩‍🏫","👩🏻‍🏫","👩🏼‍🏫","👩🏽‍🏫","👩🏾‍🏫","👩🏿‍🏫","🧑‍⚖️","🧑🏻‍⚖️","🧑🏼‍⚖️","🧑🏽‍⚖️","🧑🏾‍⚖️","🧑🏿‍⚖️","👨‍⚖️","👨🏻‍⚖️","👨🏼‍⚖️","👨🏽‍⚖️","👨🏾‍⚖️","👨🏿‍⚖️","👩‍⚖️","👩🏻‍⚖️","👩🏼‍⚖️","👩🏽‍⚖️","👩🏾‍⚖️","👩🏿‍⚖️","🧑‍🌾","🧑🏻‍🌾","🧑🏼‍🌾","🧑🏽‍🌾","🧑🏾‍🌾","🧑🏿‍🌾","👨‍🌾","👨🏻‍🌾","👨🏼‍🌾","👨🏽‍🌾","👨🏾‍🌾","👨🏿‍🌾","👩‍🌾","👩🏻‍🌾","👩🏼‍🌾","👩🏽‍🌾","👩🏾‍🌾","👩🏿‍🌾","🧑‍🍳","🧑🏻‍🍳","🧑🏼‍🍳","🧑🏽‍🍳","🧑🏾‍🍳","🧑🏿‍🍳","👨‍🍳","👨🏻‍🍳","👨🏼‍🍳","👨🏽‍🍳","👨🏾‍🍳","👨🏿‍🍳","👩‍🍳","👩🏻‍🍳","👩🏼‍🍳","👩🏽‍🍳","👩🏾‍🍳","👩🏿‍🍳","🧑‍🔧","🧑🏻‍🔧","🧑🏼‍🔧","🧑🏽‍🔧","🧑🏾‍🔧","🧑🏿‍🔧","👨‍🔧","👨🏻‍🔧","👨🏼‍🔧","👨🏽‍🔧","👨🏾‍🔧","👨🏿‍🔧","👩‍🔧","👩🏻‍🔧","👩🏼‍🔧","👩🏽‍🔧","👩🏾‍🔧","👩🏿‍🔧","🧑‍🏭","🧑🏻‍🏭","🧑🏼‍🏭","🧑🏽‍🏭","🧑🏾‍🏭","🧑🏿‍🏭","👨‍🏭","👨🏻‍🏭","👨🏼‍🏭","👨🏽‍🏭","👨🏾‍🏭","👨🏿‍🏭","👩‍🏭","👩🏻‍🏭","👩🏼‍🏭","👩🏽‍🏭","👩🏾‍🏭","👩🏿‍🏭","🧑‍💼","🧑🏻‍💼","🧑🏼‍💼","🧑🏽‍💼","🧑🏾‍💼","🧑🏿‍💼","👨‍💼","👨🏻‍💼","👨🏼‍💼","👨🏽‍💼","👨🏾‍💼","👨🏿‍💼","👩‍💼","👩🏻‍💼","👩🏼‍💼","👩🏽‍💼","👩🏾‍💼","👩🏿‍💼","🧑‍🔬","🧑🏻‍🔬","🧑🏼‍🔬","🧑🏽‍🔬","🧑🏾‍🔬","🧑🏿‍🔬","👨‍🔬","👨🏻‍🔬","👨🏼‍🔬","👨🏽‍🔬","👨🏾‍🔬","👨🏿‍🔬","👩‍🔬","👩🏻‍🔬","👩🏼‍🔬","👩🏽‍🔬","👩🏾‍🔬","👩🏿‍🔬","🧑‍💻","🧑🏻‍💻","🧑🏼‍💻","🧑🏽‍💻","🧑🏾‍💻","🧑🏿‍💻","👨‍💻","👨🏻‍💻","👨🏼‍💻","👨🏽‍💻","👨🏾‍💻","👨🏿‍💻","👩‍💻","👩🏻‍💻","👩🏼‍💻","👩🏽‍💻","👩🏾‍💻","👩🏿‍💻","🧑‍🎤","🧑🏻‍🎤","🧑🏼‍🎤","🧑🏽‍🎤","🧑🏾‍🎤","🧑🏿‍🎤","👨‍🎤","👨🏻‍🎤","👨🏼‍🎤","👨🏽‍🎤","👨🏾‍🎤","👨🏿‍🎤","👩‍🎤","👩🏻‍🎤","👩🏼‍🎤","👩🏽‍🎤","👩🏾‍🎤","👩🏿‍🎤","🧑‍🎨","🧑🏻‍🎨","🧑🏼‍🎨","🧑🏽‍🎨","🧑🏾‍🎨","🧑🏿‍🎨","👨‍🎨","👨🏻‍🎨","👨🏼‍🎨","👨🏽‍🎨","👨🏾‍🎨","👨🏿‍🎨","👩‍🎨","👩🏻‍🎨","👩🏼‍🎨","👩🏽‍🎨","👩🏾‍🎨","👩🏿‍🎨","🧑‍✈️","🧑🏻‍✈️","🧑🏼‍✈️","🧑🏽‍✈️","🧑🏾‍✈️","🧑🏿‍✈️","👨‍✈️","👨🏻‍✈️","👨🏼‍✈️","👨🏽‍✈️","👨🏾‍✈️","👨🏿‍✈️","👩‍✈️","👩🏻‍✈️","👩🏼‍✈️","👩🏽‍✈️","👩🏾‍✈️","👩🏿‍✈️","🧑‍🚀","🧑🏻‍🚀","🧑🏼‍🚀","🧑🏽‍🚀","🧑🏾‍🚀","🧑🏿‍🚀","👨‍🚀","👨🏻‍🚀","👨🏼‍🚀","👨🏽‍🚀","👨🏾‍🚀","👨🏿‍🚀","👩‍🚀","👩🏻‍🚀","👩🏼‍🚀","👩🏽‍🚀","👩🏾‍🚀","👩🏿‍🚀","🧑‍🚒","🧑🏻‍🚒","🧑🏼‍🚒","🧑🏽‍🚒","🧑🏾‍🚒","🧑🏿‍🚒","👨‍🚒","👨🏻‍🚒","👨🏼‍🚒","👨🏽‍🚒","👨🏾‍🚒","👨🏿‍🚒","👩‍🚒","👩🏻‍🚒","👩🏼‍🚒","👩🏽‍🚒","👩🏾‍🚒","👩🏿‍🚒","👮","👮🏻","👮🏼","👮🏽","👮🏾","👮🏿","👮‍♂️","👮🏻‍♂️","👮🏼‍♂️","👮🏽‍♂️","👮🏾‍♂️","👮🏿‍♂️","👮‍♀️","👮🏻‍♀️","👮🏼‍♀️","👮🏽‍♀️","👮🏾‍♀️","👮🏿‍♀️","🕵","🕵🏻","🕵🏼","🕵🏽","🕵🏾","🕵🏿","🕵‍♂️","🕵🏻‍♂️","🕵🏼‍♂️","🕵🏽‍♂️","🕵🏾‍♂️","🕵🏿‍♂️","🕵‍♀️","🕵🏻‍♀️","🕵🏼‍♀️","🕵🏽‍♀️","🕵🏾‍♀️","🕵🏿‍♀️","💂","💂🏻","💂🏼","💂🏽","💂🏾","💂🏿","💂‍♂️","💂🏻‍♂️","💂🏼‍♂️","💂🏽‍♂️","💂🏾‍♂️","💂🏿‍♂️","💂‍♀️","💂🏻‍♀️","💂🏼‍♀️","💂🏽‍♀️","💂🏾‍♀️","💂🏿‍♀️","🥷","🥷🏻","🥷🏼","🥷🏽","🥷🏾","🥷🏿","👷","👷🏻","👷🏼","👷🏽","👷🏾","👷🏿","👷‍♂️","👷🏻‍♂️","👷🏼‍♂️","👷🏽‍♂️","👷🏾‍♂️","👷🏿‍♂️","👷‍♀️","👷🏻‍♀️","👷🏼‍♀️","👷🏽‍♀️","👷🏾‍♀️","👷🏿‍♀️","🫅","🫅🏻","🫅🏼","🫅🏽","🫅🏾","🫅🏿","🤴","🤴🏻","🤴🏼","🤴🏽","🤴🏾","🤴🏿","👸","👸🏻","👸🏼","👸🏽","👸🏾","👸🏿","👳","👳🏻","👳🏼","👳🏽","👳🏾","👳🏿","👳‍♂️","👳🏻‍♂️","👳🏼‍♂️","👳🏽‍♂️","👳🏾‍♂️","👳🏿‍♂️","👳‍♀️","👳🏻‍♀️","👳🏼‍♀️","👳🏽‍♀️","👳🏾‍♀️","👳🏿‍♀️","👲","👲🏻","👲🏼","👲🏽","👲🏾","👲🏿","🧕","🧕🏻","🧕🏼","🧕🏽","🧕🏾","🧕🏿","🤵","🤵🏻","🤵🏼","🤵🏽","🤵🏾","🤵🏿","🤵‍♂️","🤵🏻‍♂️","🤵🏼‍♂️","🤵🏽‍♂️","🤵🏾‍♂️","🤵🏿‍♂️","🤵‍♀️","🤵🏻‍♀️","🤵🏼‍♀️","🤵🏽‍♀️","🤵🏾‍♀️","🤵🏿‍♀️","👰","👰🏻","👰🏼","👰🏽","👰🏾","👰🏿","👰‍♂️","👰🏻‍♂️","👰🏼‍♂️","👰🏽‍♂️","👰🏾‍♂️","👰🏿‍♂️","👰‍♀️","👰🏻‍♀️","👰🏼‍♀️","👰🏽‍♀️","👰🏾‍♀️","👰🏿‍♀️","🤰","🤰🏻","🤰🏼","🤰🏽","🤰🏾","🤰🏿","🫃","🫃🏻","🫃🏼","🫃🏽","🫃🏾","🫃🏿","🫄","🫄🏻","🫄🏼","🫄🏽","🫄🏾","🫄🏿","🤱","🤱🏻","🤱🏼","🤱🏽","🤱🏾","🤱🏿","👩‍🍼","👩🏻‍🍼","👩🏼‍🍼","👩🏽‍🍼","👩🏾‍🍼","👩🏿‍🍼","👨‍🍼","👨🏻‍🍼","👨🏼‍🍼","👨🏽‍🍼","👨🏾‍🍼","👨🏿‍🍼","🧑‍🍼","🧑🏻‍🍼","🧑🏼‍🍼","🧑🏽‍🍼","🧑🏾‍🍼","🧑🏿‍🍼","👼","👼🏻","👼🏼","👼🏽","👼🏾","👼🏿","🎅","🎅🏻","🎅🏼","🎅🏽","🎅🏾","🎅🏿","🤶","🤶🏻","🤶🏼","🤶🏽","🤶🏾","🤶🏿","🧑‍🎄","🧑🏻‍🎄","🧑🏼‍🎄","🧑🏽‍🎄","🧑🏾‍🎄","🧑🏿‍🎄","🦸","🦸🏻","🦸🏼","🦸🏽","🦸🏾","🦸🏿","🦸‍♂️","🦸🏻‍♂️","🦸🏼‍♂️","🦸🏽‍♂️","🦸🏾‍♂️","🦸🏿‍♂️","🦸‍♀️","🦸🏻‍♀️","🦸🏼‍♀️","🦸🏽‍♀️","🦸🏾‍♀️","🦸🏿‍♀️","🦹","🦹🏻","🦹🏼","🦹🏽","🦹🏾","🦹🏿","🦹‍♂️","🦹🏻‍♂️","🦹🏼‍♂️","🦹🏽‍♂️","🦹🏾‍♂️","🦹🏿‍♂️","🦹‍♀️","🦹🏻‍♀️","🦹🏼‍♀️","🦹🏽‍♀️","🦹🏾‍♀️","🦹🏿‍♀️","🧙","🧙🏻","🧙🏼","🧙🏽","🧙🏾","🧙🏿","🧙‍♂️","🧙🏻‍♂️","🧙🏼‍♂️","🧙🏽‍♂️","🧙🏾‍♂️","🧙🏿‍♂️","🧙‍♀️","🧙🏻‍♀️","🧙🏼‍♀️","🧙🏽‍♀️","🧙🏾‍♀️","🧙🏿‍♀️","🧚","🧚🏻","🧚🏼","🧚🏽","🧚🏾","🧚🏿","🧚‍♂️","🧚🏻‍♂️","🧚🏼‍♂️","🧚🏽‍♂️","🧚🏾‍♂️","🧚🏿‍♂️","🧚‍♀️","🧚🏻‍♀️","🧚🏼‍♀️","🧚🏽‍♀️","🧚🏾‍♀️","🧚🏿‍♀️","🧛","🧛🏻","🧛🏼","🧛🏽","🧛🏾","🧛🏿","🧛‍♂️","🧛🏻‍♂️","🧛🏼‍♂️","🧛🏽‍♂️","🧛🏾‍♂️","🧛🏿‍♂️","🧛‍♀️","🧛🏻‍♀️","🧛🏼‍♀️","🧛🏽‍♀️","🧛🏾‍♀️","🧛🏿‍♀️","🧜","🧜🏻","🧜🏼","🧜🏽","🧜🏾","🧜🏿","🧜‍♂️","🧜🏻‍♂️","🧜🏼‍♂️","🧜🏽‍♂️","🧜🏾‍♂️","🧜🏿‍♂️","🧜‍♀️","🧜🏻‍♀️","🧜🏼‍♀️","🧜🏽‍♀️","🧜🏾‍♀️","🧜🏿‍♀️","🧝","🧝🏻","🧝🏼","🧝🏽","🧝🏾","🧝🏿","🧝‍♂️","🧝🏻‍♂️","🧝🏼‍♂️","🧝🏽‍♂️","🧝🏾‍♂️","🧝🏿‍♂️","🧝‍♀️","🧝🏻‍♀️","🧝🏼‍♀️","🧝🏽‍♀️","🧝🏾‍♀️","🧝🏿‍♀️","🧞","🧞‍♂️","🧞‍♀️","🧟","🧟‍♂️","🧟‍♀️","🧌","💆","💆🏻","💆🏼","💆🏽","💆🏾","💆🏿","💆‍♂️","💆🏻‍♂️","💆🏼‍♂️","💆🏽‍♂️","💆🏾‍♂️","💆🏿‍♂️","💆‍♀️","💆🏻‍♀️","💆🏼‍♀️","💆🏽‍♀️","💆🏾‍♀️","💆🏿‍♀️","💇","💇🏻","💇🏼","💇🏽","💇🏾","💇🏿","💇‍♂️","💇🏻‍♂️","💇🏼‍♂️","💇🏽‍♂️","💇🏾‍♂️","💇🏿‍♂️","💇‍♀️","💇🏻‍♀️","💇🏼‍♀️","💇🏽‍♀️","💇🏾‍♀️","💇🏿‍♀️","🚶","🚶🏻","🚶🏼","🚶🏽","🚶🏾","🚶🏿","🚶‍♂️","🚶🏻‍♂️","🚶🏼‍♂️","🚶🏽‍♂️","🚶🏾‍♂️","🚶🏿‍♂️","🚶‍♀️","🚶🏻‍♀️","🚶🏼‍♀️","🚶🏽‍♀️","🚶🏾‍♀️","🚶🏿‍♀️","🚶‍➡️","🚶🏻‍➡️","🚶🏼‍➡️","🚶🏽‍➡️","🚶🏾‍➡️","🚶🏿‍➡️","🚶‍♀️‍➡️","🚶🏻‍♀️‍➡️","🚶🏼‍♀️‍➡️","🚶🏽‍♀️‍➡️","🚶🏾‍♀️‍➡️","🚶🏿‍♀️‍➡️","🚶‍♂️‍➡️","🚶🏻‍♂️‍➡️","🚶🏼‍♂️‍➡️","🚶🏽‍♂️‍➡️","🚶🏾‍♂️‍➡️","🚶🏿‍♂️‍➡️","🧍","🧍🏻","🧍🏼","🧍🏽","🧍🏾","🧍🏿","🧍‍♂️","🧍🏻‍♂️","🧍🏼‍♂️","🧍🏽‍♂️","🧍🏾‍♂️","🧍🏿‍♂️","🧍‍♀️","🧍🏻‍♀️","🧍🏼‍♀️","🧍🏽‍♀️","🧍🏾‍♀️","🧍🏿‍♀️","🧎","🧎🏻","🧎🏼","🧎🏽","🧎🏾","🧎🏿","🧎‍♂️","🧎🏻‍♂️","🧎🏼‍♂️","🧎🏽‍♂️","🧎🏾‍♂️","🧎🏿‍♂️","🧎‍♀️","🧎🏻‍♀️","🧎🏼‍♀️","🧎🏽‍♀️","🧎🏾‍♀️","🧎🏿‍♀️","🧎‍➡️","🧎🏻‍➡️","🧎🏼‍➡️","🧎🏽‍➡️","🧎🏾‍➡️","🧎🏿‍➡️","🧎‍♀️‍➡️","🧎🏻‍♀️‍➡️","🧎🏼‍♀️‍➡️","🧎🏽‍♀️‍➡️","🧎🏾‍♀️‍➡️","🧎🏿‍♀️‍➡️","🧎‍♂️‍➡️","🧎🏻‍♂️‍➡️","🧎🏼‍♂️‍➡️","🧎🏽‍♂️‍➡️","🧎🏾‍♂️‍➡️","🧎🏿‍♂️‍➡️","🧑‍🦯","🧑🏻‍🦯","🧑🏼‍🦯","🧑🏽‍🦯","🧑🏾‍🦯","🧑🏿‍🦯","🧑‍🦯‍➡️","🧑🏻‍🦯‍➡️","🧑🏼‍🦯‍➡️","🧑🏽‍🦯‍➡️","🧑🏾‍🦯‍➡️","🧑🏿‍🦯‍➡️","👨‍🦯","👨🏻‍🦯","👨🏼‍🦯","👨🏽‍🦯","👨🏾‍🦯","👨🏿‍🦯","👨‍🦯‍➡️","👨🏻‍🦯‍➡️","👨🏼‍🦯‍➡️","👨🏽‍🦯‍➡️","👨🏾‍🦯‍➡️","👨🏿‍🦯‍➡️","👩‍🦯","👩🏻‍🦯","👩🏼‍🦯","👩🏽‍🦯","👩🏾‍🦯","👩🏿‍🦯","👩‍🦯‍➡️","👩🏻‍🦯‍➡️","👩🏼‍🦯‍➡️","👩🏽‍🦯‍➡️","👩🏾‍🦯‍➡️","👩🏿‍🦯‍➡️","🧑‍🦼","🧑🏻‍🦼","🧑🏼‍🦼","🧑🏽‍🦼","🧑🏾‍🦼","🧑🏿‍🦼","🧑‍🦼‍➡️","🧑🏻‍🦼‍➡️","🧑🏼‍🦼‍➡️","🧑🏽‍🦼‍➡️","🧑🏾‍🦼‍➡️","🧑🏿‍🦼‍➡️","👨‍🦼","👨🏻‍🦼","👨🏼‍🦼","👨🏽‍🦼","👨🏾‍🦼","👨🏿‍🦼","👨‍🦼‍➡️","👨🏻‍🦼‍➡️","👨🏼‍🦼‍➡️","👨🏽‍🦼‍➡️","👨🏾‍🦼‍➡️","👨🏿‍🦼‍➡️","👩‍🦼","👩🏻‍🦼","👩🏼‍🦼","👩🏽‍🦼","👩🏾‍🦼","👩🏿‍🦼","👩‍🦼‍➡️","👩🏻‍🦼‍➡️","👩🏼‍🦼‍➡️","👩🏽‍🦼‍➡️","👩🏾‍🦼‍➡️","👩🏿‍🦼‍➡️","🧑‍🦽","🧑🏻‍🦽","🧑🏼‍🦽","🧑🏽‍🦽","🧑🏾‍🦽","🧑🏿‍🦽","🧑‍🦽‍➡️","🧑🏻‍🦽‍➡️","🧑🏼‍🦽‍➡️","🧑🏽‍🦽‍➡️","🧑🏾‍🦽‍➡️","🧑🏿‍🦽‍➡️","👨‍🦽","👨🏻‍🦽","👨🏼‍🦽","👨🏽‍🦽","👨🏾‍🦽","👨🏿‍🦽","👨‍🦽‍➡️","👨🏻‍🦽‍➡️","👨🏼‍🦽‍➡️","👨🏽‍🦽‍➡️","👨🏾‍🦽‍➡️","👨🏿‍🦽‍➡️","👩‍🦽","👩🏻‍🦽","👩🏼‍🦽","👩🏽‍🦽","👩🏾‍🦽","👩🏿‍🦽","👩‍🦽‍➡️","👩🏻‍🦽‍➡️","👩🏼‍🦽‍➡️","👩🏽‍🦽‍➡️","👩🏾‍🦽‍➡️","👩🏿‍🦽‍➡️","🏃","🏃🏻","🏃🏼","🏃🏽","🏃🏾","🏃🏿","🏃‍♂️","🏃🏻‍♂️","🏃🏼‍♂️","🏃🏽‍♂️","🏃🏾‍♂️","🏃🏿‍♂️","🏃‍♀️","🏃🏻‍♀️","🏃🏼‍♀️","🏃🏽‍♀️","🏃🏾‍♀️","🏃🏿‍♀️","🏃‍➡️","🏃🏻‍➡️","🏃🏼‍➡️","🏃🏽‍➡️","🏃🏾‍➡️","🏃🏿‍➡️","🏃‍♀️‍➡️","🏃🏻‍♀️‍➡️","🏃🏼‍♀️‍➡️","🏃🏽‍♀️‍➡️","🏃🏾‍♀️‍➡️","🏃🏿‍♀️‍➡️","🏃‍♂️‍➡️","🏃🏻‍♂️‍➡️","🏃🏼‍♂️‍➡️","🏃🏽‍♂️‍➡️","🏃🏾‍♂️‍➡️","🏃🏿‍♂️‍➡️","💃","💃🏻","💃🏼","💃🏽","💃🏾","💃🏿","🕺","🕺🏻","🕺🏼","🕺🏽","🕺🏾","🕺🏿","🕴","🕴🏻","🕴🏼","🕴🏽","🕴🏾","🕴🏿","👯","👯‍♂️","👯‍♀️","🧖","🧖🏻","🧖🏼","🧖🏽","🧖🏾","🧖🏿","🧖‍♂️","🧖🏻‍♂️","🧖🏼‍♂️","🧖🏽‍♂️","🧖🏾‍♂️","🧖🏿‍♂️","🧖‍♀️","🧖🏻‍♀️","🧖🏼‍♀️","🧖🏽‍♀️","🧖🏾‍♀️","🧖🏿‍♀️","🧗","🧗🏻","🧗🏼","🧗🏽","🧗🏾","🧗🏿","🧗‍♂️","🧗🏻‍♂️","🧗🏼‍♂️","🧗🏽‍♂️","🧗🏾‍♂️","🧗🏿‍♂️","🧗‍♀️","🧗🏻‍♀️","🧗🏼‍♀️","🧗🏽‍♀️","🧗🏾‍♀️","🧗🏿‍♀️","🤺","🏇","🏇🏻","🏇🏼","🏇🏽","🏇🏾","🏇🏿","⛷","🏂","🏂🏻","🏂🏼","🏂🏽","🏂🏾","🏂🏿","🏌","🏌🏻","🏌🏼","🏌🏽","🏌🏾","🏌🏿","🏌‍♂️","🏌🏻‍♂️","🏌🏼‍♂️","🏌🏽‍♂️","🏌🏾‍♂️","🏌🏿‍♂️","🏌‍♀️","🏌🏻‍♀️","🏌🏼‍♀️","🏌🏽‍♀️","🏌🏾‍♀️","🏌🏿‍♀️","🏄","🏄🏻","🏄🏼","🏄🏽","🏄🏾","🏄🏿","🏄‍♂️","🏄🏻‍♂️","🏄🏼‍♂️","🏄🏽‍♂️","🏄🏾‍♂️","🏄🏿‍♂️","🏄‍♀️","🏄🏻‍♀️","🏄🏼‍♀️","🏄🏽‍♀️","🏄🏾‍♀️","🏄🏿‍♀️","🚣","🚣🏻","🚣🏼","🚣🏽","🚣🏾","🚣🏿","🚣‍♂️","🚣🏻‍♂️","🚣🏼‍♂️","🚣🏽‍♂️","🚣🏾‍♂️","🚣🏿‍♂️","🚣‍♀️","🚣🏻‍♀️","🚣🏼‍♀️","🚣🏽‍♀️","🚣🏾‍♀️","🚣🏿‍♀️","🏊","🏊🏻","🏊🏼","🏊🏽","🏊🏾","🏊🏿","🏊‍♂️","🏊🏻‍♂️","🏊🏼‍♂️","🏊🏽‍♂️","🏊🏾‍♂️","🏊🏿‍♂️","🏊‍♀️","🏊🏻‍♀️","🏊🏼‍♀️","🏊🏽‍♀️","🏊🏾‍♀️","🏊🏿‍♀️","⛹","⛹🏻","⛹🏼","⛹🏽","⛹🏾","⛹🏿","⛹‍♂️","⛹🏻‍♂️","⛹🏼‍♂️","⛹🏽‍♂️","⛹🏾‍♂️","⛹🏿‍♂️","⛹‍♀️","⛹🏻‍♀️","⛹🏼‍♀️","⛹🏽‍♀️","⛹🏾‍♀️","⛹🏿‍♀️","🏋","🏋🏻","🏋🏼","🏋🏽","🏋🏾","🏋🏿","🏋‍♂️","🏋🏻‍♂️","🏋🏼‍♂️","🏋🏽‍♂️","🏋🏾‍♂️","🏋🏿‍♂️","🏋‍♀️","🏋🏻‍♀️","🏋🏼‍♀️","🏋🏽‍♀️","🏋🏾‍♀️","🏋🏿‍♀️","🚴","🚴🏻","🚴🏼","🚴🏽","🚴🏾","🚴🏿","🚴‍♂️","🚴🏻‍♂️","🚴🏼‍♂️","🚴🏽‍♂️","🚴🏾‍♂️","🚴🏿‍♂️","🚴‍♀️","🚴🏻‍♀️","🚴🏼‍♀️","🚴🏽‍♀️","🚴🏾‍♀️","🚴🏿‍♀️","🚵","🚵🏻","🚵🏼","🚵🏽","🚵🏾","🚵🏿","🚵‍♂️","🚵🏻‍♂️","🚵🏼‍♂️","🚵🏽‍♂️","🚵🏾‍♂️","🚵🏿‍♂️","🚵‍♀️","🚵🏻‍♀️","🚵🏼‍♀️","🚵🏽‍♀️","🚵🏾‍♀️","🚵🏿‍♀️","🤸","🤸🏻","🤸🏼","🤸🏽","🤸🏾","🤸🏿","🤸‍♂️","🤸🏻‍♂️","🤸🏼‍♂️","🤸🏽‍♂️","🤸🏾‍♂️","🤸🏿‍♂️","🤸‍♀️","🤸🏻‍♀️","🤸🏼‍♀️","🤸🏽‍♀️","🤸🏾‍♀️","🤸🏿‍♀️","🤼","🤼‍♂️","🤼‍♀️","🤽","🤽🏻","🤽🏼","🤽🏽","🤽🏾","🤽🏿","🤽‍♂️","🤽🏻‍♂️","🤽🏼‍♂️","🤽🏽‍♂️","🤽🏾‍♂️","🤽🏿‍♂️","🤽‍♀️","🤽🏻‍♀️","🤽🏼‍♀️","🤽🏽‍♀️","🤽🏾‍♀️","🤽🏿‍♀️","🤾","🤾🏻","🤾🏼","🤾🏽","🤾🏾","🤾🏿","🤾‍♂️","🤾🏻‍♂️","🤾🏼‍♂️","🤾🏽‍♂️","🤾🏾‍♂️","🤾🏿‍♂️","🤾‍♀️","🤾🏻‍♀️","🤾🏼‍♀️","🤾🏽‍♀️","🤾🏾‍♀️","🤾🏿‍♀️","🤹","🤹🏻","🤹🏼","🤹🏽","🤹🏾","🤹🏿","🤹‍♂️","🤹🏻‍♂️","🤹🏼‍♂️","🤹🏽‍♂️","🤹🏾‍♂️","🤹🏿‍♂️","🤹‍♀️","🤹🏻‍♀️","🤹🏼‍♀️","🤹🏽‍♀️","🤹🏾‍♀️","🤹🏿‍♀️","🧘","🧘🏻","🧘🏼","🧘🏽","🧘🏾","🧘🏿","🧘‍♂️","🧘🏻‍♂️","🧘🏼‍♂️","🧘🏽‍♂️","🧘🏾‍♂️","🧘🏿‍♂️","🧘‍♀️","🧘🏻‍♀️","🧘🏼‍♀️","🧘🏽‍♀️","🧘🏾‍♀️","🧘🏿‍♀️","🛀","🛀🏻","🛀🏼","🛀🏽","🛀🏾","🛀🏿","🛌","🛌🏻","🛌🏼","🛌🏽","🛌🏾","🛌🏿","🧑‍🤝‍🧑","🧑🏻‍🤝‍🧑🏻","🧑🏻‍🤝‍🧑🏼","🧑🏻‍🤝‍🧑🏽","🧑🏻‍🤝‍🧑🏾","🧑🏻‍🤝‍🧑🏿","🧑🏼‍🤝‍🧑🏻","🧑🏼‍🤝‍🧑🏼","🧑🏼‍🤝‍🧑🏽","🧑🏼‍🤝‍🧑🏾","🧑🏼‍🤝‍🧑🏿","🧑🏽‍🤝‍🧑🏻","🧑🏽‍🤝‍🧑🏼","🧑🏽‍🤝‍🧑🏽","🧑🏽‍🤝‍🧑🏾","🧑🏽‍🤝‍🧑🏿","🧑🏾‍🤝‍🧑🏻","🧑🏾‍🤝‍🧑🏼","🧑🏾‍🤝‍🧑🏽","🧑🏾‍🤝‍🧑🏾","🧑🏾‍🤝‍🧑🏿","🧑🏿‍🤝‍🧑🏻","🧑🏿‍🤝‍🧑🏼","🧑🏿‍🤝‍🧑🏽","🧑🏿‍🤝‍🧑🏾","🧑🏿‍🤝‍🧑🏿","👭","👭🏻","👭🏼","👭🏽","👭🏾","👭🏿","👫","👫🏻","👫🏼","👫🏽","👫🏾","👫🏿","👬","👬🏻","👬🏼","👬🏽","👬🏾","👬🏿","💏","💏🏻","💏🏼","💏🏽","💏🏾","💏🏿","👩‍❤️‍💋‍👨","👩🏻‍❤️‍💋‍👨🏻","👩🏻‍❤️‍💋‍👨🏼","👩🏻‍❤️‍💋‍👨🏽","👩🏻‍❤️‍💋‍👨🏾","👩🏻‍❤️‍💋‍👨🏿","👩🏼‍❤️‍💋‍👨🏻","👩🏼‍❤️‍💋‍👨🏼","👩🏼‍❤️‍💋‍👨🏽","👩🏼‍❤️‍💋‍👨🏾","👩🏼‍❤️‍💋‍👨🏿","👩🏽‍❤️‍💋‍👨🏻","👩🏽‍❤️‍💋‍👨🏼","👩🏽‍❤️‍💋‍👨🏽","👩🏽‍❤️‍💋‍👨🏾","👩🏽‍❤️‍💋‍👨🏿","👩🏾‍❤️‍💋‍👨🏻","👩🏾‍❤️‍💋‍👨🏼","👩🏾‍❤️‍💋‍👨🏽","👩🏾‍❤️‍💋‍👨🏾","👩🏾‍❤️‍💋‍👨🏿","👩🏿‍❤️‍💋‍👨🏻","👩🏿‍❤️‍💋‍👨🏼","👩🏿‍❤️‍💋‍👨🏽","👩🏿‍❤️‍💋‍👨🏾","👩🏿‍❤️‍💋‍👨🏿","👨‍❤️‍💋‍👨","👨🏻‍❤️‍💋‍👨🏻","👨🏻‍❤️‍💋‍👨🏼","👨🏻‍❤️‍💋‍👨🏽","👨🏻‍❤️‍💋‍👨🏾","👨🏻‍❤️‍💋‍👨🏿","👨🏼‍❤️‍💋‍👨🏻","👨🏼‍❤️‍💋‍👨🏼","👨🏼‍❤️‍💋‍👨🏽","👨🏼‍❤️‍💋‍👨🏾","👨🏼‍❤️‍💋‍👨🏿","👨🏽‍❤️‍💋‍👨🏻","👨🏽‍❤️‍💋‍👨🏼","👨🏽‍❤️‍💋‍👨🏽","👨🏽‍❤️‍💋‍👨🏾","👨🏽‍❤️‍💋‍👨🏿","👨🏾‍❤️‍💋‍👨🏻","👨🏾‍❤️‍💋‍👨🏼","👨🏾‍❤️‍💋‍👨🏽","👨🏾‍❤️‍💋‍👨🏾","👨🏾‍❤️‍💋‍👨🏿","👨🏿‍❤️‍💋‍👨🏻","👨🏿‍❤️‍💋‍👨🏼","👨🏿‍❤️‍💋‍👨🏽","👨🏿‍❤️‍💋‍👨🏾","👨🏿‍❤️‍💋‍👨🏿","👩‍❤️‍💋‍👩","👩🏻‍❤️‍💋‍👩🏻","👩🏻‍❤️‍💋‍👩🏼","👩🏻‍❤️‍💋‍👩🏽","👩🏻‍❤️‍💋‍👩🏾","👩🏻‍❤️‍💋‍👩🏿","👩🏼‍❤️‍💋‍👩🏻","👩🏼‍❤️‍💋‍👩🏼","👩🏼‍❤️‍💋‍👩🏽","👩🏼‍❤️‍💋‍👩🏾","👩🏼‍❤️‍💋‍👩🏿","👩🏽‍❤️‍💋‍👩🏻","👩🏽‍❤️‍💋‍👩🏼","👩🏽‍❤️‍💋‍👩🏽","👩🏽‍❤️‍💋‍👩🏾","👩🏽‍❤️‍💋‍👩🏿","👩🏾‍❤️‍💋‍👩🏻","👩🏾‍❤️‍💋‍👩🏼","👩🏾‍❤️‍💋‍👩🏽","👩🏾‍❤️‍💋‍👩🏾","👩🏾‍❤️‍💋‍👩🏿","👩🏿‍❤️‍💋‍👩🏻","👩🏿‍❤️‍💋‍👩🏼","👩🏿‍❤️‍💋‍👩🏽","👩🏿‍❤️‍💋‍👩🏾","👩🏿‍❤️‍💋‍👩🏿","💑","💑🏻","💑🏼","💑🏽","💑🏾","💑🏿","👩‍❤️‍👨","👩🏻‍❤️‍👨🏻","👩🏻‍❤️‍👨🏼","👩🏻‍❤️‍👨🏽","👩🏻‍❤️‍👨🏾","👩🏻‍❤️‍👨🏿","👩🏼‍❤️‍👨🏻","👩🏼‍❤️‍👨🏼","👩🏼‍❤️‍👨🏽","👩🏼‍❤️‍👨🏾","👩🏼‍❤️‍👨🏿","👩🏽‍❤️‍👨🏻","👩🏽‍❤️‍👨🏼","👩🏽‍❤️‍👨🏽","👩🏽‍❤️‍👨🏾","👩🏽‍❤️‍👨🏿","👩🏾‍❤️‍👨🏻","👩🏾‍❤️‍👨🏼","👩🏾‍❤️‍👨🏽","👩🏾‍❤️‍👨🏾","👩🏾‍❤️‍👨🏿","👩🏿‍❤️‍👨🏻","👩🏿‍❤️‍👨🏼","👩🏿‍❤️‍👨🏽","👩🏿‍❤️‍👨🏾","👩🏿‍❤️‍👨🏿","👨‍❤️‍👨","👨🏻‍❤️‍👨🏻","👨🏻‍❤️‍👨🏼","👨🏻‍❤️‍👨🏽","👨🏻‍❤️‍👨🏾","👨🏻‍❤️‍👨🏿","👨🏼‍❤️‍👨🏻","👨🏼‍❤️‍👨🏼","👨🏼‍❤️‍👨🏽","👨🏼‍❤️‍👨🏾","👨🏼‍❤️‍👨🏿","👨🏽‍❤️‍👨🏻","👨🏽‍❤️‍👨🏼","👨🏽‍❤️‍👨🏽","👨🏽‍❤️‍👨🏾","👨🏽‍❤️‍👨🏿","👨🏾‍❤️‍👨🏻","👨🏾‍❤️‍👨🏼","👨🏾‍❤️‍👨🏽","👨🏾‍❤️‍👨🏾","👨🏾‍❤️‍👨🏿","👨🏿‍❤️‍👨🏻","👨🏿‍❤️‍👨🏼","👨🏿‍❤️‍👨🏽","👨🏿‍❤️‍👨🏾","👨🏿‍❤️‍👨🏿","👩‍❤️‍👩","👩🏻‍❤️‍👩🏻","👩🏻‍❤️‍👩🏼","👩🏻‍❤️‍👩🏽","👩🏻‍❤️‍👩🏾","👩🏻‍❤️‍👩🏿","👩🏼‍❤️‍👩🏻","👩🏼‍❤️‍👩🏼","👩🏼‍❤️‍👩🏽","👩🏼‍❤️‍👩🏾","👩🏼‍❤️‍👩🏿","👩🏽‍❤️‍👩🏻","👩🏽‍❤️‍👩🏼","👩🏽‍❤️‍👩🏽","👩🏽‍❤️‍👩🏾","👩🏽‍❤️‍👩🏿","👩🏾‍❤️‍👩🏻","👩🏾‍❤️‍👩🏼","👩🏾‍❤️‍👩🏽","👩🏾‍❤️‍👩🏾","👩🏾‍❤️‍👩🏿","👩🏿‍❤️‍👩🏻","👩🏿‍❤️‍👩🏼","👩🏿‍❤️‍👩🏽","👩🏿‍❤️‍👩🏾","👩🏿‍❤️‍👩🏿","👨‍👩‍👦","👨‍👩‍👧","👨‍👩‍👧‍👦","👨‍👩‍👦‍👦","👨‍👩‍👧‍👧","👨‍👨‍👦","👨‍👨‍👧","👨‍👨‍👧‍👦","👨‍👨‍👦‍👦","👨‍👨‍👧‍👧","👩‍👩‍👦","👩‍👩‍👧","👩‍👩‍👧‍👦","👩‍👩‍👦‍👦","👩‍👩‍👧‍👧","👨‍👦","👨‍👦‍👦","👨‍👧","👨‍👧‍👦","👨‍👧‍👧","👩‍👦","👩‍👦‍👦","👩‍👧","👩‍👧‍👦","👩‍👧‍👧","🗣","👤","👥","🫂","👪","🧑‍🧑‍🧒","🧑‍🧑‍🧒‍🧒","🧑‍🧒","🧑‍🧒‍🧒","👣","🫆"]},{"id":"nature","labelKey":"icon_emoji_nature","icon":"🐶","emojis":["🐵","🐒","🦍","🦧","🐶","🐕","🦮","🐕‍🦺","🐩","🐺","🦊","🦝","🐱","🐈","🐈‍⬛","🦁","🐯","🐅","🐆","🐴","🫎","🫏","🐎","🦄","🦓","🦌","🦬","🐮","🐂","🐃","🐄","🐷","🐖","🐗","🐽","🐏","🐑","🐐","🐪","🐫","🦙","🦒","🐘","🦣","🦏","🦛","🐭","🐁","🐀","🐹","🐰","🐇","🐿","🦫","🦔","🦇","🐻","🐻‍❄️","🐨","🐼","🦥","🦦","🦨","🦘","🦡","🐾","🦃","🐔","🐓","🐣","🐤","🐥","🐦","🐧","🕊","🦅","🦆","🦢","🦉","🦤","🪶","🦩","🦚","🦜","🪽","🐦‍⬛","🪿","🐦‍🔥","🐸","🐊","🐢","🦎","🐍","🐲","🐉","🦕","🦖","🐳","🐋","🐬","🦭","🐟","🐠","🐡","🦈","🐙","🐚","🪸","🪼","🦀","🦞","🦐","🦑","🦪","🐌","🦋","🐛","🐜","🐝","🪲","🐞","🦗","🪳","🕷","🕸","🦂","🦟","🪰","🪱","🦠","💐","🌸","💮","🪷","🏵","🌹","🥀","🌺","🌻","🌼","🌷","🪻","🌱","🪴","🌲","🌳","🌴","🌵","🌾","🌿","☘","🍀","🍁","🍂","🍃","🪹","🪺","🍄","🪾"]},{"id":"food","labelKey":"icon_emoji_food","icon":"🍎","emojis":["🍇","🍈","🍉","🍊","🍋","🍋‍🟩","🍌","🍍","🥭","🍎","🍏","🍐","🍑","🍒","🍓","🫐","🥝","🍅","🫒","🥥","🥑","🍆","🥔","🥕","🌽","🌶","🫑","🥒","🥬","🥦","🧄","🧅","🥜","🫘","🌰","🫚","🫛","🍄‍🟫","🫜","🍞","🥐","🥖","🫓","🥨","🥯","🥞","🧇","🧀","🍖","🍗","🥩","🥓","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🫔","🥙","🧆","🥚","🍳","🥘","🍲","🫕","🥣","🥗","🍿","🧈","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤","🍥","🥮","🍡","🥟","🥠","🥡","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🫖","🍵","🍶","🍾","🍷","🍸","🍹","🍺","🍻","🥂","🥃","🫗","🥤","🧋","🧃","🧉","🧊","🥢","🍽","🍴","🥄","🔪","🫙","🏺"]},{"id":"travel","labelKey":"icon_emoji_travel","icon":"✈️","emojis":["🌍","🌎","🌏","🌐","🗺","🗾","🧭","🏔","⛰","🌋","🗻","🏕","🏖","🏜","🏝","🏞","🏟","🏛","🏗","🧱","🪨","🪵","🛖","🏘","🏚","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩","🕋","⛲","⛺","🌁","🌃","🏙","🌄","🌅","🌆","🌇","🌉","♨","🎠","🛝","🎡","🎢","💈","🎪","🚂","🚃","🚄","🚅","🚆","🚇","🚈","🚉","🚊","🚝","🚞","🚋","🚌","🚍","🚎","🚐","🚑","🚒","🚓","🚔","🚕","🚖","🚗","🚘","🚙","🛻","🚚","🚛","🚜","🏎","🏍","🛵","🦽","🦼","🛺","🚲","🛴","🛹","🛼","🚏","🛣","🛤","🛢","⛽","🛞","🚨","🚥","🚦","🛑","🚧","⚓","🛟","⛵","🛶","🚤","🛳","⛴","🛥","🚢","✈","🛩","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰","🚀","🛸","🛎","🧳","⌛","⏳","⌚","⏰","⏱","⏲","🕰","🕛","🕧","🕐","🕜","🕑","🕝","🕒","🕞","🕓","🕟","🕔","🕠","🕕","🕡","🕖","🕢","🕗","🕣","🕘","🕤","🕙","🕥","🕚","🕦","🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘","🌙","🌚","🌛","🌜","🌡","☀","🌝","🌞","🪐","⭐","🌟","🌠","🌌","☁","⛅","⛈","🌤","🌥","🌦","🌧","🌨","🌩","🌪","🌫","🌬","🌀","🌈","🌂","☂","☔","⛱","⚡","❄","☃","⛄","☄","🔥","💧","🌊"]},{"id":"activities","labelKey":"icon_emoji_activities","icon":"⚽","emojis":["🎃","🎄","🎆","🎇","🧨","✨","🎈","🎉","🎊","🎋","🎍","🎎","🎏","🎐","🎑","🧧","🎀","🎁","🎗","🎟","🎫","🎖","🏆","🏅","🥇","🥈","🥉","⚽","⚾","🥎","🏀","🏐","🏈","🏉","🎾","🥏","🎳","🏏","🏑","🏒","🥍","🏓","🏸","🥊","🥋","🥅","⛳","⛸","🎣","🤿","🎽","🎿","🛷","🥌","🎯","🪀","🪁","🔫","🎱","🔮","🪄","🎮","🕹","🎰","🎲","🧩","🧸","🪅","🪩","🪆","♠","♥","♦","♣","♟","🃏","🀄","🎴","🎭","🖼","🎨","🧵","🪡","🧶","🪢"]},{"id":"objects","labelKey":"icon_emoji_objects","icon":"💡","emojis":["👓","🕶","🥽","🥼","🦺","👔","👕","👖","🧣","🧤","🧥","🧦","👗","👘","🥻","🩱","🩲","🩳","👙","👚","🪭","👛","👜","👝","🛍","🎒","🩴","👞","👟","🥾","🥿","👠","👡","🩰","👢","🪮","👑","👒","🎩","🎓","🧢","🪖","⛑","📿","💄","💍","💎","🔇","🔈","🔉","🔊","📢","📣","📯","🔔","🔕","🎼","🎵","🎶","🎙","🎚","🎛","🎤","🎧","📻","🎷","🪗","🎸","🎹","🎺","🎻","🪕","🥁","🪘","🪇","🪈","🪉","📱","📲","☎","📞","📟","📠","🔋","🪫","🔌","💻","🖥","🖨","⌨","🖱","🖲","💽","💾","💿","📀","🧮","🎥","🎞","📽","🎬","📺","📷","📸","📹","📼","🔍","🔎","🕯","💡","🔦","🏮","🪔","📔","📕","📖","📗","📘","📙","📚","📓","📒","📃","📜","📄","📰","🗞","📑","🔖","🏷","💰","🪙","💴","💵","💶","💷","💸","💳","🧾","💹","✉","📧","📨","📩","📤","📥","📦","📫","📪","📬","📭","📮","🗳","✏","✒","🖋","🖊","🖌","🖍","📝","💼","📁","📂","🗂","📅","📆","🗒","🗓","📇","📈","📉","📊","📋","📌","📍","📎","🖇","📏","📐","✂","🗃","🗄","🗑","🔒","🔓","🔏","🔐","🔑","🗝","🔨","🪓","⛏","⚒","🛠","🗡","⚔","💣","🪃","🏹","🛡","🪚","🔧","🪛","🔩","⚙","🗜","⚖","🦯","🔗","⛓️‍💥","⛓","🪝","🧰","🧲","🪜","🪏","⚗","🧪","🧫","🧬","🔬","🔭","📡","💉","🩸","💊","🩹","🩼","🩺","🩻","🚪","🛗","🪞","🪟","🛏","🛋","🪑","🚽","🪠","🚿","🛁","🪤","🪒","🧴","🧷","🧹","🧺","🧻","🪣","🧼","🫧","🪥","🧽","🧯","🛒","🚬","⚰","🪦","⚱","🧿","🪬","🗿","🪧","🪪"]},{"id":"symbols","labelKey":"icon_emoji_symbols","icon":"❤️","emojis":["🏧","🚮","🚰","♿","🚹","🚺","🚻","🚼","🚾","🛂","🛃","🛄","🛅","⚠","🚸","⛔","🚫","🚳","🚭","🚯","🚱","🚷","📵","🔞","☢","☣","⬆","↗","➡","↘","⬇","↙","⬅","↖","↕","↔","↩","↪","⤴","⤵","🔃","🔄","🔙","🔚","🔛","🔜","🔝","🛐","⚛","🕉","✡","☸","☯","✝","☦","☪","☮","🕎","🔯","🪯","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","⛎","🔀","🔁","🔂","▶","⏩","⏭","⏯","◀","⏪","⏮","🔼","⏫","🔽","⏬","⏸","⏹","⏺","⏏","🎦","🔅","🔆","📶","🛜","📳","📴","♀","♂","⚧","✖","➕","➖","➗","🟰","♾","‼","⁉","❓","❔","❕","❗","〰","💱","💲","⚕","♻","⚜","🔱","📛","🔰","⭕","✅","☑","✔","❌","❎","➰","➿","〽","✳","✴","❇","©","®","™","🫟","#️⃣","*️⃣","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔠","🔡","🔢","🔣","🔤","🅰","🆎","🅱","🆑","🆒","🆓","ℹ","🆔","Ⓜ","🆕","🆖","🅾","🆗","🅿","🆘","🆙","🆚","🈁","🈂","🈷","🈶","🈯","🉐","🈹","🈚","🈲","🉑","🈸","🈴","🈳","㊗","㊙","🈺","🈵","🔴","🟠","🟡","🟢","🔵","🟣","🟤","⚫","⚪","🟥","🟧","🟨","🟩","🟦","🟪","🟫","⬛","⬜","◼","◻","◾","◽","▪","▫","🔶","🔷","🔸","🔹","🔺","🔻","💠","🔘","🔳","🔲"]},{"id":"flags","labelKey":"icon_emoji_flags","icon":"🏳️","emojis":["🏁","🚩","🎌","🏴","🏳","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇦🇨","🇦🇩","🇦🇪","🇦🇫","🇦🇬","🇦🇮","🇦🇱","🇦🇲","🇦🇴","🇦🇶","🇦🇷","🇦🇸","🇦🇹","🇦🇺","🇦🇼","🇦🇽","🇦🇿","🇧🇦","🇧🇧","🇧🇩","🇧🇪","🇧🇫","🇧🇬","🇧🇭","🇧🇮","🇧🇯","🇧🇱","🇧🇲","🇧🇳","🇧🇴","🇧🇶","🇧🇷","🇧🇸","🇧🇹","🇧🇻","🇧🇼","🇧🇾","🇧🇿","🇨🇦","🇨🇨","🇨🇩","🇨🇫","🇨🇬","🇨🇭","🇨🇮","🇨🇰","🇨🇱","🇨🇲","🇨🇳","🇨🇴","🇨🇵","🇨🇶","🇨🇷","🇨🇺","🇨🇻","🇨🇼","🇨🇽","🇨🇾","🇨🇿","🇩🇪","🇩🇬","🇩🇯","🇩🇰","🇩🇲","🇩🇴","🇩🇿","🇪🇦","🇪🇨","🇪🇪","🇪🇬","🇪🇭","🇪🇷","🇪🇸","🇪🇹","🇪🇺","🇫🇮","🇫🇯","🇫🇰","🇫🇲","🇫🇴","🇫🇷","🇬🇦","🇬🇧","🇬🇩","🇬🇪","🇬🇫","🇬🇬","🇬🇭","🇬🇮","🇬🇱","🇬🇲","🇬🇳","🇬🇵","🇬🇶","🇬🇷","🇬🇸","🇬🇹","🇬🇺","🇬🇼","🇬🇾","🇭🇰","🇭🇲","🇭🇳","🇭🇷","🇭🇹","🇭🇺","🇮🇨","🇮🇩","🇮🇪","🇮🇱","🇮🇲","🇮🇳","🇮🇴","🇮🇶","🇮🇷","🇮🇸","🇮🇹","🇯🇪","🇯🇲","🇯🇴","🇯🇵","🇰🇪","🇰🇬","🇰🇭","🇰🇮","🇰🇲","🇰🇳","🇰🇵","🇰🇷","🇰🇼","🇰🇾","🇰🇿","🇱🇦","🇱🇧","🇱🇨","🇱🇮","🇱🇰","🇱🇷","🇱🇸","🇱🇹","🇱🇺","🇱🇻","🇱🇾","🇲🇦","🇲🇨","🇲🇩","🇲🇪","🇲🇫","🇲🇬","🇲🇭","🇲🇰","🇲🇱","🇲🇲","🇲🇳","🇲🇴","🇲🇵","🇲🇶","🇲🇷","🇲🇸","🇲🇹","🇲🇺","🇲🇻","🇲🇼","🇲🇽","🇲🇾","🇲🇿","🇳🇦","🇳🇨","🇳🇪","🇳🇫","🇳🇬","🇳🇮","🇳🇱","🇳🇴","🇳🇵","🇳🇷","🇳🇺","🇳🇿","🇴🇲","🇵🇦","🇵🇪","🇵🇫","🇵🇬","🇵🇭","🇵🇰","🇵🇱","🇵🇲","🇵🇳","🇵🇷","🇵🇸","🇵🇹","🇵🇼","🇵🇾","🇶🇦","🇷🇪","🇷🇴","🇷🇸","🇷🇺","🇷🇼","🇸🇦","🇸🇧","🇸🇨","🇸🇩","🇸🇪","🇸🇬","🇸🇭","🇸🇮","🇸🇯","🇸🇰","🇸🇱","🇸🇲","🇸🇳","🇸🇴","🇸🇷","🇸🇸","🇸🇹","🇸🇻","🇸🇽","🇸🇾","🇸🇿","🇹🇦","🇹🇨","🇹🇩","🇹🇫","🇹🇬","🇹🇭","🇹🇯","🇹🇰","🇹🇱","🇹🇲","🇹🇳","🇹🇴","🇹🇷","🇹🇹","🇹🇻","🇹🇼","🇹🇿","🇺🇦","🇺🇬","🇺🇲","🇺🇳","🇺🇸","🇺🇾","🇺🇿","🇻🇦","🇻🇨","🇻🇪","🇻🇬","🇻🇮","🇻🇳","🇻🇺","🇼🇫","🇼🇸","🇽🇰","🇾🇪","🇾🇹","🇿🇦","🇿🇲","🇿🇼","🏴󠁧󠁢󠁥󠁮󠁧󠁿","🏴󠁧󠁢󠁳󠁣󠁴󠁿","🏴󠁧󠁢󠁷󠁬󠁳󠁿"]}]


const emojiPattern = /[\uFE0F\u20E3]|\p{Extended_Pictographic}|\p{Regional_Indicator}/u
const emojiSkinTonePattern = /[\u{1F3FB}-\u{1F3FF}]/gu
const smileysEmojiCategory = emojiCategories.find(function (category) {
  return category.id === 'smileys'
})

if (smileysEmojiCategory && !smileysEmojiCategory.emojis.includes('❤️')) {
  const plainHeartIndex = smileysEmojiCategory.emojis.indexOf('❤')

  if (plainHeartIndex >= 0) {
    smileysEmojiCategory.emojis.splice(plainHeartIndex, 1, '❤️')
  } else {
    smileysEmojiCategory.emojis.push('❤️')
  }
}

const emojiSkinTones = [
  { id: 'default', modifier: '', sample: '🖐️', labelKey: 'icon_skin_default', fallback: 'Default' },
  { id: 'light', modifier: '🏻', sample: '🖐🏻', labelKey: 'icon_skin_light', fallback: 'Light skin tone' },
  { id: 'medium-light', modifier: '🏼', sample: '🖐🏼', labelKey: 'icon_skin_medium_light', fallback: 'Medium-light skin tone' },
  { id: 'medium', modifier: '🏽', sample: '🖐🏽', labelKey: 'icon_skin_medium', fallback: 'Medium skin tone' },
  { id: 'medium-dark', modifier: '🏾', sample: '🖐🏾', labelKey: 'icon_skin_medium_dark', fallback: 'Medium-dark skin tone' },
  { id: 'dark', modifier: '🏿', sample: '🖐🏿', labelKey: 'icon_skin_dark', fallback: 'Dark skin tone' }
]

function getEmojiToneModifier (toneID) {
  const tone = emojiSkinTones.find(function (item) {
    return item.id === toneID
  })

  return tone ? tone.modifier : ''
}

function filterPeopleEmojisByTone (emojis, toneID) {
  const modifier = getEmojiToneModifier(toneID)
  const groups = new Map()

  emojis.forEach(function (emoji) {
    const base = emoji.replace(emojiSkinTonePattern, '')

    if (!groups.has(base)) groups.set(base, [])
    groups.get(base).push(emoji)
  })

  return Array.from(groups.entries()).map(function ([base, variants]) {
    if (!modifier) {
      return variants.find(function (emoji) {
        return !(emoji.match(emojiSkinTonePattern) || []).length
      }) || base
    }

    const matching = variants.find(function (emoji) {
      const tones = emoji.match(emojiSkinTonePattern) || []
      return tones.length > 0 && tones.every(function (tone) {
        return tone === modifier
      })
    })

    return matching || variants.find(function (emoji) {
      return !(emoji.match(emojiSkinTonePattern) || []).length
    }) || base
  }).filter(function (emoji, index, list) {
    return list.indexOf(emoji) === index
  })
}

let materialSymbolsPromise
let MaskIconControl
const brandSourceCache = new Map()
const brandSourcePromiseCache = new Map()

function tr (key, fallback) {
  return t && typeof t[key] === 'string' && t[key] ? t[key] : fallback
}

function getMode (value) {
  if (typeof value !== 'string' || !value) return 'material'
  if (value.startsWith('txt:')) return 'text'
  if (value.startsWith('brand:')) return 'brand'
  if (value.startsWith('svg:')) return 'svg'
  if (emojiPattern.test(value)) return 'emoji'
  return 'material'
}

function getRawValue (value, mode) {
  if (typeof value !== 'string') return ''
  if (mode === 'text') return value.startsWith('txt:') ? value.slice(4) : ''
  if (mode === 'brand') return value.startsWith('brand:') ? value.slice(6) : ''
  if (mode === 'svg') return value.startsWith('svg:') ? value.slice(4) : ''
  if (mode === 'emoji') return getMode(value) === 'emoji' ? value : ''
  return getMode(value) === 'material' ? value : ''
}

function normaliseSvgInput (value) {
  let path = String(value || '').trim().replace(/^\/+/, '')

  path = path.replace(/^(?:uploads|u)\//, '')
  path = path.replace(/^icons\//, '')
  path = path.replace(/\.svg$/i, '')

  return path
}

function getStoredValue (mode, value) {
  if (!value) return ''
  if (mode === 'text') return `txt:${value}`
  if (mode === 'brand') return `brand:${value.trim()}`
  if (mode === 'svg') return `svg:${normaliseSvgInput(value)}`
  if (mode === 'emoji') return value
  return value.trim()
}

function normaliseMaterialCategory (category) {
  if (typeof category === 'number') return materialCategories[category] || null
  if (typeof category !== 'string') return null
  if (/^\d+$/.test(category)) return materialCategories[Number(category)] || null
  if (materialCategories.includes(category)) return category

  const key = category.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')

  return materialCategoryAliases[key] || null
}

function parseGoogleMaterialMetadata (text) {
  const metadata = JSON.parse(text.replace(/^\)\]\}'\s*/, ''))
  const icons = (metadata.icons || []).map(function (icon) {
    return {
      name: icon.name,
      popularity: Number(icon.popularity) || 0,
      categories: Array.isArray(icon.categories)
        ? icon.categories.map(normaliseMaterialCategory).filter(Boolean)
        : []
    }
  }).filter(function (icon) {
    return icon.name
  })

  if (icons.length < 500 || !icons.some(function (icon) { return icon.categories.length })) {
    throw new Error('Material metadata without categories')
  }

  return icons
}

function parseDartMaterialMetadata (text) {
  const icons = []
  const entryPattern = /^\s*"([^"]+)": SymbolsMetadata\(\s*([\s\S]*?)^\s*\),/gm
  let match

  while ((match = entryPattern.exec(text))) {
    const block = match[2]
    const originalNameMatch = block.match(/originalName:\s*"([^"]+)"/)
    const popularityMatch = block.match(/popularity:\s*(\d+)/)
    const categoriesMatch = block.match(/categories:\s*\[([^\]]*)\]/)
    const categoryIndexes = categoriesMatch
      ? categoriesMatch[1].split(',').map(function (value) {
          return Number(value.trim())
        }).filter(Number.isInteger)
      : []

    icons.push({
      name: originalNameMatch ? originalNameMatch[1] : match[1],
      popularity: popularityMatch ? Number(popularityMatch[1]) : 0,
      categories: categoryIndexes.map(function (index) {
        return materialCategories[index]
      }).filter(Boolean)
    })
  }

  if (icons.length < 500) throw new Error('Material mirror could not be parsed')

  return icons
}

function sortMaterialIcons (icons) {
  return icons.sort(function (a, b) {
    return b.popularity - a.popularity || a.name.localeCompare(b.name)
  })
}

function loadMaterialSymbols () {
  if (!materialSymbolsPromise) {
    materialSymbolsPromise = fetch(MATERIAL_SYMBOLS_URL, { cache: 'force-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('Material metadata unavailable')
        return response.text()
      })
      .then(parseGoogleMaterialMetadata)
      .catch(function () {
        return fetch(MATERIAL_SYMBOLS_MIRROR_URL, { cache: 'force-cache' })
          .then(function (response) {
            if (!response.ok) throw new Error('Material mirror unavailable')
            return response.text()
          })
          .then(parseDartMaterialMetadata)
      })
      .catch(function () {
        return fetch(MATERIAL_SYMBOLS_FALLBACK_URL, { cache: 'force-cache' })
          .then(function (response) {
            if (!response.ok) throw new Error(tr('icon_material_load_error', 'Material Symbols could not be loaded.'))
            return response.text()
          })
          .then(function (text) {
            return text.split(/\r?\n/).map(function (line) {
              return line.trim().split(/\s+/)[0]
            }).filter(Boolean).map(function (name) {
              return { name, popularity: 0, categories: [] }
            })
          })
      })
      .then(sortMaterialIcons)
  }

  return materialSymbolsPromise
}

function findMaterialSymbols (icons, query, category, limit) {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '_')
  const exact = []
  const starts = []
  const contains = []
  const browsing = !needle && category !== 'all'

  for (const icon of icons) {
    if (category !== 'all' && !icon.categories.includes(category)) continue

    if (browsing) {
      contains.push(icon.name)
    } else if (icon.name === needle) {
      exact.push(icon.name)
    } else if (icon.name.startsWith(needle)) {
      starts.push(icon.name)
    } else if (needle && icon.name.includes(needle)) {
      contains.push(icon.name)
    }

    if (exact.length + starts.length + contains.length >= limit * 3) break
  }

  return exact.concat(starts, contains).slice(0, limit)
}

function findSansoulBrands (query) {
  const needle = query.trim().toLowerCase()

  if (!needle) return []

  return sansoulBrandIcons.filter(function (name) {
    return name.includes(needle)
  }).map(function (name) {
    return { name, source: 'sansoul' }
  })
}

function getBrandSourcePriority (source) {
  if (source === 'sansoul') return 0
  if (source === 'fa6-brands') return 1
  if (source === 'simple-icons') return 2
  return 99
}

function mergeBrandResults (sansoulResults, externalResults, limit) {
  const byName = new Map()

  for (const result of sansoulResults.concat(externalResults)) {
    if (!result.name) continue

    const current = byName.get(result.name)

    if (!current || getBrandSourcePriority(result.source) < getBrandSourcePriority(current.source)) {
      byName.set(result.name, result)
    }
  }

  return Array.from(byName.values()).slice(0, limit)
}

function isSansoulIcon (kind, name) {
  return (kind === 'brand' ? sansoulBrandIcons : sansoulSvgIcons).includes(name)
}

function resolveBrandSource (name) {
  if (!name) return Promise.resolve(null)
  if (isSansoulIcon('brand', name)) return Promise.resolve('sansoul')
  if (brandSourceCache.has(name)) return Promise.resolve(brandSourceCache.get(name))
  if (brandSourcePromiseCache.has(name)) return brandSourcePromiseCache.get(name)

  const promise = fetch(`${ICONIFY_API}/search?query=${encodeURIComponent(name)}&prefixes=fa6-brands,simple-icons&limit=64`)
    .then(function (response) {
      if (!response.ok) throw new Error(tr('icon_brand_search_error', 'Brands could not be searched.'))
      return response.json()
    })
    .then(function (data) {
      const icons = data.icons || []
      const faName = `fa6-brands:${name}`
      const simpleName = `simple-icons:${name}`
      const source = icons.includes(faName)
        ? 'fa6-brands'
        : icons.includes(simpleName)
          ? 'simple-icons'
          : null

      if (source) brandSourceCache.set(name, source)
      return source
    })
    .catch(function () {
      return null
    })
    .finally(function () {
      brandSourcePromiseCache.delete(name)
    })

  brandSourcePromiseCache.set(name, promise)
  return promise
}

function getSvgPublicRoots (field) {
  const roots = []
  const configured = field && typeof field.get === 'function'
    ? [field.get('svg_public_folder'), field.get('public_folder')]
    : []

  for (const root of configured.concat(['/u', '/uploads'])) {
    if (typeof root !== 'string' || !root || root.includes('{{')) continue

    const normalised = `/${root.replace(/^\/+|\/+$/g, '')}`

    if (!roots.includes(normalised)) roots.push(normalised)
  }

  return roots
}

function normalisePickedSvg (value, publicRoots) {
  if (typeof value !== 'string' || !value || value.startsWith('blob:')) return null

  let path = value.split(/[?#]/)[0]

  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path)

      if (url.origin !== window.location.origin) return null
      path = url.pathname
    } catch (error) {
      return null
    }
  }

  try {
    path = decodeURIComponent(path)
  } catch (error) {
    return null
  }

  path = path.replace(/^\/+/, '')
  if (!/\.svg$/i.test(path)) return null

  const roots = (publicRoots || []).map(function (root) {
    return root.replace(/^\/+|\/+$/g, '')
  }).concat(['uploads', 'u'])

  for (const root of roots) {
    if (!root || !path.startsWith(`${root}/`)) continue

    return normaliseSvgInput(path.slice(root.length + 1)) || null
  }

  return null
}

function getSvgPreviewSources (path, field) {
  const sources = []
  const seen = new Set()

  for (const root of getSvgPublicRoots(field)) {
    const candidates = [
      { url: `${root}/icons/${path}.svg`, preserveColor: false },
      { url: `${root}/${path}.svg`, preserveColor: true }
    ]

    for (const source of candidates) {
      if (seen.has(source.url)) continue
      seen.add(source.url)
      sources.push(source)
    }
  }

  return sources
}

function getSansoulIconUrl (kind, name) {
  const folder = kind === 'brand' ? '/brands' : ''
  return `${SANSOUL_ICON_RAW_BASE}${folder}/${encodeURIComponent(name)}.svg`
}

function getBrandIconUrl (name, source) {
  if (source === 'sansoul') return getSansoulIconUrl('brand', name)
  return `${ICONIFY_API}/${source}/${encodeURIComponent(name)}.svg`
}

function renderIconSources (sources, className) {
  if (!MaskIconControl) return null

  return h(MaskIconControl, {
    sources,
    className: className || ''
  })
}

function renderSansoulIcon (kind, name, className) {
  const preserveColor = (kind === 'svg' && name.startsWith('flag-')) ||
    (kind === 'brand' && name === 'whatsapp-o')

  return renderIconSources([{
    url: getSansoulIconUrl(kind, name),
    preserveColor
  }], className)
}

function renderBrandImage (name, source, className) {
  if (!source) {
    return h('span', {
      className: 'icon-field__icon-placeholder',
      'aria-hidden': 'true'
    })
  }

  return renderIconSources([{
    url: getBrandIconUrl(name, source),
    preserveColor: source === 'sansoul' && name === 'whatsapp-o'
  }], className)
}

function renderSvgImage (path, className, field) {
  return renderIconSources(getSvgPreviewSources(path, field), className)
}


function loadDomIconSource (container, sources, size) {
  let cancelled = false
  let index = 0

  const clear = function () {
    container.replaceChildren()
  }

  const load = function () {
    const source = sources[index]

    if (!source || !source.url || cancelled) return

    const image = new window.Image()

    image.onload = function () {
      if (cancelled) return

      clear()

      if (source.preserveColor) {
        image.alt = ''
        image.setAttribute('aria-hidden', 'true')
        image.style.display = 'block'
        image.style.width = size
        image.style.height = size
        image.style.objectFit = 'contain'
        container.appendChild(image)
        return
      }

      const mask = document.createElement('span')

      mask.setAttribute('aria-hidden', 'true')
      mask.style.display = 'block'
      mask.style.width = size
      mask.style.height = size
      mask.style.backgroundColor = 'var(--sui-button-primary-background-color, var(--sui-primary-accent-color, currentColor))'
      mask.style.webkitMaskImage = `url("${source.url}")`
      mask.style.webkitMaskPosition = 'center'
      mask.style.webkitMaskRepeat = 'no-repeat'
      mask.style.webkitMaskSize = 'contain'
      mask.style.maskImage = `url("${source.url}")`
      mask.style.maskPosition = 'center'
      mask.style.maskRepeat = 'no-repeat'
      mask.style.maskSize = 'contain'
      container.appendChild(mask)
    }

    image.onerror = function () {
      if (cancelled) return
      index += 1
      load()
    }

    image.src = source.url
  }

  load()

  container.addEventListener('Unmount', function () {
    cancelled = true
  }, { once: true })
}

/**
 * Creates a DOM preview for any value accepted by the `icon` custom field.
 * This is shared with RichText editor components so both places resolve
 * Material Symbols, emoji, text, brands and SVGs in exactly the same way.
 */
export function createIconPreviewElement (value = '', options = {}) {
  const icon = typeof value === 'string' ? value : ''
  const size = options.size || '1.25em'
  const field = options.field
  const mode = getMode(icon)
  const rawValue = getRawValue(icon, mode)
  const element = document.createElement('span')

  element.style.display = 'inline-flex'
  element.style.alignItems = 'center'
  element.style.justifyContent = 'center'
  element.style.flex = 'none'
  element.style.lineHeight = '1'
  element.style.verticalAlign = 'middle'

  if (options.className) element.className = options.className
  if (!rawValue) return element

  element.title = icon

  if (mode === 'material') {
    element.textContent = rawValue
    element.style.color = 'var(--sui-button-primary-background-color, var(--sui-primary-accent-color, currentColor))'
    element.style.fontFamily = '"Material Symbols Outlined"'
    element.style.fontWeight = 'normal'
    element.style.fontStyle = 'normal'
    element.style.fontSize = size
    element.style.letterSpacing = 'normal'
    element.style.textTransform = 'none'
    element.style.whiteSpace = 'nowrap'
    element.style.direction = 'ltr'
    element.style.webkitFontFeatureSettings = '"liga"'
    element.style.fontFeatureSettings = '"liga"'
    element.style.webkitFontSmoothing = 'antialiased'
    return element
  }

  if (mode === 'emoji') {
    element.textContent = rawValue
    element.style.fontSize = size
    return element
  }

  if (mode === 'text') {
    element.textContent = rawValue
    element.style.fontFamily = 'var(--sui-heading-font-family, inherit)'
    element.style.fontWeight = '700'
    return element
  }

  if (mode === 'brand') {
    const sources = isSansoulIcon('brand', rawValue)
      ? [{
          url: getSansoulIconUrl('brand', rawValue),
          preserveColor: rawValue === 'whatsapp-o'
        }]
      : [
          { url: getBrandIconUrl(rawValue, 'fa6-brands'), preserveColor: false },
          { url: getBrandIconUrl(rawValue, 'simple-icons'), preserveColor: false }
        ]

    loadDomIconSource(element, sources, size)
    return element
  }

  const sources = isSansoulIcon('svg', rawValue)
    ? [{
        url: getSansoulIconUrl('svg', rawValue),
        preserveColor: rawValue.startsWith('flag-')
      }]
    : getSvgPreviewSources(rawValue, field)

  loadDomIconSource(element, sources, size)
  return element
}

export function initCustomFields () {
  const styles = `
    .icon-field { display: inline-flex; }

    .icon-field--inline {
      display: block;
      width: min(820px, 100%);
    }

    .icon-field__inline {
      display: grid;
      width: 100%;
      overflow: hidden;
      border: 1px solid var(--sui-control-border-color);
      border-radius: calc(var(--sui-control-border-radius) * 1.5);
      background: var(--sui-control-background-color);
      color: var(--sui-control-foreground-color);
    }

    .icon-field__inline .icon-field__dialog-body {
      overflow: visible;
    }

    .icon-field__trigger,
    .icon-field__preview,
    .icon-field__mode,
    .icon-field__pick,
    .icon-field__result,
    .icon-field__close,
    .icon-field__clear,
    .icon-field__category,
    .icon-field__emoji-category,
    .icon-field__emoji-option {
      border: 1px solid var(--sui-control-border-color);
      background: var(--sui-control-background-color);
      color: var(--sui-control-foreground-color);
    }

    .icon-field__trigger {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      overflow: hidden;
      border-radius: var(--sui-control-border-radius);
      padding: 0;
      cursor: pointer;
    }

    .icon-field__trigger:hover,
    .icon-field__trigger:focus-visible,
    .icon-field__mode:hover,
    .icon-field__mode:focus-visible,
    .icon-field__pick:hover,
    .icon-field__pick:focus-visible,
    .icon-field__result:hover,
    .icon-field__result:focus-visible,
    .icon-field__category:hover,
    .icon-field__category:focus-visible,
    .icon-field__emoji-category:hover,
    .icon-field__emoji-category:focus-visible,
    .icon-field__emoji-option:hover,
    .icon-field__emoji-option:focus-visible {
      border-color: var(--sui-primary-accent-color);
    }

    .icon-field__mask,
    .icon-field__native-svg,
    .icon-field__icon-placeholder {
      display: block;
      width: 28px;
      height: 28px;
      flex: none;
    }

    .icon-field__mask {
      background-color: var(--sui-button-primary-background-color, var(--sui-primary-accent-color));
      -webkit-mask-position: center;
      -webkit-mask-repeat: no-repeat;
      -webkit-mask-size: contain;
      mask-position: center;
      mask-repeat: no-repeat;
      mask-size: contain;
    }

    .icon-field__native-svg { object-fit: contain; }
    .icon-field__icon-placeholder { opacity: 0; }

    .icon-field__empty {
      width: 18px;
      height: 18px;
      border: 1px dashed var(--sui-disabled-foreground-color);
      border-radius: 4px;
      opacity: .7;
    }

    .icon-field__overlay {
      width: min(852px, calc(100vw - 32px));
      max-width: none;
      max-height: calc(100vh - 32px);
      margin: auto;
      border: 0;
      padding: 0;
      background: transparent;
      color: inherit;
      overflow: visible;
    }

    .icon-field__overlay::backdrop {
      background: rgb(0 0 0 / .45);
    }

    .icon-field__dialog {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      width: 100%;
      max-height: min(800px, calc(100vh - 32px));
      overflow: hidden;
      border: 1px solid var(--sui-control-border-color);
      border-radius: calc(var(--sui-control-border-radius) * 1.5);
      background: var(--sui-control-background-color);
      color: var(--sui-control-foreground-color);
      box-shadow: 0 24px 80px rgb(0 0 0 / .3);
    }

    .icon-field__dialog-header,
    .icon-field__dialog-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
    }

    .icon-field__dialog-header {
      justify-content: space-between;
      border-bottom: 1px solid var(--sui-control-border-color);
    }

    .icon-field__dialog-footer {
      justify-content: space-between;
      border-top: 1px solid var(--sui-control-border-color);
    }

    .icon-field__dialog-title {
      margin: 0;
      font-size: 15px;
      font-weight: 650;
    }

    .icon-field__dialog-body {
      display: grid;
      align-content: start;
      gap: 12px;
      overflow: auto;
      padding: 14px;
    }

    .icon-field__close,
    .icon-field__clear,
    .icon-field__mode,
    .icon-field__pick,
    .icon-field__category,
    .icon-field__emoji-category,
    .icon-field__emoji-option {
      border-radius: var(--sui-control-border-radius);
      font: inherit;
      cursor: pointer;
    }

    .icon-field__close {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      font-size: 20px;
      line-height: 1;
    }

    .icon-field__clear,
    .icon-field__mode,
    .icon-field__pick { padding: 6px 10px; }

    .icon-field__pick {
      flex: none;
      white-space: nowrap;
    }
    .icon-field__clear { color: var(--sui-error-foreground-color, #b42318); }

    .icon-field__modes,
    .icon-field__categories,
    .icon-field__emoji-categories {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .icon-field__mode[aria-pressed="true"],
    .icon-field__category[aria-pressed="true"],
    .icon-field__emoji-category[aria-pressed="true"] {
      border-color: var(--sui-primary-accent-color);
      box-shadow: inset 0 0 0 1px var(--sui-primary-accent-color);
    }

    .icon-field__category,
    .icon-field__emoji-category {
      padding: 5px 8px;
      font-size: 11px;
      line-height: 1.2;
    }

    .icon-field__emoji-category {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .icon-field__row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .icon-field__input {
      flex: 1;
      min-width: 0;
    }

    .icon-field__preview {
      display: grid;
      place-items: center;
      flex: none;
      width: 42px;
      height: 42px;
      overflow: hidden;
      border-radius: var(--sui-control-border-radius);
      font-size: 24px;
    }

    .icon-field__material {
      color: var(--sui-button-primary-background-color, var(--sui-primary-accent-color));
      font-family: "Material Symbols Outlined";
      font-weight: normal;
      font-style: normal;
      font-size: 27px;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      white-space: nowrap;
      word-wrap: normal;
      direction: ltr;
      -webkit-font-feature-settings: "liga";
      -webkit-font-smoothing: antialiased;
      font-feature-settings: "liga";
    }

    .icon-field__trigger-text,
    .icon-field__text-preview {
      overflow: hidden;
      padding: 0 5px;
      font-family: var(--sui-heading-font-family, inherit);
      font-weight: 700;
      font-size: 11px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .icon-field__text-preview {
      width: auto;
      min-width: 42px;
      max-width: 180px;
      font-size: 14px;
    }

    .icon-field__emoji-preview {
      width: auto;
      min-width: 42px;
      max-width: 180px;
      overflow: hidden;
      padding: 0 6px;
      font-size: 20px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .icon-field__section,
    .icon-field__filters,
    .icon-field__emoji-picker {
      display: grid;
      gap: 7px;
    }

    .icon-field__section-title {
      font-size: 12px;
      font-weight: 650;
    }

    .icon-field__results {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
      gap: 6px;
      max-height: 310px;
      overflow: auto;
    }

    .icon-field__result {
      display: grid;
      place-items: center;
      gap: 5px;
      min-height: 70px;
      padding: 9px 5px;
      border-radius: var(--sui-control-border-radius);
      font: inherit;
      text-align: center;
      cursor: pointer;
    }

    .icon-field__result[aria-pressed="true"],
    .icon-field__emoji-option[aria-pressed="true"] {
      border-color: var(--sui-primary-accent-color);
      box-shadow: inset 0 0 0 1px var(--sui-primary-accent-color);
      background: color-mix(in srgb, var(--sui-primary-accent-color) 12%, var(--sui-control-background-color));
    }

    .icon-field__name {
      overflow: hidden;
      width: 100%;
      font-size: 11px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .icon-field__source,
    .icon-field__help,
    .icon-field__status {
      color: var(--sui-disabled-foreground-color);
      font-size: 12px;
    }

    .icon-field__source { font-size: 10px; }
    .icon-field__error { color: var(--sui-error-foreground-color, #b42318); font-size: 12px; }

    .icon-field__emoji-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
      gap: 5px;
      max-height: 360px;
      overflow: auto;
    }

    .icon-field__emoji-option {
      display: grid;
      place-items: center;
      min-width: 42px;
      min-height: 42px;
      padding: 4px;
      font-size: 24px;
      line-height: 1;
    }

    @media (max-width: 600px) {
      .icon-field__overlay { width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
      .icon-field__dialog { max-height: calc(100vh - 16px); }
      .icon-field__results { grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); }
    }
  `

  if (!document.getElementById('icon-field-styles')) {
    const style = document.createElement('style')

    style.id = 'icon-field-styles'
    style.textContent = styles
    document.head.appendChild(style)
  }

  if (!document.getElementById('material-symbols-font')) {
    const link = document.createElement('link')

    link.id = 'material-symbols-font'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=block'
    document.head.appendChild(link)
  }

  MaskIconControl = createClass({
    getInitialState: function () {
      return { index: 0, ready: false }
    },

    componentDidMount: function () {
      this.loadCurrentSource()
    },

    componentDidUpdate: function (previousProps) {
      const previousSources = JSON.stringify(previousProps.sources || [])
      const currentSources = JSON.stringify(this.props.sources || [])

      if (previousSources !== currentSources) {
        this.setState({ index: 0, ready: false }, this.loadCurrentSource)
      }
    },

    componentWillUnmount: function () {
      this.loadToken = (this.loadToken || 0) + 1
      this.loader = null
    },

    loadCurrentSource: function () {
      const sources = this.props.sources || []
      const source = sources[this.state.index]

      if (!source || !source.url) return

      const token = (this.loadToken || 0) + 1
      const loader = new window.Image()

      this.loadToken = token
      this.loader = loader

      loader.onload = function () {
        if (this.loadToken !== token) return
        this.setState({ ready: true })
      }.bind(this)

      loader.onerror = function () {
        if (this.loadToken !== token) return

        const nextIndex = this.state.index + 1

        if (nextIndex < sources.length) {
          this.setState({ index: nextIndex, ready: false }, this.loadCurrentSource)
        }
      }.bind(this)

      loader.src = source.url
    },

    render: function () {
      const sources = this.props.sources || []
      const source = sources[this.state.index]
      const className = this.props.className || ''

      if (!source || !source.url || !this.state.ready) {
        return h('span', {
          className: `icon-field__icon-placeholder ${className}`.trim(),
          'aria-hidden': 'true'
        })
      }

      if (source.preserveColor) {
        return h('img', {
          className: `icon-field__native-svg ${className}`.trim(),
          src: source.url,
          alt: '',
          'aria-hidden': 'true'
        })
      }

      return h('span', {
        className: `icon-field__mask ${className}`.trim(),
        style: {
          WebkitMaskImage: `url("${source.url}")`,
          maskImage: `url("${source.url}")`
        },
        'aria-hidden': 'true'
      })
    }
  })

  const IconControl = createClass({
    getInitialState: function () {
      const mode = getMode(this.props.value)
      const rawValue = getRawValue(this.props.value, mode)
      const searchable = mode === 'material' || mode === 'brand'

      return {
        open: false,
        mode,
        results: [],
        loading: false,
        error: null,
        searchQuery: searchable ? rawValue : '',
        materialCategory: 'all',
        materialLoading: false,
        emojiCategory: emojiCategories[0].id,
        emojiTone: 'default',
        brandPreviewName: null,
        brandPreviewSource: null
      }
    },

    componentDidMount: function () {
      document.addEventListener('keydown', this.handleDocumentKeyDown)
      this.ensureBrandPreview(this.props.value)

      if (this.isInlinePicker()) {
        if (this.state.mode === 'material') {
          this.ensureMaterialMetadata().then(function () {
            if (this.state.searchQuery.trim().length >= 2 || this.state.materialCategory !== 'all') {
              this.runSearch(this.state.searchQuery)
            }
          }.bind(this))
        } else if (this.state.mode === 'brand' && this.state.searchQuery.trim().length >= 2) {
          this.runSearch(this.state.searchQuery)
        }
      }
    },

    componentDidUpdate: function (previousProps, previousState) {
      if (this.state.open && !previousState.open && this.dialogElement) {
        if (!this.dialogElement.open && typeof this.dialogElement.showModal === 'function') {
          this.dialogElement.showModal()
        }

        if (this.inputElement) {
          window.setTimeout(function () {
            if (this.inputElement && this.state.open) this.inputElement.focus()
          }.bind(this), 0)
        }
      }

      if (previousProps.value !== this.props.value) {
        this.ensureBrandPreview(this.props.value)
      }
    },

    componentWillUnmount: function () {
      clearTimeout(this.searchTimer)
      this.searchToken = (this.searchToken || 0) + 1
      document.removeEventListener('keydown', this.handleDocumentKeyDown)
    },

    isInlinePicker: function () {
      return Boolean(this.props.field && this.props.field.get('no_dialog', false))
    },

    finishSelection: function () {
      if (!this.isInlinePicker()) this.closeModal()
    },

    isValid: function () {
      const value = this.props.value
      const required = this.props.field.get('required', true)

      if (value === undefined || value === null || value === '') {
        return required
          ? { error: { message: tr('icon_required', 'Select or enter an icon.') } }
          : true
      }

      if (typeof value !== 'string') {
        return { error: { message: tr('icon_string_error', 'The icon must be stored as a string.') } }
      }

      if (value.startsWith('txt:')) {
        return value.length > 4 || { error: { message: tr('icon_text_error', 'Add text after txt:.') } }
      }

      if (value.startsWith('brand:')) {
        return /^brand:[a-z0-9][a-z0-9-]*$/.test(value) || {
          error: { message: tr('icon_brand_error', 'Invalid brand. Use brand:icon-name.') }
        }
      }

      if (value.startsWith('svg:')) {
        const path = value.slice(4)
        const validPath = path &&
          !path.startsWith('/') &&
          !path.startsWith('uploads/') &&
          !path.startsWith('u/') &&
          !path.startsWith('icons/') &&
          !/\.svg$/i.test(path) &&
          !/(^|\/)\.\.(\/|$)/.test(path) &&
          !/[\\?#]/.test(path)

        return Boolean(validPath) || {
          error: { message: tr('icon_svg_error', 'Invalid SVG. Use svg:path/without-extension.') }
        }
      }

      if (/^[a-z0-9_]+$/.test(value)) return true
      if (emojiPattern.test(value) && !/[a-zA-Z]/.test(value)) return true

      return {
        error: {
          message: tr('icon_format_error', 'Use a Material Symbol, emoji, txt:, brand: or svg:.')
        }
      }
    },

    ensureBrandPreview: function (value) {
      if (getMode(value) !== 'brand') return

      const name = getRawValue(value, 'brand')

      if (!name) return

      const cached = isSansoulIcon('brand', name)
        ? 'sansoul'
        : brandSourceCache.get(name)

      if (cached) {
        if (this.state.brandPreviewName !== name || this.state.brandPreviewSource !== cached) {
          this.setState({ brandPreviewName: name, brandPreviewSource: cached })
        }
        return
      }

      resolveBrandSource(name).then(function (source) {
        if (getRawValue(this.props.value, 'brand') !== name) return
        this.setState({ brandPreviewName: name, brandPreviewSource: source })
      }.bind(this))
    },

    handleDocumentKeyDown: function (event) {
      if (event.key === 'Escape' && this.state.open) this.closeModal()
    },

    openModal: function () {
      const mode = getMode(this.props.value)
      const rawValue = getRawValue(this.props.value, mode)
      const searchable = mode === 'material' || mode === 'brand'

      this.setState({
        open: true,
        mode,
        results: [],
        loading: false,
        error: null,
        searchQuery: searchable ? rawValue : ''
      }, function () {
        if (mode === 'material') {
          this.ensureMaterialMetadata().then(function () {
            if (this.state.searchQuery.trim().length >= 2 || this.state.materialCategory !== 'all') {
              this.runSearch(this.state.searchQuery)
            }
          }.bind(this))
        } else if (mode === 'brand' && this.state.searchQuery.trim().length >= 2) {
          this.runSearch(this.state.searchQuery)
        }
      })
    },

    closeModal: function () {
      clearTimeout(this.searchTimer)
      this.setState({ open: false })
    },

    handleDialogCancel: function (event) {
      event.preventDefault()
      this.closeModal()
    },

    handleOverlayMouseDown: function (event) {
      if (event.target === event.currentTarget) this.closeModal()
    },

    handleModeChange: function (mode) {
      if (mode === this.state.mode) return

      clearTimeout(this.searchTimer)
      this.searchToken = (this.searchToken || 0) + 1
      this.inputElement = null
      this.setState({
        mode,
        results: [],
        loading: false,
        error: null,
        searchQuery: ''
      }, function () {
        if (mode === 'material') this.ensureMaterialMetadata()
      })
    },

    handleInput: function (event) {
      const rawValue = event.target.value
      const searchable = this.state.mode === 'material' || this.state.mode === 'brand'

      this.props.onChange(getStoredValue(this.state.mode, rawValue))
      this.setState({
        error: null,
        searchQuery: searchable ? rawValue : this.state.searchQuery
      })

      if (searchable) this.queueSearch(rawValue)
    },

    handleInputKeyDown: function (event) {
      if (event.key === 'Enter') {
        event.preventDefault()
        if (!this.isInlinePicker()) this.closeModal()
      }
    },

    handleClear: function () {
      this.props.onChange('')
      this.setState({ results: [], error: null, searchQuery: '' })
    },

    queueSearch: function (query) {
      clearTimeout(this.searchTimer)

      if (this.state.mode !== 'material' && this.state.mode !== 'brand') return

      const canBrowseMaterial = this.state.mode === 'material' && this.state.materialCategory !== 'all'

      if (query.trim().length < 2 && !canBrowseMaterial) {
        this.setState({ results: [], loading: false })
        return
      }

      this.searchTimer = setTimeout(function () {
        this.runSearch(query)
      }.bind(this), 180)
    },

    runSearch: async function (query) {
      const mode = this.state.mode
      const token = (this.searchToken || 0) + 1

      this.searchToken = token
      this.setState({ loading: true, error: null })

      try {
        let results

        if (mode === 'material') {
          const icons = await loadMaterialSymbols()

          results = findMaterialSymbols(
            icons,
            query,
            this.state.materialCategory,
            60
          ).map(function (name) {
            return { name, source: 'material-symbols' }
          })
        } else {
          const url = `${ICONIFY_API}/search?query=${encodeURIComponent(query)}&prefixes=fa6-brands,simple-icons&limit=96`
          const response = await fetch(url)

          if (!response.ok) throw new Error(tr('icon_brand_search_error', 'Brands could not be searched.'))

          const data = await response.json()
          const externalResults = (data.icons || []).map(function (icon) {
            const separator = icon.indexOf(':')

            return {
              source: icon.slice(0, separator),
              name: icon.slice(separator + 1)
            }
          })

          results = mergeBrandResults(findSansoulBrands(query), externalResults, 60)
          results.forEach(function (result) {
            if (result.source) brandSourceCache.set(result.name, result.source)
          })
        }

        if (this.searchToken !== token || this.state.mode !== mode) return
        this.setState({ results, loading: false })
      } catch (error) {
        if (this.searchToken !== token) return

        this.setState({
          results: [],
          loading: false,
          error: error.message || tr('icon_load_error', 'The selector could not be loaded.')
        })
      }
    },

    ensureMaterialMetadata: function () {
      if (this.materialMetadataReady) return Promise.resolve()
      if (this.materialMetadataPromise) return this.materialMetadataPromise

      this.setState({ materialLoading: true })
      this.materialMetadataPromise = loadMaterialSymbols().then(function () {
        this.materialMetadataReady = true
        if (this.state.open || this.isInlinePicker()) this.setState({ materialLoading: false })
      }.bind(this)).catch(function (error) {
        if (this.state.open || this.isInlinePicker()) {
          this.setState({
            materialLoading: false,
            error: error.message || tr('icon_material_load_error', 'Material Symbols could not be loaded.')
          })
        }
      }.bind(this)).finally(function () {
        this.materialMetadataPromise = null
      }.bind(this))

      return this.materialMetadataPromise
    },

    handleMaterialCategoryChange: function (materialCategory) {
      clearTimeout(this.searchTimer)
      this.setState({
        materialCategory,
        results: [],
        error: null
      }, function () {
        if (materialCategory !== 'all' || this.state.searchQuery.trim().length >= 2) {
          this.runSearch(this.state.searchQuery)
        }
      })
    },

    handleEmojiCategoryChange: function (emojiCategory) {
      this.setState({ emojiCategory })
    },

    handleEmojiToneChange: function (emojiTone) {
      this.setState({ emojiTone })
    },

    handleSelect: function (result) {
      if (this.state.mode === 'material') {
        this.props.onChange(result.name)
      } else if (this.state.mode === 'brand') {
        if (result.source) brandSourceCache.set(result.name, result.source)
        this.props.onChange(`brand:${result.name}`)
        this.setState({
          brandPreviewName: result.name,
          brandPreviewSource: result.source || null
        })
      } else if (this.state.mode === 'svg') {
        this.props.onChange(`svg:${result.name}`)
      }

      this.setState({ error: null }, this.finishSelection)
    },

    handleEmojiSelect: function (emoji) {
      const currentValue = getRawValue(this.props.value, 'emoji')

      this.props.onChange(`${currentValue}${emoji}`)
      this.setState({ error: null })
    },

    handlePickSvg: async function () {
      if (typeof this.props.pickFile !== 'function') {
        this.setState({ error: tr('icon_picker_unavailable', 'The file picker is not available here.') })
        return
      }

      try {
        const picked = await this.props.pickFile({
          kind: 'file',
          accept: 'image/svg+xml,.svg',
          multiple: false,
          allowURL: false
        })

        if (!picked) return

        const value = picked.value || ''
        const isSvgValue = /\.svg(?:[?#].*)?$/i.test(value)
        const isSvgFile = picked.file && /image\/svg\+xml/i.test(picked.file.type || '')

        if (!isSvgValue && !isSvgFile) {
          this.setState({ error: tr('icon_svg_only', 'Select an SVG file only.') })
          return
        }

        if (value.startsWith('blob:')) {
          this.setState({
            error: tr('icon_svg_existing', 'The SVG must already exist in uploads/. Save it first, then select it again.')
          })
          return
        }

        const path = normalisePickedSvg(value, getSvgPublicRoots(this.props.field))

        if (!path) {
          this.setState({
            error: tr('icon_svg_uploads', 'Select an existing .svg inside uploads/.')
          })
          return
        }

        this.props.onChange(`svg:${path}`)
        this.setState({ error: null }, this.finishSelection)
      } catch (error) {
        this.setState({
          error: error.message || tr('icon_svg_pick_error', 'The SVG could not be selected.')
        })
      }
    },

    renderValuePreview: function (value, className) {
      const mode = getMode(value)
      const rawValue = getRawValue(value, mode)

      if (!rawValue) {
        return h('span', { className: 'icon-field__empty', 'aria-hidden': 'true' })
      }

      if (mode === 'material') {
        return h('span', { className: 'icon-field__material' }, rawValue)
      }

      if (mode === 'emoji') return h('span', null, rawValue)

      if (mode === 'text') {
        return h('span', {
          className: className || 'icon-field__trigger-text',
          title: rawValue
        }, rawValue)
      }

      if (mode === 'brand') {
        const source = isSansoulIcon('brand', rawValue)
          ? 'sansoul'
          : this.state.brandPreviewName === rawValue
            ? this.state.brandPreviewSource
            : brandSourceCache.get(rawValue)

        return renderBrandImage(rawValue, source, className)
      }

      if (isSansoulIcon('svg', rawValue)) {
        return renderSansoulIcon('svg', rawValue, className)
      }

      return renderSvgImage(rawValue, className, this.props.field)
    },

    renderCurrentModePreview: function (rawValue) {
      if (!rawValue) return h('span', { className: 'icon-field__empty', 'aria-hidden': 'true' })

      if (this.state.mode === 'material') {
        return h('span', { className: 'icon-field__material' }, rawValue)
      }

      if (this.state.mode === 'text') {
        return h('span', { className: 'icon-field__text-preview', title: rawValue }, rawValue)
      }

      if (this.state.mode === 'brand') {
        const exact = this.state.results.find(function (result) {
          return result.name === rawValue
        })
        const source = isSansoulIcon('brand', rawValue)
          ? 'sansoul'
          : exact
            ? exact.source
            : this.state.brandPreviewName === rawValue
              ? this.state.brandPreviewSource
              : brandSourceCache.get(rawValue)

        return renderBrandImage(rawValue, source, '')
      }

      if (this.state.mode === 'svg') {
        if (isSansoulIcon('svg', rawValue)) return renderSansoulIcon('svg', rawValue, '')
        return renderSvgImage(rawValue, '', this.props.field)
      }

      return h('span', null, rawValue)
    },

    renderMaterialFilters: function () {
      if (this.state.mode !== 'material') return null

      const categories = ['all'].concat(materialCategories)

      return h(
        'div',
        { className: 'icon-field__filters' },
        h('span', { className: 'icon-field__section-title' }, tr('icon_category', 'Category')),
        h(
          'div',
          { className: 'icon-field__categories', role: 'group', 'aria-label': tr('icon_material_categories', 'Material Symbols category') },
          categories.map(function (category) {
            return h(
              'button',
              {
                key: category,
                type: 'button',
                className: 'icon-field__category',
                'aria-pressed': this.state.materialCategory === category,
                onClick: function () {
                  this.handleMaterialCategoryChange(category)
                }.bind(this)
              },
              category === 'all' ? 'All' : materialCategoryLabels[category]
            )
          }, this)
        ),
        this.state.materialLoading && h(
          'span',
          { className: 'icon-field__status' },
          tr('icon_material_loading', 'Loading Material Symbols…')
        )
      )
    },

    renderEmojiPicker: function () {
      if (this.state.mode !== 'emoji') return null

      const current = emojiCategories.find(function (category) {
        return category.id === this.state.emojiCategory
      }, this) || emojiCategories[0]
      const currentEmojis = current.id === 'people'
        ? filterPeopleEmojisByTone(current.emojis, this.state.emojiTone)
        : current.emojis
      const currentValue = getRawValue(this.props.value, 'emoji')

      return h(
        'div',
        { className: 'icon-field__emoji-picker' },
        h('span', { className: 'icon-field__section-title' }, tr('icon_category', 'Category')),
        h(
          'div',
          { className: 'icon-field__emoji-categories', role: 'group', 'aria-label': tr('icon_emoji_categories', 'Emoji category') },
          emojiCategories.map(function (category) {
            return h(
              'button',
              {
                key: category.id,
                type: 'button',
                className: 'icon-field__emoji-category',
                'aria-pressed': category.id === this.state.emojiCategory,
                onClick: function () {
                  this.handleEmojiCategoryChange(category.id)
                }.bind(this)
              },
              h('span', { 'aria-hidden': 'true' }, category.icon),
              h('span', null, tr(category.labelKey, category.id))
            )
          }, this)
        ),
        current.id === 'people' && h(
          rf,
          null,
          h('span', { className: 'icon-field__section-title' }, tr('icon_skin_tone', 'Skin tone')),
          h(
            'div',
            { className: 'icon-field__emoji-categories', role: 'group', 'aria-label': tr('icon_skin_tone', 'Skin tone') },
            emojiSkinTones.map(function (tone) {
              const label = tr(tone.labelKey, tone.fallback)

              return h(
                'button',
                {
                  key: tone.id,
                  type: 'button',
                  className: 'icon-field__emoji-category',
                  title: label,
                  'aria-label': label,
                  'aria-pressed': tone.id === this.state.emojiTone,
                  onClick: function () {
                    this.handleEmojiToneChange(tone.id)
                  }.bind(this)
                },
                h('span', { 'aria-hidden': 'true' }, tone.sample)
              )
            }, this)
          )
        ),
        h(
          'div',
          { className: 'icon-field__emoji-grid' },
          currentEmojis.map(function (emoji, index) {
            return h(
              'button',
              {
                key: `${current.id}:${index}`,
                type: 'button',
                className: 'icon-field__emoji-option',
                title: emoji,
                'aria-pressed': Boolean(currentValue && currentValue.includes(emoji)),
                onClick: function () {
                  this.handleEmojiSelect(emoji)
                }.bind(this)
              },
              emoji
            )
          }, this)
        )
      )
    },

    renderSansoulSvgOptions: function (rawValue) {
      if (this.state.mode !== 'svg') return null

      return h(
        'div',
        { className: 'icon-field__section' },
        h('div', { className: 'icon-field__section-title' }, tr('icon_other_svg', 'Other SVG')),
        h(
          'div',
          { className: 'icon-field__results' },
          sansoulSvgIcons.map(function (name) {
            return h(
              'button',
              {
                key: `sansoul:svg:${name}`,
                type: 'button',
                className: 'icon-field__result',
                title: name,
                'aria-pressed': name === rawValue,
                onClick: function () {
                  this.handleSelect({ name, source: 'sansoul' })
                }.bind(this)
              },
              renderSansoulIcon('svg', name, ''),
              h('span', { className: 'icon-field__name' }, name)
            )
          }, this)
        )
      )
    },

    renderResults: function (rawValue) {
      if (this.state.mode !== 'material' && this.state.mode !== 'brand') return null

      if (this.state.loading) {
        return h('div', { className: 'icon-field__status' }, tr('icon_searching', 'Searching…'))
      }

      if (!this.state.results.length) {
        const browsingMaterial = this.state.mode === 'material' && this.state.materialCategory !== 'all'
        const hasQuery = this.state.searchQuery.trim().length >= 2

        return hasQuery || browsingMaterial
          ? h('div', { className: 'icon-field__status' }, tr('icon_no_results', 'No results.'))
          : h('div', { className: 'icon-field__help' }, tr('icon_search_help', 'Type at least 2 characters to search or choose a category.'))
      }

      return h(
        'div',
        { className: 'icon-field__results' },
        this.state.results.map(function (result) {
          const sourceLabel = result.source === 'fa6-brands'
            ? 'Font Awesome'
            : result.source === 'simple-icons'
              ? 'Simple Icons'
              : result.source === 'sansoul'
                ? 'SanSoul'
                : null

          return h(
            'button',
            {
              key: `${result.source}:${result.name}`,
              type: 'button',
              className: 'icon-field__result',
              title: result.name,
              'aria-pressed': result.name === rawValue,
              onClick: function () {
                this.handleSelect(result)
              }.bind(this)
            },
            this.state.mode === 'material'
              ? h('span', { className: 'icon-field__material' }, result.name)
              : renderBrandImage(result.name, result.source, ''),
            h('span', { className: 'icon-field__name' }, result.name),
            sourceLabel && h('span', { className: 'icon-field__source' }, sourceLabel)
          )
        }, this)
      )
    },

    renderInputRow: function (rawValue) {
      const searchable = this.state.mode === 'material' || this.state.mode === 'brand'
      const inputValue = searchable ? this.state.searchQuery : rawValue
      const inputPlaceholder = {
        material: tr('icon_placeholder_material', 'e.g. check, arrow_forward'),
        emoji: tr('icon_placeholder_emoji', 'e.g. ❤️✨'),
        text: tr('icon_placeholder_text', 'e.g. hello'),
        brand: tr('icon_placeholder_brand', 'e.g. whatsapp'),
        svg: tr('icon_placeholder_svg', 'e.g. base/logo')
      }[this.state.mode]

      return h(
        'div',
        { className: 'icon-field__row' },
        h('input', {
          ref: function (node) {
            this.inputElement = node
          }.bind(this),
          className: `icon-field__input ${this.props.classNameWrapper || ''}`,
          type: 'text',
          value: inputValue,
          placeholder: inputPlaceholder,
          onChange: this.handleInput,
          onKeyDown: this.handleInputKeyDown,
          autoComplete: 'off',
          spellCheck: false
        }),
        this.state.mode === 'svg' && h(
          'button',
          {
            type: 'button',
            className: 'icon-field__pick',
            onClick: this.handlePickSvg
          },
          tr('icon_choose_svg', 'Choose SVG')
        ),
        h(
          'div',
          {
            className: `icon-field__preview${this.state.mode === 'text' ? ' icon-field__text-preview' : ''}${this.state.mode === 'emoji' ? ' icon-field__emoji-preview' : ''}`,
            title: this.props.value || ''
          },
          this.renderCurrentModePreview(rawValue)
        )
      )
    },

    renderPickerBody: function (rawValue) {
      return h(
        'div',
        { className: 'icon-field__dialog-body' },
        h(
          'div',
          { className: 'icon-field__modes', role: 'group', 'aria-label': 'Icon type' },
          modes.map(function (mode) {
            return h(
              'button',
              {
                key: mode.id,
                type: 'button',
                className: 'icon-field__mode',
                'aria-pressed': this.state.mode === mode.id,
                onClick: function () {
                  this.handleModeChange(mode.id)
                }.bind(this)
              },
              mode.label
            )
          }, this)
        ),
        this.renderInputRow(rawValue),
        this.renderMaterialFilters(),
        this.state.mode !== 'emoji' && h(
          'div',
          { className: 'icon-field__help' },
          this.props.value || tr('icon_no_value', 'No value')
        ),
        this.state.error && h('div', { className: 'icon-field__error' }, this.state.error),
        this.renderEmojiPicker(),
        this.renderSansoulSvgOptions(rawValue),
        this.renderResults(rawValue)
      )
    },

    renderInlinePicker: function () {
      const rawValue = getRawValue(this.props.value, this.state.mode)

      return h(
        'div',
        { className: 'icon-field__inline' },
        this.renderPickerBody(rawValue),
        this.props.value && h(
          'div',
          { className: 'icon-field__dialog-footer' },
          h('button', {
            type: 'button',
            className: 'icon-field__clear',
            onClick: this.handleClear
          }, tr('icon_remove', 'Remove icon'))
        )
      )
    },

    renderDialog: function () {
      if (!this.state.open) return null

      const rawValue = getRawValue(this.props.value, this.state.mode)

      return h(
        'dialog',
        {
          ref: function (node) {
            this.dialogElement = node
          }.bind(this),
          className: 'icon-field__overlay',
          onCancel: this.handleDialogCancel,
          onMouseDown: this.handleOverlayMouseDown
        },
        h(
          'div',
          {
            className: 'icon-field__dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': `${this.props.forID}-dialog-title`,
            onMouseDown: function (event) {
              event.stopPropagation()
            }
          },
          h(
            'div',
            { className: 'icon-field__dialog-header' },
            h('h3', {
              id: `${this.props.forID}-dialog-title`,
              className: 'icon-field__dialog-title'
            }, tr('icon_select', 'Select icon')),
            h('button', {
              type: 'button',
              className: 'icon-field__close',
              title: tr('icon_close', 'Close'),
              'aria-label': tr('icon_close', 'Close'),
              onClick: this.closeModal
            }, '×')
          ),
          this.renderPickerBody(rawValue),
          h(
            'div',
            { className: 'icon-field__dialog-footer' },
            this.props.value
              ? h('button', {
                  type: 'button',
                  className: 'icon-field__clear',
                  onClick: this.handleClear
                }, tr('icon_remove', 'Remove icon'))
              : h('span'),
            h('button', {
              type: 'button',
              className: 'icon-field__mode',
              onClick: this.closeModal
            }, tr('icon_close', 'Close'))
          )
        )
      )
    },

    render: function () {
      if (this.isInlinePicker()) {
        return h(
          'div',
          { id: this.props.forID, className: 'icon-field icon-field--inline' },
          this.renderInlinePicker()
        )
      }

      return h(
        'div',
        { className: 'icon-field' },
        h(
          'button',
          {
            id: this.props.forID,
            type: 'button',
            className: 'icon-field__trigger',
            title: this.props.value || tr('icon_select', 'Select icon'),
            'aria-haspopup': 'dialog',
            'aria-expanded': this.state.open,
            onClick: this.openModal
          },
          this.renderValuePreview(this.props.value)
        ),
        this.renderDialog()
      )
    }
  })

  const iconFieldSchema = {
    properties: {
      no_dialog: { type: 'boolean' }
    }
  }

  CMS.registerFieldType('icon', IconControl, undefined, iconFieldSchema)
}
