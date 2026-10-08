import { catalog } from '../../../_commerce/catalog.generated.js'
import { handleAdmin } from '../../../../themes/sansoul/commerce/admin.js'

export async function onRequest (context) {
  return handleAdmin(context.request, context.env, catalog)
}
