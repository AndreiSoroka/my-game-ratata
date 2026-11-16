import type {
    AdventureDialogue,
    AdventureQuestStatus,
    QuestRewardMode,
    QuestRewardShare,
} from '@my-game-ratata/contracts'
import { DEFAULT_QUEST_REWARD_MODE } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { setNotice } from './notices'
import type { QuestGoldAwarder } from './questRewards'
import { turnInHearts } from './trophyQuest'

export interface PlayerAdventure {
    questRewardMode: QuestRewardMode | null
    questRewardShares: QuestRewardShare[] | null
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

export interface AdventureChoiceContext {
    rewardMode?: QuestRewardMode
    memberIds?: readonly string[]
    award?: QuestGoldAwarder
}

export function createAdventureState(): PlayerAdventure {
    return {
        questRewardMode: null,
        questRewardShares: null,
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
    actor: GameCharacter,
    context: AdventureChoiceContext = {}
): void {
    setNotice(state, null)

    if (choiceId === 'accept_quest' && state.questStatus === 'available') {
        state.questRewardMode = context.rewardMode ?? DEFAULT_QUEST_REWARD_MODE
        state.questStatus = 'active'
        setNotice(state, 'Задание принято. Собери три слизневых сердца.')
    }

    if (choiceId === 'turn_in_trophies') {
        if (turnInHearts(state, actor, context)) {
            reportStoryReward(state, actor.id)
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

function reportStoryReward(state: PlayerAdventure, actorId: string): void {
    const received =
        state.questRewardShares?.find((share) => share.characterId === actorId)
            ?.gold ?? 0
    setNotice(
        state,
        `Три слизневых сердца переданы Мире. Общая награда: 40 золотых; твоя доля: ${String(received)}.`
    )
}
