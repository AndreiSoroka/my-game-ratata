import type { GameEventPayload } from '@my-game-ratata/contracts'
import { workshopFor } from '@my-game-ratata/contracts'

import {
    adventureDialogue,
    adventureNpcRoles,
    dragonStory,
} from './adventureContent'
import { resolveAdventureNpc } from './adventureNpc'
import { applyAdventureChoice, type PlayerAdventure } from './adventureState'
import { refreshTradeDialogue } from './adventureTrading'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import { createSpeechEvent } from './speechReceipts'
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
        return rejectDialogue(
            state,
            'Подойди к живому собеседнику ближе: не дальше 48 шагов.'
        )
    }

    if (!serviceAvailable(npcId, service)) {
        return rejectDialogue(state, 'Эта услуга у собеседника недоступна.')
    }
    setNotice(state, null)
    state.dialogue = adventureDialogue(
        npc.id,
        npc.nickname,
        trophyProgress(state, actor),
        text
    )
    if (service !== undefined) {
        state.dialogue.initialView = service
    }
    refreshTradeDialogue(actor, state.dialogue)
    npc.setMoveInput({ x: 0, y: 0 })
    npc.clearPath()
    npc.updateFacing({
        x: actor.position.x - npc.position.x,
        y: actor.position.y - npc.position.y,
    })
    return sayDialogue(actor, npc, state, state.dialogue.text)
}

export function chooseAdventureReply(
    actor: GameCharacter,
    choiceId: string,
    locationNPCs: GameCharacter[],
    state: PlayerAdventure,
    now: number,
    navigation?: NavigationService
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
        return rejectDialogue(state, 'Разговор прерван. Вернись к собеседнику.')
    }

    const dialogue = adventureDialogue(
        npc.id,
        npc.nickname,
        trophyProgress(state, actor)
    )

    if (!dialogue.choices.some((choice) => choice.id === choiceId)) {
        return rejectDialogue(state, 'Этот ответ сейчас недоступен.')
    }

    applyAdventureChoice(state, choiceId, actor)
    const text = choiceId === 'ask_dragon' ? dragonStory : undefined
    state.dialogue = adventureDialogue(
        npc.id,
        npc.nickname,
        trophyProgress(state, actor),
        text
    )
    refreshTradeDialogue(actor, state.dialogue)
    return sayDialogue(actor, npc, state, state.dialogue.text)
}

function rejectDialogue(
    state: PlayerAdventure,
    notice: string
): GameEventPayload[] {
    setNotice(state, notice)
    return []
}
function sayDialogue(
    actor: GameCharacter,
    npc: GameCharacter,
    state: PlayerAdventure,
    text: string
): GameEventPayload[] {
    const event = createSpeechEvent(npc, text, {
        targetId: actor.id,
        audienceIds: [actor.id],
    })
    if (state.dialogue !== null) {
        state.dialogue.speechId = event.speechId
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
