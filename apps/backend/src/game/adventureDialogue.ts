import {
    authoredMessage,
    type AuthoredTextKey,
    type GameEventPayload,
    type NpcInteractionService,
    workshopFor,
} from '@my-game-ratata/contracts'

import { adventureDialogue, adventureNpcRoles } from './adventureContent'
import { conversationalNpcService, resolveAdventureNpc } from './adventureNpc'
import {
    type AdventureChoiceContext,
    applyAdventureChoice,
    type PlayerAdventure,
} from './adventureState'
import {
    type AdventureActionResult,
    refreshTradeDialogue,
} from './adventureTrading'
import type { GameCharacter } from './character'
import { CONVERSATION_REACH } from './conversationSessions'
import { interactionRangeText } from './interactionRangeText'
import type { NavigationService } from './navigation'
import { setAuthoredNotice, setNotice } from './notices'
import { residentDialogue } from './residentDialogue'
import { trophyProgress } from './trophyQuest'
export function interactAdventureNpc(
    actor: GameCharacter,
    npcId: string,
    locationNPCs: GameCharacter[],
    state: PlayerAdventure,
    now: number,
    navigation?: NavigationService,
    service?: NpcInteractionService,
    text?: string,
    availableWorkerRequests = false
): AdventureActionResult {
    const npc = resolveAdventureNpc(
        actor,
        npcId,
        locationNPCs,
        now,
        navigation,
        conversationalNpcService(service)
    )

    if (npc === undefined) {
        if (navigation === undefined) {
            return rejectInteraction(state, 'notice.conversationUnavailable')
        }
        const reach = CONVERSATION_REACH / navigation.grid.tileWidth
        const error = setNotice(
            state,
            `Подойди к живому собеседнику ${interactionRangeText(CONVERSATION_REACH, navigation.grid.tileWidth)}.`,
            authoredMessage('notice.conversationReach', { reach })
        )
        return { accepted: false, error, events: [] }
    }

    if (!serviceAvailable(npcId, service, availableWorkerRequests)) {
        return rejectInteraction(state, 'notice.serviceUnavailable')
    }
    setNotice(state, null)
    state.dialogue =
        service === 'worker_requests'
            ? residentDialogue(
                  npc.id,
                  npc.nickname,
                  undefined,
                  'dialogue.workerRequests'
              )
            : adventureDialogue(
                  npc.id,
                  npc.nickname,
                  trophyProgress(state, actor),
                  text === undefined ? undefined : { text }
              )
    if (service === 'shop' || service === 'orders' || service === 'repair') {
        state.dialogue.initialView = service
    }
    refreshTradeDialogue(actor, state.dialogue, state.cityTradeBlockedReason)
    if (actor.controllerKind === 'network_player' && service !== undefined) {
        npc.setMoveInput({ x: 0, y: 0 })
        npc.clearPath()
        npc.updateFacing({
            x: actor.position.x - npc.position.x,
            y: actor.position.y - npc.position.y,
        })
    }
    return { accepted: true, error: null, events: [] }
}

export function chooseAdventureReply(
    actor: GameCharacter,
    choiceId: string,
    locationNPCs: GameCharacter[],
    state: PlayerAdventure,
    now: number,
    navigation?: NavigationService,
    context: AdventureChoiceContext = {}
): GameEventPayload[] {
    if (choiceId === 'leave' || choiceId === 'close') {
        state.dialogue = null
        setNotice(state, null)
        return []
    }

    const npc = resolveAdventureNpc(
        actor,
        state.dialogue?.npcId,
        locationNPCs,
        now,
        navigation,
        conversationalChoice(state.dialogue?.initialView, choiceId)
    )

    if (npc === undefined) {
        state.dialogue = null
        return rejectDialogue(state, 'notice.conversationInterrupted')
    }

    const dialogue = adventureDialogue(
        npc.id,
        npc.nickname,
        trophyProgress(state, actor)
    )

    if (!dialogue.choices.some((choice) => choice.id === choiceId)) {
        return rejectDialogue(state, 'notice.dialogueChoiceUnavailable')
    }

    applyAdventureChoice(state, choiceId, actor, context)
    const { text, textMessage, speechId } = state.dialogue ?? {}
    state.dialogue = adventureDialogue(
        npc.id,
        npc.nickname,
        trophyProgress(state, actor),
        text === undefined
            ? undefined
            : { text, ...(textMessage === undefined ? {} : { textMessage }) }
    )
    if (speechId !== undefined) {
        state.dialogue.speechId = speechId
    }
    refreshTradeDialogue(actor, state.dialogue, state.cityTradeBlockedReason)
    return []
}

function conversationalChoice(
    service: NpcInteractionService | undefined,
    choiceId: string
): boolean {
    return service === undefined && choiceId !== 'turn_in_trophies'
}

function rejectInteraction(
    state: PlayerAdventure,
    notice: AuthoredTextKey
): AdventureActionResult {
    const error = setAuthoredNotice(state, notice)
    return { accepted: false, error, events: [] }
}

function rejectDialogue(
    state: PlayerAdventure,
    notice: AuthoredTextKey
): GameEventPayload[] {
    setAuthoredNotice(state, notice)
    return []
}
function serviceAvailable(
    npcId: string,
    service: NpcInteractionService | undefined,
    availableWorkerRequests: boolean
): boolean {
    switch (service) {
        case 'shop':
            return adventureNpcRoles[npcId]?.trade === true
        case 'orders':
            return workshopFor(npcId) !== undefined
        case 'repair':
            return workshopFor(npcId)?.repair === true
        case 'city_affairs':
            return adventureNpcRoles[npcId]?.quest === true
        case 'worker_requests':
            return availableWorkerRequests
        default:
            return true
    }
}
