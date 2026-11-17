import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
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
    const requester = observation.targets.find(
        (target) =>
            target.kind === 'character' && target.id === state.task?.requesterId
    )
    if (state.task !== null && requester !== undefined) {
        state.task.lastKnownRequester = {
            locationId: observation.locationId,
            position: { ...requester.position },
        }
    }
    const dialogue = state.dialogue
    const key = dialogue === undefined ? 'city' : dialogueKey(dialogue)
    const privateContext =
        dialogue === undefined || key === state.task?.audienceKey
    const events = contextEvents(state, dialogueService)
    filterSocialContext(room, observation, state, actor, now)
    updateNpcAiSocialCapabilities(observation)
    return structuredClone({
        actorId: actor.id,
        role: state.config.role,
        personality: actor.soul.personality,
        task: privateContext ? state.task : null,
        events,
        memory:
            dialogue === undefined
                ? state.memory
                : (state.conversations.get(key) ?? ''),
        facts: privateContext ? state.facts : [],
        observation,
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
}
function conversationPartner(state: NpcAiActorState): string | undefined {
    if (state.dialogue !== undefined) {
        return state.dialogue.channel === 'whisper'
            ? state.dialogue.senderId
            : undefined
    }
    return state.task?.audienceKey?.startsWith('whisper:') === true
        ? (state.task.requesterId ?? undefined)
        : undefined
}
