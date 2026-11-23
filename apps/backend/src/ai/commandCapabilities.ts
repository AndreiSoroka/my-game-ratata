import type { GameCharacter } from '../game/character'
import { canUseCombat } from '../game/combatPermission'
import type { CompanionService } from '../game/companions'
import {
    isConversationOnly,
    npcCanOfferService,
    npcServiceOffers,
} from '../game/npcRoster'
import type { GameRoom } from '../game/room'
import { npcAssistanceContext } from './dialogueOrders'
import { hasTaskContext } from './dialogueResult'
import { npcFollowInitiative } from './npcFollowInitiative'
import type { NpcAiObservation } from './observationTypes'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiContext } from './types'

type CommandCapabilities = NonNullable<NpcAiContext['commandCapabilities']>

export function observedNpcCommandCapabilities(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    observation: NpcAiObservation,
    now: number
): CommandCapabilities | undefined {
    const capabilities = npcCommandCapabilities(room, companions, state, now)
    if (capabilities === undefined) {
        return undefined
    }
    const followInitiative = npcFollowInitiative(
        room,
        companions,
        state,
        observation,
        now
    )
    return followInitiative.length === 0
        ? capabilities
        : { ...capabilities, followInitiative }
}

export function npcCommandCapabilities(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    now: number
): CommandCapabilities | undefined {
    const actor = state.actor
    if (actor === undefined) {
        return undefined
    }
    const { canFollow } = companions.capabilities(actor)
    const partner = room.getCharacter(
        state.dialogue?.senderId ?? state.task?.requesterId ?? ''
    )
    const dialogueOnly = isConversationOnly(
        state.config.role,
        state.config.mode
    )
    const serviceOffers = npcServiceOffers.filter((service) =>
        npcCanOfferService(actor.id, service)
    )
    return {
        canFight: !dialogueOnly && canUseCombat(actor),
        canFollow: !dialogueOnly && canFollow,
        ...companionContext(actor, partner, visibleGuide(state)),
        serviceOffers,
        movementScope: dialogueOnly
            ? 'none'
            : state.config.role === 'city_coordinator'
              ? 'city'
              : 'region',
        orders: dialogueOnly
            ? {}
            : allowedOrders(room, companions, actor, partner, now),
    }
}

function visibleGuide(state: NpcAiActorState): NpcAiActorState['guide'] {
    return state.guide?.decision.type === 'travel_to' || hasTaskContext(state)
        ? state.guide
        : undefined
}

function companionContext(
    actor: GameCharacter,
    partner: GameCharacter | undefined,
    guide: NpcAiActorState['guide']
): Pick<CommandCapabilities, 'companionOrder' | 'followingSpeaker' | 'travel'> {
    const companion = actor.soul.companion
    const travel =
        guide === undefined
            ? {}
            : {
                  travel: {
                      targetKey: guide.decision.targetKey,
                      mode:
                          guide.decision.type === 'guide'
                              ? ('guide' as const)
                              : guide.escortId === undefined
                                ? ('solo' as const)
                                : ('escorted' as const),
                  },
              }
    return companion === null
        ? travel
        : {
              ...travel,
              companionOrder: companion.order,
              followingSpeaker:
                  companion.leaderId != null &&
                  companion.leaderId === partner?.id,
          }
}

function allowedOrders(
    room: GameRoom,
    companions: CompanionService,
    actor: GameCharacter,
    partner: GameCharacter | undefined,
    now: number
): NonNullable<NpcAiContext['commandCapabilities']>['orders'] {
    if (partner === undefined) {
        return {}
    }
    const orders: NonNullable<NpcAiContext['commandCapabilities']>['orders'] =
        {}
    const context = npcAssistanceContext(room)
    for (const request of [
        'follow',
        'help',
        'guard',
        'wait',
        'dismiss',
    ] as const) {
        const check = companions.checkOrder(
            partner,
            actor,
            { type: 'companion_request', targetId: actor.id, request },
            now,
            context
        )
        orders[request] = check.accepted
            ? { allowed: true }
            : { allowed: false, reason: check.reason }
    }
    return orders
}
