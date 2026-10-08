import { handleOrderStatus } from '../../../../themes/sansoul/commerce/status.js'

export async function onRequest (context) {
  return handleOrderStatus(context.request, context.env)
}
