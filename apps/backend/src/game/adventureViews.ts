import {
    type AdventureClientMessage,
    type AdventureSnapshot,
    authoredMessage,
    HERBALIST_MERCHANT_ID,
    type MarketSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import {
    adventureQuest,
    adventureShop,
    npcMarketItemAllowed,
} from './adventureContent'
import { adventureRecipes, type AdventureResources } from './adventureResources'
import type { PlayerAdventure } from './adventureState'
import { type AdventureActionResult, repairSnapshot } from './adventureTrading'
import type { GameCharacter } from './character'
import type { CityEconomyService } from './cityEconomy'
import type { CityWorldState } from './cityWorldState'
import { countInventoryItem } from './inventory'
import { materialSnapshot } from './materialInventory'
import type { NavigationService } from './navigation'
import { availableItemQuantity } from './rewardReservations'
import { trophyDialogue, trophyProgress } from './trophyQuest'
import type { WorldObjects } from './worldObjects'

export function adventureSnapshot(context: {
    playerId: string
    state: PlayerAdventure
    locationId: string
    actor: GameCharacter | undefined
    economy: CityEconomyService
    resources: AdventureResources
    worldObjects: WorldObjects
    cities: CityWorldState
    now: number
}): AdventureSnapshot {
    const {
        playerId,
        state,
        locationId,
        actor,
        economy,
        resources,
        worldObjects,
        cities,
        now,
    } = context
    const player = actor?.id === playerId ? actor : undefined
    const progress = trophyProgress(state, player)

    const workshop =
        state.dialogue === null
            ? undefined
            : economy.customerOrders.workshopSnapshot(
                  playerId,
                  state.dialogue.npcId,
                  now
              )
    const cityState = cities.snapshot(locationId)
    return structuredClone({
        ...(cityState === undefined ? {} : { cityState }),
        craftOrders: economy.customerOrders.snapshot(playerId),
        ...(workshop === undefined ? {} : { workshop }),
        ...marketView(
            economy.snapshot(locationId, now),
            state.dialogue?.npcId,
            state.dialogue?.canTrade === true ? player : undefined
        ),
        ...(actor === undefined ? {} : { repairs: repairSnapshot(actor) }),
        dialogue: trophyDialogue(state.dialogue, progress),
        worldObjects: worldObjects.snapshot(locationId),
        farmPlots: resources.snapshotFarms(locationId, now),
        gold: state.gold,
        ...(state.lastQuestRewardReceiptId === undefined
            ? {}
            : { lastQuestRewardReceiptId: state.lastQuestRewardReceiptId }),
        materials: materialSnapshot(player),
        recipes: adventureRecipes,
        resourceNodes: resources.snapshot(locationId),
        notice: state.notice,
        ...(state.noticeMessage === undefined
            ? {}
            : { noticeMessage: state.noticeMessage }),
        noticeId: state.noticeId,
        quest: storyQuestSnapshot(state, progress, cities),
        shop: adventureShop.map((offer) => ({
            ...offer,
            price:
                economy
                    .snapshot(locationId, now)
                    ?.rows.find((row) => row.itemId === offer.itemId)
                    ?.buyPrice ?? offer.price,
        })),
        trophies: progress.trophies,
        wardRestored: state.wardRestored,
    })
}

function marketView(
    snapshot: MarketSnapshot | undefined,
    merchantId: string | undefined,
    player: GameCharacter | undefined
): Pick<AdventureSnapshot, 'market' | 'marketInventory'> {
    if (snapshot === undefined) {
        return {}
    }
    const rows = snapshot.rows.filter(({ itemId }) =>
        npcMarketItemAllowed(merchantId, itemId)
    )
    const market = {
        ...snapshot,
        rows:
            merchantId === HERBALIST_MERCHANT_ID
                ? rows.map((row) => ({ ...row, buyPrice: null }))
                : rows,
    }
    if (player === undefined) {
        return { market }
    }
    return {
        market,
        marketInventory: Object.fromEntries(
            rows.map(({ itemId }) => [
                itemId,
                {
                    owned: countInventoryItem(player.inventory, itemId),
                    sellable: availableItemQuantity(player.inventory, itemId),
                },
            ])
        ),
    }
}

export function resolvedAdventureAction(
    service: AdventureService,
    state: PlayerAdventure,
    actor: GameCharacter,
    message: AdventureClientMessage,
    characters: GameCharacter[],
    navigation: NavigationService | undefined,
    now: number
): AdventureActionResult {
    if (message.type === 'interact') {
        return service.interactResult(
            actor,
            message.targetId,
            characters,
            navigation,
            now,
            message.service
        )
    }
    const fingerprint = () =>
        JSON.stringify({
            inventory: actor.inventory,
            equipment: actor.equipment,
            energy: actor.energy,
            gold: state.gold,
            dialogue: state.dialogue,
            resources: service.resourceSnapshot(actor.locationId),
            farms: service.farmSnapshot(actor.locationId, now),
            quest: state.questStatus,
            ward: state.wardRestored,
        })
    const before = fingerprint()
    const events = service.handle(actor, message, characters, navigation, now)
    const accepted =
        before !== fingerprint() ||
        events.some((event) => event.kind !== 'notice')
    return {
        accepted,
        error: accepted ? null : (state.notice ?? 'Действие не выполнено.'),
        events,
    }
}

function storyQuestSnapshot(
    state: PlayerAdventure,
    progress: import('./adventureContent').AdventureProgress,
    cities: CityWorldState
): import('@my-game-ratata/contracts').AdventureQuestSnapshot {
    const definition = cities.byQuest(adventureQuest.id)
    return {
        ...adventureQuest,
        ...(definition === undefined
            ? {}
            : {
                  description: definition.description,
                  descriptionMessage: authoredMessage('story.cityDescription'),
                  accepted: state.questAccepted === true,
                  ...(state.questCancelledReason === undefined
                      ? {}
                      : {
                            notice: state.questCancelledReason,
                            ...(state.questCancelledReasonMessage === undefined
                                ? {}
                                : {
                                      noticeMessage:
                                          state.questCancelledReasonMessage,
                                  }),
                        }),
              }),
        ...(state.questRewardMode === null
            ? {}
            : { rewardMode: state.questRewardMode }),
        ...(state.questRewardShares === null
            ? {}
            : { rewardShares: state.questRewardShares }),
        kills: state.kills,
        status: progress.questStatus,
    }
}
