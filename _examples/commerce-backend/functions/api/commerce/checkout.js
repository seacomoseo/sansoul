import { catalog } from '../../_commerce/catalog.generated.js'
import { handleCheckout } from '../../../themes/sansoul/commerce/checkout.js'

export async function onRequest (context) {
  return handleCheckout(context.request, context.env, catalog)
}
