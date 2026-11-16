import type { AdventureSnapshot } from '@my-game-ratata/contracts'

import type { AgentObservation } from './agentObservation'
export function observeAdventure(
    adventure: AdventureSnapshot | undefined
): AgentObservation['adventure'] {
    if (!adventure) return undefined
    return {
        dialogue: adventure.dialogue,
        gold: adventure.gold,
        materials: adventure.materials,
        notice: adventure.notice,
        noticeId: adventure.noticeId,
        quest: adventure.quest,
        recipes: adventure.recipes,
        shop: adventure.shop,
        market: adventure.market,
        repairs: adventure.repairs,
        workshop: adventure.workshop,
        craftOrders: adventure.craftOrders,
        trophies: adventure.trophies,
        wardRestored: adventure.wardRestored,
    }
}
