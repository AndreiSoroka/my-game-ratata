import type {
    AdventureSnapshot,
    GameEventPayload,
    WorldObjectBounds,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import { createAdventureChoice } from './adventureChoice'
import { observeAdventureEvents } from './adventureDeaths'
import { createAdventureForest } from './adventureForest'
import { createAdventureInteractions } from './adventureInteractionServices'
import { createAdventureRequests } from './adventureRequestServices'
import type { AdventureResources } from './adventureResources'
import { createAdventureSessions } from './adventureSessions'
import { type PlayerAdventure } from './adventureState'
import { AdventureTrading } from './adventureTrading'
import { adventureSnapshot } from './adventureViews'
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
import { observeCityIntroductions } from './citySpeechObservation'
import { CityStoryQuests } from './cityStoryQuests'
import { CityWorldState } from './cityWorldState'
import { CraftOrderCommands } from './customerOrderCommands'
import type { NavigationService } from './navigation'
import { QuestFunding } from './questFunding'
import type { WorkerProductionCheck } from './workerRequestData'
import { createWorkerDelivery } from './workerSupplies'
import type { WorldObjects } from './worldObjects'

export class AdventureService {
    public readonly questFunding = new QuestFunding()
    private readonly players = new Map<string, PlayerAdventure>()
    private readonly observedDeaths = new WeakMap<GameCharacter, number>()
    private resources: AdventureResources
    private worldObjects: WorldObjects
    private worldDataInitialized = false
    public readonly cities = new CityWorldState()
    private readonly cityStories = new CityStoryQuests(
        this.cities,
        this.players,
        this.questFunding,
        (...args) => this.grantQuestGoldOnce(...args),
        (id) => this.stateFor(id)
    )
    private readonly now: () => number
    public readonly economy: CityEconomyService
    public readonly farmSupply: CityFarmSupply
    private readonly trading: AdventureTrading
    private readonly orderCommands: CraftOrderCommands
    private workPermission: WorkerProductionCheck = () => true
    private questRewardMembers = (actorId: string): readonly string[] => [
        actorId,
    ]

    public setWorkPermission(check: WorkerProductionCheck): void {
        this.workPermission = check
    }

    public setQuestRewardMembers(
        resolve: (actorId: string) => readonly string[]
    ): void {
        this.questRewardMembers = resolve
    }

    public constructor(private readonly options: AdventureServiceOptions = {}) {
        ;[this.resources, this.worldObjects] = createAdventureEnvironment(
            options,
            () => this.economy,
            this.cities
        )
        this.now = options.now ?? Date.now
        this.economy = new CityEconomyService(
            this.now(),
            undefined,
            this.questFunding
        )
        this.farmSupply = new CityFarmSupply(this.economy, (locationId, now) =>
            this.farmSnapshot(locationId, now)
        )
        this.trading = new AdventureTrading(this.economy, (actor) =>
            this.cities.tradeRefusal(actor.locationId)
        )
        this.orderCommands = new CraftOrderCommands(
            this.economy.customerOrders,
            (actor) => this.cities.tradeRefusal(actor.locationId)
        )
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

    public readonly deliverWorkerSupplies = createWorkerDelivery(
        () => this.economy,
        (actor) => this.workPermission(actor, 'worker_delivery')
    )

    private readonly sessions = createAdventureSessions(
        this.players,
        (actor, objectId, navigation) =>
            this.worldObjects.canReadQuestBoard(
                actor,
                objectId,
                navigation,
                this.now()
            )
    )
    public readonly reconcileConversations = this.sessions.reconcile
    public readonly closeConversations = this.sessions.close
    public readonly hasCompletedQuest = this.sessions.hasCompletedQuest

    public readonly farmSnapshot = this.forest.farmSnapshot

    public canReadQuestBoard(
        actor: GameCharacter,
        objectId: string,
        navigation: NavigationService,
        now: number
    ): boolean {
        return this.worldObjects.canReadQuestBoard(
            actor,
            objectId,
            navigation,
            now
        )
    }

    public snapshot(
        playerId: string,
        locationId: string = CENTER_LOCATION_ID,
        actor?: GameCharacter,
        now = this.now()
    ): AdventureSnapshot {
        return adventureSnapshot({
            playerId,
            state: this.stateFor(playerId),
            locationId,
            actor,
            economy: this.economy,
            resources: this.resources,
            worldObjects: this.worldObjects,
            now,
            cities: this.cities,
        })
    }

    private readonly walletActions = createAdventureWalletActions(this.players)
    public readonly grantGoldOnce = this.walletActions.grantGoldOnce
    public readonly grantQuestGoldOnce = this.walletActions.grantQuestGoldOnce
    public readonly trySpendGold = this.walletActions.trySpendGold
    public readonly drainGold = this.walletActions.drainGold
    public readonly creditLootGold = this.walletActions.creditLootGold
    public readonly walletFor = (actorId: string): PlayerAdventure =>
        this.stateFor(actorId)

    private readonly requests = createAdventureRequests({
        service: this,
        services: () => this.commandServices(),
        resources: () => this.resources,
        objects: () => this.worldObjects,
        stateFor: (id) => this.stateFor(id),
        now: () => this.now(),
        permission: (actor, message) => this.workPermission(actor, message),
    })
    public readonly handle = this.requests.handle
    public readonly handleResult = this.requests.handleResult

    private commandServices() {
        return {
            farmSupply: this.farmSupply,
            trading: this.trading,
            orderCommands: this.orderCommands,
        }
    }

    private readonly interactions = createAdventureInteractions({
        service: this,
        stateFor: (id) => this.stateFor(id),
        trading: () => this.trading,
        cities: this.cities,
        now: () => this.now(),
    })
    public readonly interact = this.interactions.interactEvents
    public readonly interactResult = this.interactions.interact
    public readonly trade = this.interactions.trade
    public readonly refreshTradeAccess = this.interactions.refresh

    public readonly choose = createAdventureChoice({
        service: this,
        stateFor: (id) => this.stateFor(id),
        now: () => this.now(),
        members: (id) => this.questRewardMembers(id),
        cityStory: this.cityStories,
        award: (request) => this.grantQuestGoldOnce(request),
    })

    public observe(
        events: GameEventPayload[],
        findCharacter: (id: string) => GameCharacter | undefined,
        navigationFor?: (actor: GameCharacter) => NavigationService
    ): GameEventPayload[] {
        observeCityIntroductions(
            this.cities,
            events,
            findCharacter,
            navigationFor,
            this.now()
        )
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

    private readonly stateFor = (playerId: string): PlayerAdventure => {
        const state = getAdventureState(this.players, playerId)
        this.cityStories.synchronize(state)
        return state
    }

    public initializeWorldData(
        options: Partial<AdventureServiceOptions>
    ): void {
        if (this.worldDataInitialized || this.players.size > 0) {
            throw new Error('World adventure data is already in use')
        }
        ;[this.resources, this.worldObjects] = createAdventureEnvironment(
            { ...this.options, ...options },
            () => this.economy,
            this.cities
        )
        this.worldDataInitialized = true
    }

    public initializeCities(options: {
        seed: string
        initialBellState?: import('@my-game-ratata/contracts').CityBellState
    }): void {
        if (this.players.size > 0) {
            throw new Error('City state is already in use')
        }
        this.cityStories.initialize(options.seed, options.initialBellState)
    }

    public readonly authoredStoryDraft = (questId: string) =>
        this.cityStories.draft(questId)
    public readonly storyOfferError = (
        issuer: GameCharacter,
        targetId: string,
        questId: string
    ) => this.cityStories.available(issuer, targetId, questId)
    public readonly redeemStoryOffer = (
        issuer: GameCharacter,
        actor: GameCharacter,
        questId: string,
        rewardMode: import('@my-game-ratata/contracts').QuestRewardMode
    ) =>
        this.cityStories.redeem(
            issuer,
            actor,
            questId,
            rewardMode,
            this.questRewardMembers(actor.id)
        )
    public acceptStoryOffer(
        actor: GameCharacter,
        questId: string,
        rewardMode: import('@my-game-ratata/contracts').QuestRewardMode
    ): boolean {
        const definition = this.cities.byQuest(questId)
        return (
            definition !== undefined &&
            this.cityStories.accept(
                this.stateFor(actor.id),
                actor,
                definition,
                { rewardMode }
            )
        )
    }
}
