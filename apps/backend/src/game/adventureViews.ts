import type {
    AdventureClientMessage,
    AdventureSnapshot,
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
import { materialSnapshot } from './materialInventory'
import type { NavigationService } from './navigation'
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
    const progress = trophyProgress(
        state,
        actor?.id === playerId ? actor : undefined
    )
    const market = economy.snapshot(locationId, now)
    if (market !== undefined) {
        market.rows = market.rows.filter((row) =>
            npcMarketItemAllowed(state.dialogue?.npcId, row.itemId)
        )
    }

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
        ...(market === undefined ? {} : { market }),
        ...(actor === undefined ? {} : { repairs: repairSnapshot(actor) }),
        dialogue: trophyDialogue(state.dialogue, progress),
        worldObjects: worldObjects.snapshot(locationId),
        farmPlots: resources.snapshotFarms(locationId, now),
        gold: state.gold,
        materials: materialSnapshot(actor?.id === playerId ? actor : undefined),
        recipes: adventureRecipes,
        resourceNodes: resources.snapshot(locationId),
        notice: state.notice,
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

export function resolvedAdventureAction(
    service: AdventureService,
    state: PlayerAdventure,
    actor: GameCharacter,
    message: AdventureClientMessage,
    characters: GameCharacter[],
    navigation: NavigationService | undefined,
    now: number
): AdventureActionResult {
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
                  accepted: state.questAccepted === true,
                  ...(state.questCancelledReason === undefined
                      ? {}
                      : { notice: state.questCancelledReason }),
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
