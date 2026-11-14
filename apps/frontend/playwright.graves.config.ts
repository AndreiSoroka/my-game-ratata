import { createAppPlaywrightConfig } from './playwright.app'

// Ordinary commands, fresh process: earlier deaths and source age cannot alter this scenario.
export default createAppPlaywrightConfig({ graveOnly: true, portOffset: 1 })
