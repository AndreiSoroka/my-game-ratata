import type {
    AdventureDialogue,
    AdventureQuestStatus,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { setNotice } from './notices'
import { turnInHearts } from './trophyQuest'

export interface PlayerAdventure {
    kills: number
    questStatus: Exclude<AdventureQuestStatus, 'ready'>
    wardRestored: boolean
    dialogue: AdventureDialogue | null
    gatherAllowedAt: number
    gold: number
    rewardKeys: Set<string>
    notice: string | null
    noticeId: number
}

export function createAdventureState(): PlayerAdventure {
    return {
        dialogue: null,
        gatherAllowedAt: 0,
        gold: 0,
        rewardKeys: new Set<string>(),
        kills: 0,
        notice: null,
        noticeId: 0,
        questStatus: 'available',
        wardRestored: false,
    }
}

export function applyAdventureChoice(
    state: PlayerAdventure,
    choiceId: string,
    actor: GameCharacter
): void {
    setNotice(state, null)

    if (choiceId === 'accept_quest' && state.questStatus === 'available') {
        state.questStatus = 'active'
        setNotice(state, 'Задание принято. Собери три слизневых сердца.')
    }

    if (choiceId === 'turn_in_trophies') {
        turnInHearts(state, actor)
        if (state.questStatus === 'completed') {
            setNotice(
                state,
                'Три слизневых сердца переданы Мире. Получено 40 золотых.'
            )
        }
    }

    if (
        choiceId === 'restore_ward' &&
        state.questStatus === 'completed' &&
        !state.wardRestored
    ) {
        state.wardRestored = true
        setNotice(state, 'Колокол памяти восстановлен. Первая глава завершена.')
    }
}
