export function slugify (text) {
  text = text.toString().toLowerCase().trim()

  const sets = [
    { to: 'a', from: '[ÀÁÂÃÄÅÆĀĂĄẠẢẤẦẨẪẬẮẰẲẴẶἀ]' },
    { to: 'c', from: '[ÇĆĈČ]' },
    { to: 'e', from: '[ÈÉÊËĒĔĖĘĚẸẺẼẾỀỂỄỆ]' },
    { to: 'i', from: '[ÌÍÎÏĨĪĮİỈỊ]' },
    { to: 'n', from: '[ÑŃŅŇ]' },
    { to: 'o', from: '[ÒÓÔÕÖØŌŎŐỌỎỐỒỔỖỘỚỜỞỠỢǪǬƠ]' },
    { to: 'u', from: '[ÙÚÛÜŨŪŬŮŰŲỤỦỨỪỬỮỰƯ]' },
    { to: '-', from: '[·/_,:;\']' }
  ]

  sets.forEach(set => {
    text = text.replace(new RegExp(set.from, 'gi'), set.to)
  })

  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-')
}
