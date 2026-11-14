import type {
    AdventureClientMessage,
    AdventureResourceNode,
    AdventureSnapshot,
    AdventureTradeItemId,
    FarmPlotSnapshot,
    GameEventPayload,
    WorldObjectBounds,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import { observeAdventureEvents } from './adventureDeaths'
import { chooseAdventureReply, interactAdventureNpc } from './adventureDialogue'
import {
    type AdventureResources,
    isResourceCommand,
} from './adventureResources'
import { createAdventureSessions } from './adventureSessions'
import { type PlayerAdventure } from './adventureState'
import {
    type AdventureActionResult,
    AdventureTrading,
    refreshTradeDialogue,
} from './adventureTrading'
import { adventureSnapshot, resolvedAdventureAction } from './adventureViews'
import {
    createAdventureWalletActions,
    getAdventureState,
} from './adventureWallet'
import {
    type AdventureServiceOptions,
    createAdventureEnvironment,
} from './adventureWorld'
import type { GameCharacter } from './character'
import { CityEconomyService } from './cityEconomy'
import { CraftOrderCommands } from './customerOrderCommands'
import type { NavigationService } from './navigation'
import type { WorldObjects } from './worldObjects'

export class AdventureService {
    private readonly players = new Map<string, PlayerAdventure>()
    private readonly observedDeaths = new WeakMap<GameCharacter, number>()
    private readonly resources: AdventureResources
    private readonly worldObjects: WorldObjects
    private readonly now: () => number
    public readonly economy: CityEconomyService
    private readonly trading: AdventureTrading
    private readonly orderCommands: CraftOrderCommands

    public constructor(options: AdventureServiceOptions = {}) {
        ;[this.resources, this.worldObjects] = createAdventureEnvironment(
            options,
            () => this.economy
        )
        this.now = options.now ?? Date.now
        this.economy = new CityEconomyService(this.now())
        this.trading = new AdventureTrading(this.economy)
        this.orderCommands = new CraftOrderCommands(this.economy.customerOrders)
    }

    public update(
        now: number,
        navigationForLocation: (id: string) => NavigationService,
        characters: Iterable<GameCharacter>,
        occupants: (
            locationId: string
        ) => readonly WorldObjectBounds[] = () => []
    ): void {
        this.resources.update(now, navigationForLocation, characters, occupants)
        this.economy.update(now)
    }

    public resourceSnapshot(locationId: string): AdventureResourceNode[] {
        return this.resources.snapshot(locationId)
    }

    private readonly sessions = createAdventureSessions(this.players)
    public readonly reconcileConversations = this.sessions.reconcile
    public readonly closeConversations = this.sessions.close
    public readonly hasCompletedQuest = this.sessions.hasCompletedQuest

    public farmSnapshot(locationId: string, now: number): FarmPlotSnapshot[] {
        return this.resources.snapshotFarms(locationId, now)
    }

    public snapshot(
        playerId: string,
        locationId: string = CENTER_LOCATION_ID,
        actor?: GameCharacter
    ): AdventureSnapshot {
        return adventureSnapshot({
            playerId,
            state: this.stateFor(playerId),
            locationId,
            actor,
            economy: this.economy,
            resources: this.resources,
            worldObjects: this.worldObjects,
            now: this.now(),
        })
    }

    private readonly walletActions = createAdventureWalletActions(this.players)
    public readonly grantGoldOnce = this.walletActions.grantGoldOnce
    public readonly trySpendGold = this.walletActions.trySpendGold
    public readonly drainGold = this.walletActions.drainGold
    public readonly creditLootGold = this.walletActions.creditLootGold

    public handle(
        actor: GameCharacter,
        message: AdventureClientMessage,
        locationNPCs: GameCharacter[],
        navigation?: NavigationService,
        now = this.now()
    ): GameEventPayload[] {
        if (isResourceCommand(message)) {
            return this.resources.handle(
                actor,
                this.stateFor(actor.id),
                message,
                now,
                navigation
            )
        }
        switch (message.type) {
            case 'world_interact':
                return this.worldObjects.interact(
                    actor,
                    this.stateFor(actor.id),
                    message.objectId,
                    navigation,
                    now
                )
            case 'interact':
                return this.interact(
                    actor,
                    message.targetId,
                    locationNPCs,
                    navigation,
                    now,
                    message.service
                )
            case 'dialogue_choice':
                return this.choose(
                    actor,
                    message.choiceId,
                    locationNPCs,
                    navigation,
                    now
                )
            case 'trade':
                return this.trade(
                    actor,
                    message.itemId,
                    locationNPCs,
                    navigation,
                    now
                )
            case 'craft_order_place':
            case 'craft_order_claim':
            case 'craft_order_cancel':
                return this.orderCommands.handle(
                    actor,
                    this.stateFor(actor.id),
                    message,
                    locationNPCs,
                    navigation,
                    now
                ).events
            case 'market_trade':
            case 'repair_items':
                return this.trading.handle(
                    actor,
                    this.stateFor(actor.id),
                    message,
                    locationNPCs,
                    navigation,
                    now
                ).events
        }
    }

    public handleResult(
        actor: GameCharacter,
        message: AdventureClientMessage,
        characters: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number
    ): AdventureActionResult {
        if (message.type === 'world_interact') {
            const result = this.worldObjects.open(actor, message.objectId, now)
            if (result !== undefined) {
                return result
            }
        }
        if (
            message.type === 'craft_order_place' ||
            message.type === 'craft_order_claim' ||
            message.type === 'craft_order_cancel'
        ) {
            return this.orderCommands.handle(
                actor,
                this.stateFor(actor.id),
                message,
                characters,
                navigation,
                now
            )
        }
        if (
            message.type === 'market_trade' ||
            message.type === 'repair_items'
        ) {
            return this.trading.handle(
                actor,
                this.stateFor(actor.id),
                message,
                characters,
                navigation,
                now
            )
        }
        return resolvedAdventureAction(
            this,
            this.stateFor(actor.id),
            actor,
            message,
            characters,
            navigation,
            now
        )
    }

    public interact(
        actor: GameCharacter,
        npcId: string,
        locationNPCs: GameCharacter[],
        navigation?: NavigationService,
        now = this.now(),
        service?: 'shop' | 'orders' | 'repair',
        text?: string
    ): GameEventPayload[] {
        return interactAdventureNpc(
            actor,
            npcId,
            locationNPCs,
            this.stateFor(actor.id),
            now,
            navigation,
            service,
            text
        )
    }
    public choose(
        actor: GameCharacter,
        choiceId: string,
        locationNPCs: GameCharacter[],
        navigation?: NavigationService,
        now = this.now()
    ): GameEventPayload[] {
        return chooseAdventureReply(
            actor,
            choiceId,
            locationNPCs,
            this.stateFor(actor.id),
            now,
            navigation
        )
    }

    public trade(
        actor: GameCharacter,
        itemId: AdventureTradeItemId,
        locationNPCs: GameCharacter[],
        navigation?: NavigationService,
        now = this.now()
    ): GameEventPayload[] {
        return this.trading.legacy(
            actor,
            this.stateFor(actor.id),
            itemId,
            locationNPCs,
            navigation,
            now
        )
    }

    public refreshTradeAccess(actor: GameCharacter): void {
        refreshTradeDialogue(actor, this.stateFor(actor.id).dialogue)
    }

    public observe(
        events: GameEventPayload[],
        findCharacter: (id: string) => GameCharacter | undefined
    ): GameEventPayload[] {
        return observeAdventureEvents(
            events,
            findCharacter,
            this.observedDeaths,
            (id) => this.stateFor(id),
            (id) => {
                this.economy.customerOrders.retire(id, this.now())
                this.players.delete(id)
                this.trading.forget(id)
                this.economy.forgetActor(id)
                this.worldObjects.forgetActor(id)
            }
        )
    }

    private stateFor(playerId: string): PlayerAdventure {
        return getAdventureState(this.players, playerId)
    }
}
