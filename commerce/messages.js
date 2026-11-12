// Engine texts for commerce emails and the payment page, by language. The theme's
// six languages are covered; anything else falls back to English. Projects change
// wording with `order_notices.templates` (data/commerce.yml), not here.
// es and en must stay byte-identical to 14.3.x (golden test).
export const LOCALES = Object.freeze(['es', 'en', 'de', 'fr', 'it', 'pt'])

export function supportedLocale (value) {
  return typeof value === 'string' && LOCALES.includes(value) ? value : null
}

const BUYER = Object.freeze({
  es: {
    subject: site => `Hemos recibido tu pedido · ${site}`,
    greeting: name => name ? `Hola ${name},` : 'Hola,',
    intro: 'Gracias por tu compra. Hemos recibido el pago de tu pedido.',
    items: 'Resumen del pedido:',
    shipping: 'Envío',
    subtotal: 'Subtotal',
    tax: 'IVA',
    taxIncluded: 'IVA incluido',
    name: 'Nombre',
    address: 'Dirección',
    phone: 'Teléfono',
    notes: 'Indicaciones',
    colItem: 'Artículo',
    colQty: 'Cant.',
    colPrice: 'Precio',
    total: 'Total',
    destination: 'Dirección de envío:',
    invoice: 'Adjuntamos la factura en PDF.',
    reply: 'Si necesitas algo, responde a este correo.',
    invoiceSubject: site => `Tu factura · ${site}`,
    invoiceIntro: 'Adjuntamos la factura de tu pedido en PDF.',
    shippedSubject: site => `Tu pedido está en camino · ${site}`,
    shippedIntro: 'Hemos enviado tu pedido.',
    tracking: 'Seguimiento'
  },
  en: {
    subject: site => `We received your order · ${site}`,
    greeting: name => name ? `Hello ${name},` : 'Hello,',
    intro: 'Thank you for your purchase. We have received the payment for your order.',
    items: 'Order summary:',
    shipping: 'Shipping',
    subtotal: 'Subtotal',
    tax: 'VAT',
    taxIncluded: 'VAT included',
    name: 'Name',
    address: 'Address',
    phone: 'Phone',
    notes: 'Delivery notes',
    colItem: 'Item',
    colQty: 'Qty',
    colPrice: 'Price',
    total: 'Total',
    destination: 'Shipping address:',
    invoice: 'The invoice is attached as a PDF.',
    reply: 'If you need anything, reply to this email.',
    invoiceSubject: site => `Your invoice · ${site}`,
    invoiceIntro: 'The invoice for your order is attached as a PDF.',
    shippedSubject: site => `Your order is on its way · ${site}`,
    shippedIntro: 'We have shipped your order.',
    tracking: 'Tracking'
  },
  de: {
    subject: site => `Wir haben deine Bestellung erhalten · ${site}`,
    greeting: name => name ? `Hallo ${name},` : 'Hallo,',
    intro: 'Danke für deinen Einkauf. Wir haben die Zahlung für deine Bestellung erhalten.',
    items: 'Bestellübersicht:',
    shipping: 'Versand',
    subtotal: 'Zwischensumme',
    tax: 'MwSt.',
    taxIncluded: 'inkl. MwSt.',
    name: 'Name',
    address: 'Adresse',
    phone: 'Telefon',
    notes: 'Lieferhinweise',
    colItem: 'Artikel',
    colQty: 'Menge',
    colPrice: 'Preis',
    total: 'Gesamt',
    destination: 'Lieferadresse:',
    invoice: 'Die Rechnung liegt als PDF bei.',
    reply: 'Wenn du etwas brauchst, antworte einfach auf diese E-Mail.',
    invoiceSubject: site => `Deine Rechnung · ${site}`,
    invoiceIntro: 'Die Rechnung zu deiner Bestellung liegt als PDF bei.',
    shippedSubject: site => `Deine Bestellung ist unterwegs · ${site}`,
    shippedIntro: 'Wir haben deine Bestellung verschickt.',
    tracking: 'Sendungsverfolgung'
  },
  fr: {
    subject: site => `Nous avons reçu votre commande · ${site}`,
    greeting: name => name ? `Bonjour ${name},` : 'Bonjour,',
    intro: 'Merci pour votre achat. Nous avons bien reçu le paiement de votre commande.',
    items: 'Récapitulatif de la commande :',
    shipping: 'Livraison',
    subtotal: 'Sous-total',
    tax: 'TVA',
    taxIncluded: 'TVA incluse',
    name: 'Nom',
    address: 'Adresse',
    phone: 'Téléphone',
    notes: 'Instructions de livraison',
    colItem: 'Article',
    colQty: 'Qté',
    colPrice: 'Prix',
    total: 'Total',
    destination: 'Adresse de livraison :',
    invoice: 'La facture est jointe en PDF.',
    reply: 'Pour toute question, répondez à cet e-mail.',
    invoiceSubject: site => `Votre facture · ${site}`,
    invoiceIntro: 'La facture de votre commande est jointe en PDF.',
    shippedSubject: site => `Votre commande est en route · ${site}`,
    shippedIntro: 'Nous avons expédié votre commande.',
    tracking: 'Suivi'
  },
  it: {
    subject: site => `Abbiamo ricevuto il tuo ordine · ${site}`,
    greeting: name => name ? `Ciao ${name},` : 'Ciao,',
    intro: 'Grazie per il tuo acquisto. Abbiamo ricevuto il pagamento del tuo ordine.',
    items: 'Riepilogo dell’ordine:',
    shipping: 'Spedizione',
    subtotal: 'Subtotale',
    tax: 'IVA',
    taxIncluded: 'IVA inclusa',
    name: 'Nome',
    address: 'Indirizzo',
    phone: 'Telefono',
    notes: 'Indicazioni per la consegna',
    colItem: 'Articolo',
    colQty: 'Qtà',
    colPrice: 'Prezzo',
    total: 'Totale',
    destination: 'Indirizzo di spedizione:',
    invoice: 'In allegato la fattura in PDF.',
    reply: 'Se hai bisogno di qualcosa, rispondi a questa email.',
    invoiceSubject: site => `La tua fattura · ${site}`,
    invoiceIntro: 'In allegato la fattura del tuo ordine in PDF.',
    shippedSubject: site => `Il tuo ordine è in viaggio · ${site}`,
    shippedIntro: 'Abbiamo spedito il tuo ordine.',
    tracking: 'Tracciamento'
  },
  pt: {
    subject: site => `Recebemos a tua encomenda · ${site}`,
    greeting: name => name ? `Olá ${name},` : 'Olá,',
    intro: 'Obrigado pela tua compra. Recebemos o pagamento da tua encomenda.',
    items: 'Resumo da encomenda:',
    shipping: 'Envio',
    subtotal: 'Subtotal',
    tax: 'IVA',
    taxIncluded: 'IVA incluído',
    name: 'Nome',
    address: 'Morada',
    phone: 'Telefone',
    notes: 'Indicações para a entrega',
    colItem: 'Artigo',
    colQty: 'Qtd.',
    colPrice: 'Preço',
    total: 'Total',
    destination: 'Morada de envio:',
    invoice: 'Enviamos a fatura em PDF em anexo.',
    reply: 'Se precisares de alguma coisa, responde a este e-mail.',
    invoiceSubject: site => `A tua fatura · ${site}`,
    invoiceIntro: 'Enviamos em anexo a fatura da tua encomenda em PDF.',
    shippedSubject: site => `A tua encomenda está a caminho · ${site}`,
    shippedIntro: 'Enviámos a tua encomenda.',
    tracking: 'Seguimento'
  }
})

export function buyerText (language) {
  return BUYER[language] || BUYER.en
}

// Labels the engine sends to Stripe Checkout (tax line, shipping rate, custom fields).
const PAYMENT_PAGE = Object.freeze({
  es: { tax: 'IVA', shipping: 'Envío', recipientPhone: 'Teléfono de quien recibe (si no eres tú)', deliveryNotes: 'Indicaciones para el repartidor' },
  en: { tax: 'VAT', shipping: 'Shipping', recipientPhone: 'Recipient phone (if not you)', deliveryNotes: 'Notes for the courier' },
  de: { tax: 'MwSt.', shipping: 'Versand', recipientPhone: 'Telefon des Empfängers (falls nicht du)', deliveryNotes: 'Hinweise für den Zusteller' },
  fr: { tax: 'TVA', shipping: 'Livraison', recipientPhone: 'Téléphone du destinataire (si ce n’est pas vous)', deliveryNotes: 'Instructions pour le livreur' },
  it: { tax: 'IVA', shipping: 'Spedizione', recipientPhone: 'Telefono di chi riceve (se non sei tu)', deliveryNotes: 'Indicazioni per il corriere' },
  pt: { tax: 'IVA', shipping: 'Envio', recipientPhone: 'Telefone de quem recebe (se não fores tu)', deliveryNotes: 'Indicações para o estafeta' }
})

export function paymentPageText (language) {
  return PAYMENT_PAGE[language] || PAYMENT_PAGE.en
}
