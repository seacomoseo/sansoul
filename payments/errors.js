// HTTP-shaped error shared by the payment layer and its consumers: `code` is safe to
// return to clients, `status` is the response status. CommerceError extends it.
export class PaymentError extends Error {
  constructor (code, status = 400) {
    super(code)
    this.code = code
    this.status = status
  }
}
