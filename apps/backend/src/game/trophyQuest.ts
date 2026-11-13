import type { AdventureDialogue } from '@my-game-ratata/contracts'

import {
    adventureDialogue,
    adventureNpcRoles,
    type AdventureProgress,
    adventureQuest,
} from './adventureContent'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { consumeInventoryItems, countInventoryItem } from './inventory'

export function trophyProgress(
    state: PlayerAdventure,
    actor?: GameCharacter
): AdventureProgress {
    const trophies = countInventoryItem(actor?.inventory ?? [], 'slime_heart')
    return {
        kills: state.kills,
        trophies,
        questStatus:
            state.questStatus === 'active' && trophies >= adventureQuest.goal
                ? 'ready'
                : state.questStatus,
        wardRestored: state.wardRestored,
    }
}

export function trophyDialogue(
    dialogue: AdventureDialogue | null,
    progress: AdventureProgress
): AdventureDialogue | null {
    if (
        dialogue === null ||
        adventureNpcRoles[dialogue.npcId]?.quest !== true
    ) {
        return dialogue
    }
    const wasReady = dialogue.choices.some(
        (choice) => choice.id === 'turn_in_trophies'
    )
    return wasReady === (progress.questStatus === 'ready')
        ? dialogue
        : {
              ...dialogue,
              ...adventureDialogue(dialogue.npcId, dialogue.npcName, progress),
          }
}

export function turnInHearts(
    state: PlayerAdventure,
    actor: GameCharacter
): void {
    if (
        state.questStatus !== 'active' ||
        state.rewardKeys.has(adventureQuest.id) ||
        trophyProgress(state, actor).trophies < adventureQuest.goal
    ) {
        return
    }
    if (
        !consumeInventoryItems(actor.inventory, {
            slime_heart: adventureQuest.goal,
        })
    ) {
        return
    }
    state.rewardKeys.add(adventureQuest.id)
    state.gold += adventureQuest.rewardGold
    state.questStatus = 'completed'
}
