import { local } from '@params'
import { initDeployStatus } from './deploy-status'
import { initCustomWidgets } from './custom-widgets'
import { initPreSave } from './pre-save'
import { initNavLinks } from './nav-links'
import { initNetlifyIdentity } from './netlify-identity'

if (!local) initDeployStatus()
// eslint-disable-next-line
CMS.init()
initCustomWidgets()
initPreSave()
initNavLinks()
if (local) initNetlifyIdentity()
