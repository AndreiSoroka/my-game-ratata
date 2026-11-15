import type {
    AdventureClientMessage,
    AdventureSnapshot,
    AdventureTradeItemId,
    GameEventPayload,
    WorldObjectBounds,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import {
    executeAdventureCommand,
    resolveAdventureService,
} from './adventureCommands'
import { observeAdventureEvents } from './adventureDeaths'
import { chooseAdventureReply, interactAdventureNpc } from './adventureDialogue'
import { createAdventureForest } from './adventureForest'
import type { AdventureResources } from './adventureResources'
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
import { CityFarmSupply } from './cityFarmSupply'
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
    public readonly farmSupply: CityFarmSupply
    private readonly trading: AdventureTrading
    private readonly orderCommands: CraftOrderCommands

    public constructor(options: AdventureServiceOptions = {}) {
        ;[this.resources, this.worldObjects] = createAdventureEnvironment(
            options,
            () => this.economy
        )
        this.now = options.now ?? Date.now
        this.economy = new CityEconomyService(this.now())
        this.farmSupply = new CityFarmSupply(this.economy, (locationId, now) =>
            this.farmSnapshot(locationId, now)
        )
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

    private readonly forest = createAdventureForest(
        () => this.resources,
        (actor) => this.stateFor(actor.id)
    )
    public readonly resourceSnapshot = this.forest.resourceSnapshot
    public readonly inspectGather = this.forest.inspectGather
    public readonly previewPlant = this.forest.previewPlant
    public readonly workAvailableAt = this.forest.workAvailableAt
    public readonly reportWorkProblem = this.forest.reportWorkProblem

    private readonly sessions = createAdventureSessions(this.players)
    public readonly reconcileConversations = this.sessions.reconcile
    public readonly closeConversations = this.sessions.close
    public readonly hasCompletedQuest = this.sessions.hasCompletedQuest

    public readonly farmSnapshot = this.forest.farmSnapshot

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
        return executeAdventureCommand(
            {
                ...this.commandServices(),
                service: this,
                resources: this.resources,
                worldObjects: this.worldObjects,
                state: this.stateFor(actor.id),
            },
            actor,
            message,
            locationNPCs,
            navigation,
            now
        )
    }

    private commandServices() {
        return {
            farmSupply: this.farmSupply,
            trading: this.trading,
            orderCommands: this.orderCommands,
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
        const result = resolveAdventureService(
            this.commandServices(),
            actor,
            this.stateFor(actor.id),
            message,
            characters,
            navigation,
            now
        )
        if (result !== undefined) {
            return result
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
                this.farmSupply.forget(id)
                this.economy.forgetActor(id)
                this.worldObjects.forgetActor(id)
            }
        )
    }

    private readonly stateFor = (playerId: string): PlayerAdventure =>
        getAdventureState(this.players, playerId)
}
