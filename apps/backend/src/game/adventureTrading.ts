import type {
    AdventureDialogue,
    AdventureTradeItemId,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import { adventureNpcRoles, adventureShop } from './adventureContent'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { cityTradeRefusal } from './crimeRules'
import { addInventoryItem, createItemInstance } from './inventory'
import { setNotice } from './notices'

export function refreshTradeDialogue(
    actor: GameCharacter,
    dialogue: AdventureDialogue | null
): void {
    if (dialogue === null) {
        return
    }
    const reason = dialogue.canTrade ? cityTradeRefusal(actor) : undefined
    if (reason === undefined) {
        delete dialogue.tradeBlockedReason
    } else {
        dialogue.tradeBlockedReason = reason
    }
}

export function purchaseAdventureItem(
    actor: GameCharacter,
    state: PlayerAdventure,
    npc: GameCharacter | undefined,
    itemId: AdventureTradeItemId
): GameEventPayload[] {
    refreshTradeDialogue(actor, state.dialogue)
    const refusal = cityTradeRefusal(actor)
    if (refusal !== undefined) {
        return reject(state, refusal)
    }
    const offer = adventureShop.find((candidate) => candidate.itemId === itemId)
    if (npc === undefined || adventureNpcRoles[npc.id]?.trade !== true) {
        return reject(state, 'Для покупки подойди к торговцу и начни разговор.')
    }
    if (offer === undefined || state.gold < offer.price) {
        return reject(state, 'Недостаточно золотых для этой покупки.')
    }
    if (!addInventoryItem(actor.inventory, createItemInstance(offer.itemId))) {
        return reject(
            state,
            'В рюкзаке нет места. Освободи ячейку перед покупкой.'
        )
    }
    state.gold -= offer.price
    setNotice(
        state,
        `Куплено: ${offer.label}. Потрачено ${String(offer.price)} золотых.`
    )
    return [{ actorId: actor.id, itemId: offer.itemId, kind: 'item_pickup' }]
}

function reject(state: PlayerAdventure, notice: string): GameEventPayload[] {
    setNotice(state, notice)
    return []
}
