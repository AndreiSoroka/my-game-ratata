import type { CompanionClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import type { CompanionRuntime } from './companionMovement'
import { rememberWaitBaseline } from './companionWait'

export function applyCompanionOrder(
    npc: GameCharacter,
    actor: GameCharacter,
    state: CompanionRuntime,
    message: CompanionClientMessage,
    now: number
): void {
    rememberWaitBaseline(state, message.request)
    state.lastPlanAt = now - 300
    state.controlRevision = (state.controlRevision ?? 0) + 1
    state.leaderId = actor.id
    state.leaderDeathSequence = actor.deathSequence
    state.order =
        message.request === 'guard' || state.profile.stationary
            ? 'guard'
            : (message.request as 'follow' | 'help' | 'wait')
    state.anchor = { ...npc.position }
    state.anchorLocation = npc.locationId
    state.waitMode =
        message.request === 'wait'
            ? (message.waitMode ?? 'until_request')
            : undefined
    state.waitDeparted = false
    cancelCharacterControl(npc)
    npc.setMoveInput({ x: 0, y: 0 })
    npc.clearPath()
}
