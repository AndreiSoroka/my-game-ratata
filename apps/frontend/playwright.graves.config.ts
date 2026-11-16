import process from 'node:process'

import { createAppPlaywrightConfig } from './playwright.app'

const viewport = process.env.E2E_GRAVE_VIEWPORT
if (viewport !== undefined && viewport !== 'desktop' && viewport !== 'mobile') {
    throw new Error(`Invalid E2E_GRAVE_VIEWPORT: ${viewport}`)
}

// The canonical script invokes each viewport separately, preserving both reports.
export default createAppPlaywrightConfig({
    graveOnly: true,
    portOffset: 1,
    ...(viewport === undefined ? {} : { graveViewport: viewport }),
})
