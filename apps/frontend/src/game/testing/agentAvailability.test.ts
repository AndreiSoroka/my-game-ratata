import { expect, it } from 'vitest'

import { agentConnected } from './agentAvailability'

it.each(['Connected', 'Loading map', 'Map loading failed'])(
    'preserves the network session while presentation status is %s',
    (status) => expect(agentConnected(status)).toBe(true)
)

it.each(['Ready', 'Connecting', 'Disconnected'])(
    'does not fabricate a session while status is %s',
    (status) => expect(agentConnected(status)).toBe(false)
)
