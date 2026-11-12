// Which consumer a payment belongs to. Every Checkout Session and PaymentIntent the
// engine creates carries metadata[purpose]; sessions created before 14.4 have none
// and belong to commerce. Future consumers (forms with payment, bookings, access to
// content) register their own purpose; the payment never decides the business.
export const PURPOSES = Object.freeze(['order'])

export function paymentPurpose (object) {
  const purpose = object?.metadata?.purpose
  return typeof purpose === 'string' && purpose ? purpose : 'order'
}
