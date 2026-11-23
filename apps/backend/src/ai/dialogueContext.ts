import { ITEM_DEFINITIONS, type ItemId } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { isConversationOnly } from '../game/npcRoster'
import type { GameRoom } from '../game/room'
import type { NpcConversationFeedback } from '../game/roomConversationDepartures'
import { npcCombatReactionContext } from './combatReactions'
import { projectContracts } from './contractProjection'
import type { NpcAiDialogue } from './dialogue'
import { dialogueConversationKey, taskConversationKey } from './dialogueMemory'
import { hasTaskContext } from './dialogueResult'
import { npcCityStoryContext } from './npcCityStoryContext'
import { npcIdentityContext } from './npcIdentityInstructions'
import { greetingOpportunity } from './npcInitiative'
import { npcSpeechContext } from './npcSpeechInstructions'
import { npcSpeechLanguageContext } from './npcSpeechLanguage'
import { buildNpcAiObservation, type NpcAiObservation } from './observation'
import { updateNpcAiSocialCapabilities } from './observationPolicy'
import type { NpcAiActorState } from './runtimeState'
import { npcTaskConsent } from './taskConsent'
import type { NpcAiContext, NpcAiEvent } from './types'

export function npcDialogueContext(
    room: GameRoom,
    dialogueService: NpcAiDialogue,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number,
    feedback: NpcConversationFeedback = {}
): NpcAiContext {
    const observation = buildNpcAiObservation(
        room,
        actor,
        state.config.role,
        now
    )
    if (
        state.task?.background === 'combat_reaction' &&
        state.dialogue === undefined
    ) {
        return npcCombatReactionContext(
            state,
            actor,
            observation,
            personalContext(actor, state)
        )
    }
    return conversationalContext(
        room,
        dialogueService,
        state,
        actor,
        now,
        observation,
        feedback
    )
}

function conversationalContext(
    room: GameRoom,
    dialogueService: NpcAiDialogue,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number,
    observation: NpcAiObservation,
    feedback: NpcConversationFeedback
): NpcAiContext {
    refreshRequester(state, observation)
    const dialogue = state.dialogue
    const key =
        dialogue === undefined
            ? taskConversationKey(state.task)
            : dialogueConversationKey(dialogue)
    const taskContext = hasTaskContext(state)
    const commandCapabilities = dialogueService.commandCapabilities(
        state,
        observation,
        now
    )
    const socialOpportunity =
        state.task?.background === 'greeting' &&
        state.task.targetId !== undefined
            ? greetingOpportunity(state.mind, state.task.targetId, now)
            : undefined
    filterSocialContext(room, observation, state, actor, now)
    proactiveQuestRecipients(room, observation, state, actor, now)
    observation.itemDefinitions = observedItemDefinitions(observation)
    updateNpcAiSocialCapabilities(observation)
    if (
        isConversationOnly(state.config.role, state.config.mode) &&
        observation.capabilities !== undefined
    ) {
        observation.capabilities.intentions = ['speak', 'wait']
    }
    return structuredClone({
        actorId: actor.id,
        role: state.config.role,
        personality: actor.soul.personality,
        ...npcSpeechLanguageContext(room, state, observation, actor, now),
        ...feedback,
        ...(socialOpportunity === undefined ? {} : { socialOpportunity }),
        ...personalContext(actor, state),
        ...npcCityStoryContext(room, actor, currentPerson(state)),
        task: taskContext ? state.task : null,
        taskConsent: npcTaskConsent(room, state),
        ...(commandCapabilities === undefined ? {} : { commandCapabilities }),
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

function personalContext(
    actor: GameCharacter,
    state: NpcAiActorState
): Pick<NpcAiContext, 'selfIdentity' | 'speechStyle'> {
    const speechStyle = npcSpeechContext(actor)
    const selfIdentity = npcIdentityContext(actor, {
        actorId: actor.id,
        turnId: state.dialogue?.id ?? state.task?.id ?? actor.id,
        step: state.task?.steps ?? 0,
    })
    return {
        ...(speechStyle === undefined ? {} : { speechStyle }),
        ...(selfIdentity === undefined ? {} : { selfIdentity }),
    }
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
        questInvitation: room.social.quests.invitationFor(
            actor.id,
            partnerId,
            now
        ),
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
function proactiveQuestRecipients(
    room: GameRoom,
    observation: NpcAiObservation,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): void {
    if (state.dialogue !== undefined) {
        return
    }
    for (const target of observation.targets) {
        if (
            target.kind === 'character' &&
            target.details['canReceiveQuest'] === true
        ) {
            target.details['canReceiveProactiveQuestInvitation'] =
                room.social.quests.canInvite(actor.id, target.id, now)
        }
    }
}
function conversationPartner(state: NpcAiActorState): string | undefined {
    if (state.dialogue !== undefined) {
        return state.dialogue.ambiguous === true
            ? undefined
            : state.dialogue.senderId
    }
    return currentPerson(state)
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
function dialogueMemory(state: NpcAiActorState, key: string): string {
    return state.dialogue === undefined && state.task?.background !== 'greeting'
        ? state.memory
        : (state.conversations.get(key) ?? '')
}
function currentPerson(state: NpcAiActorState): string | undefined {
    return (
        state.dialogue?.senderId ??
        state.task?.requesterId ??
        (state.task?.background === 'greeting'
            ? state.task.targetId
            : undefined)
    )
}
function currentQuery(state: NpcAiActorState): string {
    return state.dialogue?.text ?? state.task?.request ?? ''
}
