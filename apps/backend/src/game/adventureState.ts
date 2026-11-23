import type {
    AdventureDialogue,
    AdventureQuestStatus,
    CityBellState,
    LocalizedMessage,
    QuestRewardMode,
    QuestRewardShare,
} from '@my-game-ratata/contracts'
import { DEFAULT_QUEST_REWARD_MODE } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { setAuthoredNotice, setNotice } from './notices'
import type { QuestGoldAwarder } from './questRewards'
import { turnInHearts } from './trophyQuest'

export interface PlayerAdventure {
    cityBellState?: CityBellState
    cityTradeBlockedReason?: string
    questAccepted?: boolean
    questCancelledReason?: string
    questCancelledReasonMessage?: LocalizedMessage
    questRewardMode: QuestRewardMode | null
    questRewardShares: QuestRewardShare[] | null
    kills: number
    questStatus: Exclude<AdventureQuestStatus, 'ready'>
    wardRestored: boolean
    dialogue: AdventureDialogue | null
    gatherAllowedAt: number
    gold: number
    lastQuestRewardReceiptId?: string
    rewardKeys: Set<string>
    notice: string | null
    noticeMessage?: LocalizedMessage
    noticeId: number
}

export interface AdventureChoiceContext {
    cityStory?: import('./cityStoryQuests').CityStoryQuests
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

    if (context.cityStory?.choose(state, choiceId, actor, context) === true) {
        return
    }

    if (choiceId === 'accept_quest' && state.questStatus === 'available') {
        state.questAccepted = true
        state.questRewardMode = context.rewardMode ?? DEFAULT_QUEST_REWARD_MODE
        state.questStatus = 'active'
        setAuthoredNotice(state, 'story.accepted')
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
        setAuthoredNotice(state, 'story.chapterComplete')
    }
}

function reportStoryReward(state: PlayerAdventure, actorId: string): void {
    const received =
        state.questRewardShares?.find((share) => share.characterId === actorId)
            ?.gold ?? 0
    setAuthoredNotice(state, 'story.reward', { received })
}
