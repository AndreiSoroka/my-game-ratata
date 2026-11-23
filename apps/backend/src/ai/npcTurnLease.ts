import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import type { NpcAiActorState } from './runtimeState'

export function isNpcTurnLeased(state: NpcAiActorState): boolean {
    return (
        state.config.mode !== 'dialogue_only' ||
        state.hasDialogueModelLease === true
    )
}

export function acquireNpcTurnLease(
    companions: CompanionService,
    actor: GameCharacter,
    state: NpcAiActorState,
    now: number,
    requiresLease: boolean,
    nextId: (kind: string) => string
): boolean {
    if (
        state.token !== undefined &&
        (!requiresLease || isNpcTurnLeased(state))
    ) {
        return true
    }
    if (!requiresLease && state.config.mode === 'dialogue_only') {
        state.token = nextId('dialogue')
        return true
    }
    const token = nextId(`lease-${String(++state.generation)}`)
    if (!companions.claimModelControl(actor, token, now, false)) {
        state.nextAt = now + 1_000
        return false
    }
    state.token = token
    state.hasDialogueModelLease = state.config.mode === 'dialogue_only'
    return true
}

export function hasNpcReplyControl(
    companions: CompanionService,
    actor: GameCharacter,
    state: NpcAiActorState,
    now: number
): boolean {
    const needsLease =
        state.dialogue?.nearby !== undefined ||
        (state.dialogue === undefined &&
            state.task?.background === 'combat_reaction')
    return (
        state.token !== undefined &&
        (!needsLease || companions.isModelControlOwner(actor, state.token, now))
    )
}

export function releaseNpcTurnLease(
    companions: CompanionService,
    room: GameRoom,
    state: NpcAiActorState,
    now: number
): void {
    if (
        isNpcTurnLeased(state) &&
        state.actor !== undefined &&
        state.token !== undefined
    ) {
        companions.releaseModelControl(state.actor, state.token, room, now)
    }
    state.token = undefined
    state.hasDialogueModelLease = false
}
