/* eslint-disable */
import { netlify } from '@params'
if (netlify)  import('./netlify-identity').then(m => m.initNetlifyIdentity())
CMS.init()
              import('./custom-widgets')  .then(m => m.initCustomWidgets()  )
if (false)    import('./pre-save')        .then(m => m.initPreSave()        )
              import('./nav-links')       .then(m => m.initNavLinks()       )
              import('./icons')           .then(m => m.initIcons()          )
              import('./hashchange')      .then(m => m.initHashChange()     )
