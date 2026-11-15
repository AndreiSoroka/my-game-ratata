import type {
    AdventureClientMessage,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import {
    type AdventureResources,
    isResourceCommand,
} from './adventureResources'
import type { PlayerAdventure } from './adventureState'
import type {
    AdventureActionResult,
    AdventureTrading,
} from './adventureTrading'
import type { GameCharacter } from './character'
import type { CityFarmSupply } from './cityFarmSupply'
import type { CraftOrderCommands } from './customerOrderCommands'
import type { NavigationService } from './navigation'
import type { WorldObjects } from './worldObjects'

interface AdventureCommandServices {
    trading: AdventureTrading
    orderCommands: CraftOrderCommands
    farmSupply: CityFarmSupply
}

export function resolveAdventureService(
    services: AdventureCommandServices,
    actor: GameCharacter,
    state: PlayerAdventure,
    message: AdventureClientMessage,
    characters: GameCharacter[],
    navigation: NavigationService | undefined,
    now: number
): AdventureActionResult | undefined {
    switch (message.type) {
        case 'farm_supply':
            return services.farmSupply.handle(
                actor,
                state,
                message,
                characters,
                navigation,
                now
            )
        case 'craft_order_place':
        case 'craft_order_claim':
        case 'craft_order_cancel':
            return services.orderCommands.handle(
                actor,
                state,
                message,
                characters,
                navigation,
                now
            )
        case 'market_trade':
        case 'repair_items':
            return services.trading.handle(
                actor,
                state,
                message,
                characters,
                navigation,
                now
            )
        default:
            return undefined
    }
}

export function executeAdventureCommand(
    context: AdventureCommandServices & {
        service: AdventureService
        resources: AdventureResources
        worldObjects: WorldObjects
        state: PlayerAdventure
    },
    actor: GameCharacter,
    message: AdventureClientMessage,
    characters: GameCharacter[],
    navigation: NavigationService | undefined,
    now: number
): GameEventPayload[] {
    const { service, state } = context
    if (isResourceCommand(message)) {
        const events = context.resources.handle(
            actor,
            state,
            message,
            now,
            navigation
        )
        context.farmSupply.observe(events)
        return events
    }
    const result = resolveAdventureService(
        context,
        actor,
        state,
        message,
        characters,
        navigation,
        now
    )
    if (result !== undefined) {
        return result.events
    }
    switch (message.type) {
        case 'world_interact':
            return context.worldObjects.interact(
                actor,
                state,
                message.objectId,
                navigation,
                now
            )
        case 'interact':
            return service.interact(
                actor,
                message.targetId,
                characters,
                navigation,
                now,
                message.service
            )
        case 'dialogue_choice':
            return service.choose(
                actor,
                message.choiceId,
                characters,
                navigation,
                now
            )
        case 'trade':
            return service.trade(
                actor,
                message.itemId,
                characters,
                navigation,
                now
            )
        default:
            return []
    }
}
