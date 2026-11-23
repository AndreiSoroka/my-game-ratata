import type { CompanionRequest, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CompanionRuntime } from './companionMovement'
import { sync } from './companionState'

export function setCompanionWaitAnchor(
    npc: GameCharacter,
    state: CompanionRuntime,
    ownerId: string,
    anchor: { locationId: string; position: Vector2 }
): void {
    if (
        state.order === 'wait' &&
        state.leaderId === ownerId &&
        anchor.locationId === npc.locationId
    ) {
        state.anchor = { ...anchor.position }
        state.anchorLocation = anchor.locationId
    }
}

export function rememberWaitBaseline(
    state: CompanionRuntime,
    request: CompanionRequest
): void {
    if (request === 'wait') {
        if (state.order !== 'wait') {
            state.waitResumeOrder = state.order === 'follow' ? 'follow' : 'idle'
            state.waitResumeLeaderId = state.leaderId
        }
        return
    }
    delete state.waitResumeOrder
    delete state.waitResumeLeaderId
}

/** A claimed new task consumes only its owner's previous waiting instruction. */
export function consumeCompanionWait(
    npc: GameCharacter,
    owner: GameCharacter,
    state: CompanionRuntime,
    mayResumeFollow: () => boolean
): void {
    if (state.order !== 'wait' || state.leaderId !== owner.id) {
        return
    }
    const follow =
        state.waitResumeOrder === 'follow' &&
        state.waitResumeLeaderId === owner.id &&
        state.profile.canFollow &&
        mayResumeFollow()
    state.order = follow ? 'follow' : 'idle'
    state.leaderId = state.waitResumeLeaderId === owner.id ? owner.id : null
    state.waitMode = undefined
    state.waitDeparted = false
    state.anchor = { ...npc.position }
    state.anchorLocation = npc.locationId
    state.lastPlanAt = -Infinity
    state.controlRevision = (state.controlRevision ?? 0) + 1
    delete state.waitResumeOrder
    delete state.waitResumeLeaderId
    sync(npc, state)
}
