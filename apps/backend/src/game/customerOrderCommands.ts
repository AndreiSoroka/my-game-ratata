import type {
    CraftOrderClientMessage,
    GameEventPayload,
} from '@my-game-ratata/contracts'
import { workshopFor } from '@my-game-ratata/contracts'

import { resolveAdventureNpc } from './adventureNpc'
import type { PlayerAdventure } from './adventureState'
import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import { cityTradeRefusal } from './crimeRules'
import type { CustomerOrders } from './customerOrders'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'

export class CraftOrderCommands {
    private readonly receipts = new Map<
        string,
        Map<string, { signature: string; result: AdventureActionResult }>
    >()
    public constructor(
        private readonly orders: CustomerOrders,
        private readonly cityRefusal: (
            actor: GameCharacter
        ) => string | undefined = () => undefined
    ) {}
    public handle(
        actor: GameCharacter,
        wallet: PlayerAdventure,
        message: CraftOrderClientMessage,
        characters: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number
    ): AdventureActionResult {
        const signature = JSON.stringify(message)
        let receipts = this.receipts.get(actor.id)
        if (receipts === undefined) {
            receipts = new Map()
            this.receipts.set(actor.id, receipts)
        }
        const previous = receipts.get(message.requestId)
        if (previous !== undefined) {
            return previous.signature === signature
                ? { ...previous.result, events: [] }
                : rejected('Этот номер запроса уже использован.')
        }
        const result = this.perform(
            actor,
            wallet,
            message,
            characters,
            navigation,
            now
        )
        receipts.set(message.requestId, { signature, result })
        setNotice(wallet, result.error ?? successNotice(message))
        return result
    }
    private perform(
        actor: GameCharacter,
        wallet: PlayerAdventure,
        message: CraftOrderClientMessage,
        characters: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number
    ): AdventureActionResult {
        const refusal =
            (message.type === 'craft_order_cancel'
                ? undefined
                : this.cityRefusal(actor)) ?? cityTradeRefusal(actor)
        if (refusal !== undefined) {
            return rejected(refusal)
        }
        const npc = resolveAdventureNpc(
            actor,
            message.npcId,
            characters,
            now,
            navigation
        )
        const workshop = workshopFor(message.npcId)
        if (npc === undefined || actor.locationId !== workshop?.cityId) {
            return rejected('Подойди к этому мастеру в его мастерской.')
        }
        const result = this.orders.handle(actor, wallet, message, now)
        const events: GameEventPayload[] = []
        if (result.accepted && message.type === 'craft_order_claim') {
            const order = this.orders
                .snapshot(actor.id)
                .find((candidate) => candidate.id === message.orderId)
            if (order !== undefined) {
                events.push({
                    kind: 'item_pickup',
                    actorId: actor.id,
                    itemId: order.itemId,
                })
            }
        }
        return { ...result, events }
    }
}
function rejected(error: string): AdventureActionResult {
    return { accepted: false, error, events: [] }
}
function successNotice(message: CraftOrderClientMessage): string {
    if (message.type === 'craft_order_place') {
        return `Заказ принят. Предоплата ${String(Math.ceil(message.expectedTotal / 2))} золотых невозвратная; остаток — при получении.`
    }
    return message.type === 'craft_order_claim'
        ? 'Заказ получен, остаток цены оплачен.'
        : 'Заказ отменён. Предоплата не возвращается.'
}
