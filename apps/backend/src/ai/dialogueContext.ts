import { ITEM_DEFINITIONS, type ItemId } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { projectContracts } from './contractProjection'
import { dialogueKey, type NpcAiDialogue } from './dialogue'
import { buildNpcAiObservation, type NpcAiObservation } from './observation'
import { updateNpcAiSocialCapabilities } from './observationPolicy'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiContext, NpcAiEvent } from './types'

export function npcDialogueContext(
    room: GameRoom,
    dialogueService: NpcAiDialogue,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): NpcAiContext {
    const observation = buildNpcAiObservation(
        room,
        actor,
        state.config.role,
        now
    )
    refreshRequester(state, observation)
    const dialogue = state.dialogue
    const key = dialogue === undefined ? 'city' : dialogueKey(dialogue)
    const taskContext = hasTaskContext(state, key)
    filterSocialContext(room, observation, state, actor, now)
    observation.itemDefinitions = observedItemDefinitions(observation)
    updateNpcAiSocialCapabilities(observation)
    if (
        state.config.mode === 'dialogue_only' &&
        observation.capabilities !== undefined
    ) {
        observation.capabilities.intentions = ['speak', 'wait']
    }
    return structuredClone({
        actorId: actor.id,
        role: state.config.role,
        personality: actor.soul.personality,
        task: taskContext ? state.task : null,
        events: contextEvents(state, dialogueService),
        memory: dialogueMemory(state, key),
        facts: taskContext ? state.facts : [],
        observation,
        conversation: state.mind.context(
            currentPerson(state),
            currentQuery(state)
        ),
    })
}
function contextEvents(
    state: NpcAiActorState,
    service: NpcAiDialogue
): NpcAiEvent[] {
    const event = state.dialogue
    if (event === undefined) {
        return state.events
    }
    const claimedBy = service.claimedBy(event.id)
    return [{ ...event, ...(claimedBy === undefined ? {} : { claimedBy }) }]
}
function filterSocialContext(
    room: GameRoom,
    observation: NpcAiObservation,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): void {
    const partnerId = conversationPartner(state)
    if (partnerId === undefined) {
        delete observation.social
        return
    }
    const exchange = observation.social?.exchange
    const offer = room.social.quests.snapshot(partnerId, now).questOffer
    observation.social = {
        questOffer: offer?.issuerId === actor.id ? offer : null,
        whisper: room.social.whispers.snapshot(actor, now, partnerId),
        exchange: exchange?.partnerId === partnerId ? exchange : null,
        issuerQuests: room.social.quests.conversation(actor.id, partnerId),
    }
    observation.contracts = projectContracts(
        room.social.conversation(actor.id, partnerId, now),
        currentQuery(state)
    )
}
function conversationPartner(state: NpcAiActorState): string | undefined {
    if (state.dialogue !== undefined) {
        return state.dialogue.ambiguous === true
            ? undefined
            : state.dialogue.senderId
    }
    return state.task?.requesterId ?? undefined
}
function observedItemDefinitions(
    observation: NpcAiObservation
): Partial<Record<ItemId, { name: string }>> {
    const ids = new Set<ItemId>()
    collectItemIds(observation.self.inventory, ids)
    collectItemIds(observation.self.equipment, ids)
    if (observation.social !== undefined) {
        collectItemIds(observation.social.exchange, ids)
        collectItemIds(observation.social.questOffer, ids)
    }
    return Object.fromEntries(
        [...ids].map((id) => [id, { name: ITEM_DEFINITIONS[id].name }])
    )
}
function collectItemIds(value: unknown, ids: Set<ItemId>): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectItemIds(item, ids)
        }
        return
    }
    if (value === null || typeof value !== 'object') {
        return
    }
    for (const [key, item] of Object.entries(value)) {
        if (
            key === 'itemId' &&
            typeof item === 'string' &&
            Object.hasOwn(ITEM_DEFINITIONS, item)
        ) {
            ids.add(item as ItemId)
        } else {
            collectItemIds(item, ids)
        }
    }
}
export function boundedNpcContext(context: NpcAiContext): NpcAiContext {
    const bounded = structuredClone(context)
    if (bounded.conversation !== undefined) {
        trimContext(bounded, bounded.conversation.recent)
        trimContext(bounded, bounded.conversation.relevant)
    }
    if (bounded.knowledge !== undefined) {
        trimContext(bounded, bounded.knowledge.memories)
        trimContext(bounded, bounded.knowledge.entries)
    }
    if (bounded.informationResults !== undefined) {
        trimContext(bounded, bounded.informationResults.messages ?? [])
    }
    return bounded
}
function trimContext(context: NpcAiContext, items: unknown[]): void {
    while (
        Buffer.byteLength(JSON.stringify(context)) > 62 * 1024 &&
        items.length > 0
    ) {
        items.pop()
    }
}
function refreshRequester(
    state: NpcAiActorState,
    observation: NpcAiObservation
): void {
    if (state.task === null) {
        return
    }
    const requester = observation.targets.find(
        (target) =>
            target.kind === 'character' && target.id === state.task?.requesterId
    )
    if (requester !== undefined) {
        state.task.lastKnownRequester = {
            locationId: observation.locationId,
            position: { ...requester.position },
        }
    }
}
function hasTaskContext(state: NpcAiActorState, key: string): boolean {
    return state.dialogue === undefined || key === state.task?.audienceKey
}
function dialogueMemory(state: NpcAiActorState, key: string): string {
    return state.dialogue === undefined
        ? state.memory
        : (state.conversations.get(key) ?? '')
}
function currentPerson(state: NpcAiActorState): string | undefined {
    return state.dialogue?.senderId ?? state.task?.requesterId ?? undefined
}
function currentQuery(state: NpcAiActorState): string {
    return state.dialogue?.text ?? state.task?.request ?? ''
}
