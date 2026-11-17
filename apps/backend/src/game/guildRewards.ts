import type {
    ExchangeItemQuantity,
    GuildQuestDefinition,
    ItemInstanceSnapshot,
    QuestRewardShare,
} from '@my-game-ratata/contracts'

import type { AssetSettlementRequest } from './assetSettlement'
import type { GameCharacter } from './character'
import { snapshotItem } from './inventoryItems'
import { promisedItemsUnchanged } from './promisedReward'
import type { QuestFunding } from './questFunding'
import type { AssetWallet } from './rewardReservations'

export interface GuildRewardEnvironment {
    funding: QuestFunding
    walletFor: (id: string) => AssetWallet
}

export interface NegotiatedWorkerReward {
    rewardGold: number
    rewardItems: ExchangeItemQuantity[]
    issuerId: string
    fundingCityId: string
}

export interface GuildRewardPromise {
    issuer: GameCharacter
    cityId: string
    wallet: AssetWallet
    gold: number
    items: ExchangeItemQuantity[]
    snapshots: ItemInstanceSnapshot[]
}

function rewardSource(
    funding: QuestFunding,
    definition: GuildQuestDefinition,
    characters: ReadonlyMap<string, GameCharacter>,
    terms?: NegotiatedWorkerReward
): { issuer: GameCharacter; wallet: AssetWallet; cityId: string } | undefined {
    const request = definition.workRequest
    if (request === undefined) {
        return undefined
    }
    const issuer = characters.get(request.clerkId)
    const wallet = funding.wallet(request.cityId)
    if (
        issuer?.alive !== true ||
        wallet === undefined ||
        issuer.tags.has('state.retired')
    ) {
        return undefined
    }
    if (
        terms !== undefined &&
        (terms.issuerId !== issuer.id || terms.fundingCityId !== request.cityId)
    ) {
        return undefined
    }
    return { issuer, wallet, cityId: request.cityId }
}

export function reserveWorkerReward(
    funding: QuestFunding,
    instanceId: string,
    definition: GuildQuestDefinition,
    characters: ReadonlyMap<string, GameCharacter>,
    terms?: NegotiatedWorkerReward
): GuildRewardPromise | string {
    const source = rewardSource(funding, definition, characters, terms)
    if (source === undefined) {
        return 'Распорядитель или городской фонд обращения недоступен.'
    }
    const { issuer, wallet, cityId } = source
    const gold = terms?.rewardGold ?? definition.rewardGold
    const items = structuredClone(terms?.rewardItems ?? [])
    if (
        !Number.isSafeInteger(gold) ||
        gold < 0 ||
        gold > 300 ||
        items.length > 10
    ) {
        return 'Такая награда недоступна.'
    }
    const snapshots = items.flatMap((selected) => {
        const item = issuer.inventory.find(
            (candidate) => candidate.instanceId === selected.instanceId
        )
        return item === undefined
            ? []
            : [{ ...snapshotItem(item), quantity: selected.quantity }]
    })
    if (
        snapshots.length !== items.length ||
        !funding.reservations.reserve(
            instanceId,
            { wallet, inventory: issuer.inventory },
            gold,
            items
        )
    ) {
        return 'В городском фонде или сумке заказчика недостаточно свободной награды.'
    }
    return { issuer, cityId, wallet, gold, items, snapshots }
}

export function guildRewardUnchanged(promise: GuildRewardPromise): boolean {
    return (
        promise.issuer.alive &&
        promisedItemsUnchanged(promise.issuer.inventory, promise.snapshots)
    )
}

export function guildRewardAssets(
    promise: GuildRewardPromise,
    reservationId: string,
    shares: readonly QuestRewardShare[],
    submitter: GameCharacter,
    walletFor: (id: string) => AssetWallet
): AssetSettlementRequest {
    return {
        reservationId,
        gold: shares.flatMap((share) => {
            const to = walletFor(share.characterId)
            return share.gold > 0
                ? [{ from: promise.wallet, to, amount: share.gold }]
                : []
        }),
        items:
            promise.items.length === 0
                ? []
                : [
                      {
                          from: promise.issuer.inventory,
                          to: submitter.inventory,
                          items: promise.items,
                      },
                  ],
    }
}
