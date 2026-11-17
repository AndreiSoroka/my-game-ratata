import type { QuestRewardMode } from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import { chooseAdventureReply } from './adventureDialogue'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { chooseNpcQuestDialogue } from './npcQuestDialogue'
import type { QuestGoldAwarder } from './questRewards'

export function createAdventureChoice(context: {
    service: AdventureService
    stateFor: (id: string) => PlayerAdventure
    now: () => number
    members: (id: string) => readonly string[]
    award: QuestGoldAwarder
}) {
    return (
        actor: GameCharacter,
        choiceId: string,
        locationNPCs: GameCharacter[],
        navigation?: NavigationService,
        now = context.now(),
        rewardMode?: QuestRewardMode
    ) => {
        const state = context.stateFor(actor.id)
        return (
            chooseNpcQuestDialogue(
                context.service,
                actor,
                state,
                choiceId,
                now
            ) ??
            chooseAdventureReply(
                actor,
                choiceId,
                locationNPCs,
                state,
                now,
                navigation,
                {
                    ...(rewardMode === undefined ? {} : { rewardMode }),
                    memberIds: context.members(actor.id),
                    award: context.award,
                }
            )
        )
    }
}
