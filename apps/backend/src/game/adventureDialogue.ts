import {
    authoredMessage,
    authoredPhrase,
    type AuthoredTextKey,
    type GameEventPayload,
    workshopFor,
} from '@my-game-ratata/contracts'

import { adventureDialogue, adventureNpcRoles } from './adventureContent'
import { resolveAdventureNpc } from './adventureNpc'
import {
    type AdventureChoiceContext,
    applyAdventureChoice,
    type PlayerAdventure,
} from './adventureState'
import { refreshTradeDialogue } from './adventureTrading'
import type { GameCharacter } from './character'
import { CONVERSATION_REACH } from './conversationSessions'
import { interactionRangeText } from './interactionRangeText'
import type { NavigationService } from './navigation'
import { setAuthoredNotice, setNotice } from './notices'
import { createDialogueSpeechEvent } from './speechReceipts'
import { trophyProgress } from './trophyQuest'
export function interactAdventureNpc(
    actor: GameCharacter,
    npcId: string,
    locationNPCs: GameCharacter[],
    state: PlayerAdventure,
    now: number,
    navigation?: NavigationService,
    service?: 'shop' | 'orders' | 'repair',
    text?: string
): GameEventPayload[] {
    const npc = resolveAdventureNpc(actor, npcId, locationNPCs, now, navigation)

    if (npc === undefined) {
        if (navigation === undefined) {
            return rejectDialogue(state, 'notice.conversationUnavailable')
        }
        const reach = CONVERSATION_REACH / navigation.grid.tileWidth
        setNotice(
            state,
            `Подойди к живому собеседнику ${interactionRangeText(CONVERSATION_REACH, navigation.grid.tileWidth)}.`,
            authoredMessage('notice.conversationReach', { reach })
        )
        return []
    }

    if (!serviceAvailable(npcId, service)) {
        return rejectDialogue(state, 'notice.serviceUnavailable')
    }
    setNotice(state, null)
    state.dialogue = adventureDialogue(
        npc.id,
        npc.nickname,
        trophyProgress(state, actor),
        text === undefined ? undefined : { text }
    )
    if (service !== undefined) {
        state.dialogue.initialView = service
    }
    refreshTradeDialogue(actor, state.dialogue, state.cityTradeBlockedReason)
    if (actor.controllerKind === 'network_player') {
        npc.setMoveInput({ x: 0, y: 0 })
        npc.clearPath()
        npc.updateFacing({
            x: actor.position.x - npc.position.x,
            y: actor.position.y - npc.position.y,
        })
    }
    return sayDialogue(actor, npc, state, state.dialogue.text)
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
        navigation
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
    const text =
        choiceId === 'ask_dragon'
            ? authoredPhrase('dialogue.dragons')
            : undefined
    state.dialogue = adventureDialogue(
        npc.id,
        npc.nickname,
        trophyProgress(state, actor),
        text
    )
    refreshTradeDialogue(actor, state.dialogue, state.cityTradeBlockedReason)
    return sayDialogue(actor, npc, state, state.dialogue.text)
}

function rejectDialogue(
    state: PlayerAdventure,
    notice: AuthoredTextKey
): GameEventPayload[] {
    setAuthoredNotice(state, notice)
    return []
}
function sayDialogue(
    actor: GameCharacter,
    npc: GameCharacter,
    state: PlayerAdventure,
    text: string
): GameEventPayload[] {
    const event = createDialogueSpeechEvent(npc, actor, text)
    if (state.dialogue !== null) {
        state.dialogue.speechId = event.speechId
        if (state.dialogue.textMessage !== undefined) {
            event.textMessage = state.dialogue.textMessage
        }
    }
    return [event]
}

function serviceAvailable(
    npcId: string,
    service: 'shop' | 'orders' | 'repair' | undefined
): boolean {
    if (service === undefined) {
        return true
    }
    if (service === 'orders') {
        return workshopFor(npcId) !== undefined
    }
    return service === 'repair'
        ? workshopFor(npcId)?.repair === true
        : adventureNpcRoles[npcId]?.trade === true
}
