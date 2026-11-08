// `retry`: nothing was delivered, try later. `ambiguous`: the provider may have
// accepted it, so hold for a human (never resend automatically). `hold`: keep
// the job durable without effects. `fatal`: will not succeed as configured.
export class DeliveryError extends Error {
  constructor (code, kind) {
    super(code)
    this.code = code
    this.kind = kind
  }
}
