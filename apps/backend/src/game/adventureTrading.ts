import {
    type AdventureDialogue,
    type AdventureTradeItemId,
    type GameEventPayload,
    ITEM_DEFINITIONS,
    itemDurability,
    itemRepairPrice,
    type MarketClientMessage,
    type RepairSnapshot,
} from '@my-game-ratata/contracts'

import { adventureNpcRoles, npcMarketItemAllowed } from './adventureContent'
import { resolveAdventureNpc } from './adventureNpc'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import type { CityEconomyService } from './cityEconomy'
import { cityTradeRefusal } from './crimeRules'
import { repairItem } from './itemDurability'
import { resetMartyrStreak } from './martyr'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import { availableGold } from './rewardReservations'

export interface AdventureActionResult {
    accepted: boolean
    error: string | null
    events: GameEventPayload[]
}
export function refreshTradeDialogue(
    actor: GameCharacter,
    dialogue: AdventureDialogue | null,
    cityReason?: string
): void {
    if (dialogue === null) {
        return
    }
    const reason = dialogue.canTrade
        ? (cityReason ?? cityTradeRefusal(actor))
        : undefined
    if (reason === undefined) {
        delete dialogue.tradeBlockedReason
    } else {
        dialogue.tradeBlockedReason = reason
    }
}
export function repairSnapshot(
    actor: GameCharacter,
    npcId = 'npc_smith_1'
): RepairSnapshot {
    const equipped = new Set(
        Object.values(actor.equipment).map((item) => item.instanceId)
    )
    const items: RepairSnapshot['items'] = []
    for (const item of [
        ...actor.inventory,
        ...Object.values(actor.equipment),
    ]) {
        const definition = ITEM_DEFINITIONS[item.itemId]
        const price = itemRepairPrice(item)
        if (definition.maxDurability === undefined || price === 0) {
            continue
        }
        items.push({
            instanceId: item.instanceId,
            itemId: item.itemId,
            label: definition.name,
            durability: itemDurability(item) ?? definition.maxDurability,
            maxDurability: definition.maxDurability,
            price,
            equipped: equipped.has(item.instanceId),
        })
    }
    return {
        npcId,
        items,
        total: items.reduce((sum, item) => sum + item.price, 0),
    }
}
/** Identity-scoped receipts prevent replay from charging or transferring twice. */
export class AdventureTrading {
    private readonly receipts = new Map<
        string,
        Map<string, { signature: string; result: AdventureActionResult }>
    >()
    public constructor(
        private readonly economy: CityEconomyService,
        private readonly cityRefusal: (
            actor: GameCharacter
        ) => string | undefined = () => undefined
    ) {}
    private nextLegacyTrade = 1
    public legacy(
        actor: GameCharacter,
        state: PlayerAdventure,
        itemId: AdventureTradeItemId,
        locationNPCs: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number
    ): GameEventPayload[] {
        const price = this.economy
            .snapshot(actor.locationId, now)
            ?.rows.find((row) => row.itemId === itemId)?.buyPrice
        if (price === undefined || price === null) {
            setNotice(state, 'Товар закончился.')
            return []
        }
        return this.handle(
            actor,
            state,
            {
                type: 'market_trade',
                npcId: state.dialogue?.npcId ?? '',
                side: 'buy',
                itemId,
                quantity: 1,
                expectedTotal: price,
                requestId: `legacy-${String(this.nextLegacyTrade++)}`,
            },
            locationNPCs,
            navigation,
            now
        ).events
    }
    public forget(actorId: string): void {
        this.receipts.delete(actorId)
    }
    public handle(
        actor: GameCharacter,
        state: PlayerAdventure,
        message: MarketClientMessage,
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
            state,
            message,
            characters,
            navigation,
            now
        )
        receipts.set(message.requestId, { signature, result })
        setNotice(
            state,
            result.error ??
                (message.type === 'repair_items'
                    ? `Снаряжение отремонтировано за ${String(message.expectedTotal)} золотых.`
                    : `${message.side === 'buy' ? 'Куплено' : 'Продано'}: ${ITEM_DEFINITIONS[message.itemId].name} × ${String(message.quantity)} · ${String(message.expectedTotal)} золотых.`)
        )
        return result
    }
    private perform(
        actor: GameCharacter,
        state: PlayerAdventure,
        message: MarketClientMessage,
        characters: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number
    ): AdventureActionResult {
        const refusal = this.cityRefusal(actor) ?? cityTradeRefusal(actor)
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
        if (npc === undefined) {
            return rejected('Подойди к живому мастеру или торговцу.')
        }
        const role = adventureNpcRoles[npc.id]
        if (message.type === 'repair_items') {
            if (role?.repair !== true) {
                return rejected('Этот собеседник не ремонтирует вещи.')
            }
            return repair(actor, state, message)
        }
        if (role?.trade !== true) {
            return rejected('Этот собеседник не торгует.')
        }
        if (!npcMarketItemAllowed(npc.id, message.itemId)) {
            return rejected('Кузнец продаёт только снаряжение.')
        }
        const outcome = this.economy.trade(actor, state, message, now)
        return {
            ...outcome,
            events:
                outcome.accepted && message.side === 'buy'
                    ? [
                          {
                              kind: 'item_pickup',
                              actorId: actor.id,
                              itemId: message.itemId,
                          },
                      ]
                    : [],
        }
    }
}
function repair(
    actor: GameCharacter,
    state: PlayerAdventure,
    message: Extract<MarketClientMessage, { type: 'repair_items' }>
): AdventureActionResult {
    const ids = new Set(message.instanceIds)
    if (ids.size === 0 || ids.size !== message.instanceIds.length) {
        return rejected('Выбери повреждённые вещи для ремонта.')
    }
    const owned = [...actor.inventory, ...Object.values(actor.equipment)]
    const selected = owned.filter((item) => ids.has(item.instanceId))
    if (
        selected.length !== ids.size ||
        selected.some((item) => itemRepairPrice(item) <= 0)
    ) {
        return rejected(
            'Одна из выбранных вещей больше не нуждается в ремонте или отсутствует.'
        )
    }
    const total = selected.reduce((sum, item) => sum + itemRepairPrice(item), 0)
    if (total !== message.expectedTotal) {
        return rejected('Стоимость ремонта изменилась. Проверь предложение.')
    }
    if (availableGold(state) < total) {
        return rejected('Недостаточно золотых для ремонта.')
    }
    resetMartyrStreak(actor)
    state.gold -= total
    for (const item of selected) {
        repairItem(item)
    }
    return { accepted: true, error: null, events: [] }
}
function rejected(error: string): AdventureActionResult {
    return { accepted: false, error, events: [] }
}
