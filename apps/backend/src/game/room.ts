import {
    DEFAULT_WORLD_EMPTY_MODE,
    type GameEventPayload,
    type GameLocale,
    type WorldEmptyMode,
} from '@my-game-ratata/contracts'

import * as roomAi from '../ai/roomAi'
export type { GameRoomOptions } from '../ai/roomAi'
import type { GameCharacter } from './character'
import { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import { loadNavigationService } from './navigation'
import { seedNpcPockets } from './npcPockets'
import { createRoomCombatActions } from './roomAbilities'
import { createRoomAgentRequester } from './roomAgent'
import { createRoomChestActions } from './roomChests'
import * as roomClientDispatch from './roomClientDispatch'
import { createRoomControlRequester } from './roomControl'
import * as roomEconomy from './roomEconomy'
import { createDefaultRoomJoiner, leaveRoom } from './roomIdentity'
import { createRoomItemPicker } from './roomItems'
import { RoomLife } from './roomLife'
import { RoomLoop, roomTickMs } from './roomLoop'
import { type RoomSocket } from './roomMessaging'
import * as roomQueries from './roomQueries'
import * as roomScenarios from './roomScenarios'
import { createRoomServices, type RoomServices } from './roomServices'
import { configureRoomQuests } from './roomWorkerRequests'
import { createRoomWorld, initializeRoomCharacters } from './roomWorldSetup'
import { RoomSpeechTranslations } from './speechTranslation'
import { TheftService } from './theft'
import { WorkerRequestService } from './workerRequests'
import { WorldClock } from './worldClock'
import { type WorldLocations } from './worldLocations'

export class GameRoom {
    private readonly clock: WorldClock
    private emptyWorldMode: WorldEmptyMode
    public readonly gameplayNow = (): number => this.clock.now()
    public readonly realNow = (): number => this.clock.realNow()
    private readonly characters = new Map<string, GameCharacter>()
    private readonly connections = new Map<RoomSocket, string | undefined>()
    public readonly speechTranslations: RoomSpeechTranslations
    private readonly controllers = new Map<string, CharacterController>()
    private readonly playerIdsByNickname = new Map<string, string>()
    private readonly world: WorldLocations
    private readonly adventure: RoomServices['adventure']
    private readonly companions = new CompanionService()
    public readonly scenarios: RoomServices['scenarios']
    public readonly scenarioEnvironment =
        roomScenarios.createScenarioEnvironment(() => this.world)
    private readonly life = new RoomLife(
        this.characters,
        this.connections,
        this.controllers,
        this.playerIdsByNickname,
        () => this.world,
        this.companions,
        (events) => this.publishEvents(events),
        (actor, now) => this.events.finalDefeat(actor, now)
    )
    private readonly theft = new TheftService()
    public readonly workerRequests = new WorkerRequestService()
    private readonly parties: RoomServices['parties']
    public readonly social: RoomServices['social']
    private readonly events: RoomServices['events']
    private readonly loop: RoomLoop
    private readonly npcAi: ReturnType<typeof roomAi.createNpcAiCoordinator>

    public constructor(
        public readonly navigation = loadNavigationService(),
        options: roomAi.GameRoomOptions = {}
    ) {
        this.speechTranslations = new RoomSpeechTranslations(
            this.connections,
            this.getCharacter,
            options.speechTranslator
        )
        this.clock = new WorldClock(options.worldClock ?? Date.now)
        this.emptyWorldMode = options.emptyWorldMode ?? DEFAULT_WORLD_EMPTY_MODE
        this.clock.setMode(this.emptyWorldMode, false)
        const session = createRoomServices({
            room: this,
            characters: this.characters,
            connections: this.connections,
            world: () => this.world,
            companions: this.companions,
            life: this.life,
            theft: this.theft,
            ai: () => this.npcAi,
            tick: () => this.loop.tick,
        })
        this.adventure = session.adventure
        this.scenarios = session.scenarios
        this.parties = session.parties
        this.social = session.social
        this.events = session.events
        this.requestTheft = session.requestTheft
        this.requestScavenge = session.requestScavenge
        this.requestAutomation = session.requestAutomation
        this.snapshot = session.snapshot
        this.world = createRoomWorld(navigation, this.adventure, options)
        configureRoomQuests(this, this.adventure, this.parties, this.characters)
        const graves = initializeRoomCharacters({
            world: this.world,
            navigation: this.navigation,
            characters: this.characters,
            controllers: this.controllers,
            companions: this.companions,
            adventure: this.adventure,
            options,
            onRegistered: this.refreshPrayerAuraEnvironment,
            now: this.gameplayNow,
        })
        this.life.registerGraves(graves, this.gameplayNow())
        seedNpcPockets(this.characters.values())
        this.refreshPrayerAuraEnvironment()
        roomScenarios.registerWandererScenarios(
            this,
            this.scenarios,
            this.characters.values()
        )
        this.npcAi = roomAi.createNpcAiCoordinator(
            this,
            this.companions,
            options
        )
        this.loop = new RoomLoop(
            this.clock,
            () => this.simulationFrame(),
            () => this.npcAi,
            this.refreshPresence
        )
    }

    public start(): void {
        this.loop.start()
    }

    public stop(): void {
        this.speechTranslations.stop()
        this.social.stop()
        this.loop.stop()
    }

    public handleOpen(ws: RoomSocket): void {
        this.connections.set(ws, undefined)
    }

    public handleClose(ws: RoomSocket): void {
        leaveRoom(
            this.connections,
            this.characters,
            ws,
            this.world.closeChestViews.bind(this.world),
            this.closeConversations,
            this.gameplayNow()
        )
        this.refreshPresence()
    }

    private readonly closeConversations = (id: string): void => {
        this.adventure.closeConversations(id)
        this.social.npcSpeech.turns.close(id)
    }

    public setEmptyWorldMode(mode: WorldEmptyMode): void {
        this.emptyWorldMode = mode
        this.refreshPresence()
    }

    public allowsAutonomousNpcAi(): boolean {
        return this.clock.allowsAutonomy
    }

    private readonly refreshPresence = (): boolean => {
        const occupied = [...this.connections.values()].some(
            (id) => this.characters.get(id ?? '')?.connected === true
        )
        const { paused, resumed, suspended } = this.clock.setMode(
            this.emptyWorldMode,
            occupied
        )
        if (resumed) {
            this.loop.resume()
        }
        if (suspended) {
            this.npcAi?.suspendAutonomy(this.gameplayNow())
        }
        return paused
    }

    public readonly hasLocation = (locationId: string): boolean =>
        this.world.locations.has(locationId)

    public readonly worldMapAsset = (epoch: string, locationId: string) =>
        this.world.mapAsset(epoch, locationId)

    public readonly getCharacter = (id: string) => this.characters.get(id)

    public localeFor(actorId: string): GameLocale {
        return this.speechTranslations.localeFor(actorId)
    }

    public readonly adventureForWorkers = () => this.adventure
    public readonly requestAdventure = roomEconomy.createAdventureRequester(
        () => this.adventure,
        () => [...this.characters.values()],
        (actor) => this.navigationFor(actor),
        this.gameplayNow
    )
    public readonly requestInventoryAction =
        roomEconomy.createInventoryRequester(() => this.world)

    public readonly decideForAgent = createRoomAgentRequester(
        this,
        this.companions,
        () => this.clock.paused
    )

    public cancelNpcModelTurn(actorId: string, now: number): void {
        this.npcAi?.cancelActor(actorId, now)
    }

    public rememberNpcMeeting(actor: GameCharacter, npc: GameCharacter): void {
        this.companions.rememberMeeting(actor, npc)
    }

    public readonly requestTheft: RoomServices['requestTheft']

    public readonly chestActions = createRoomChestActions(() => this.world)
    public readonly requestPickup = createRoomItemPicker(
        () => this.world,
        this.gameplayNow
    )
    public readonly requestScavenge: RoomServices['requestScavenge']

    public readonly findVisibleTarget = roomQueries.createRoomTargetFinder(
        () => this.characters,
        (actor) => this.navigationFor(actor),
        this.gameplayNow
    )
    public readonly raisableCorpseFor = roomQueries.createNearbyCorpseFinder(
        () => this.world
    )

    private readonly combat = createRoomCombatActions(
        () => this.world,
        () => this.characters,
        (events) => this.publishEvents(events),
        {
            graves: this.life.graveRules,
            useAshRite: this.life.ashRites.use,
            sameParty: (left, right) => this.parties.sameParty(left, right),
            exchangePaused: (actorId) =>
                this.social.exchanges.isPaused(actorId),
            closeConversations: this.closeConversations,
            now: this.gameplayNow,
        }
    )
    public readonly requestAttack = this.combat.requestAttack
    public readonly navigationFor = this.combat.navigationFor
    public readonly requestAbility = this.combat.requestAbility
    public readonly charactersFor = this.combat.charactersFor
    public readonly abilityContextFor = this.combat.contextFor
    public readonly portalPassageFor = this.combat.portalPassageFor
    public readonly requestPortalUse = this.combat.requestPortalUse
    public readonly magicEffectsFor = this.combat.magicEffectsFor
    public readonly advanceMagicProjectiles =
        this.combat.advanceMagicProjectiles
    public readonly refreshPrayerAuraEnvironment = this.combat.bindActors
    public readonly requestControl = createRoomControlRequester(this)

    public readonly requestAutomation: RoomServices['requestAutomation']
    public readonly snapshot: RoomServices['snapshot']

    public readonly handleMessage = roomClientDispatch.createRoomMessageHandler(
        () => ({
            room: this,
            adventure: this.adventure,
            theft: this.theft,
            characters: this.characters,
            parties: this.parties,
            world: this.world,
            connections: this.connections,
            join: (...args) => this.join(...args),
            abandon: (actor) => this.life.abandon(actor, this.gameplayNow()),
        }),
        this.refreshPresence
    )

    private readonly join = createDefaultRoomJoiner({
        closeConversations: this.closeConversations,
        characters: this.characters,
        connections: this.connections,
        controllers: this.controllers,
        nicknames: this.playerIdsByNickname,
        room: this,
        onAttached: this.refreshPresence,
        world: () => this.world,
        tickMs: roomTickMs,
    })

    private simulationFrame() {
        return {
            companions: this.companions,
            characters: this.characters,
            connections: this.connections,
            controllers: this.controllers,
            theft: this.theft,
            nicknames: this.playerIdsByNickname,
            life: this.life,
            onEvents: (events: GameEventPayload[]) =>
                this.publishEvents(events),
            parties: this.parties,
            room: this,
            snapshot: this.snapshot,
            world: this.world,
        }
    }

    public publishEvents(events: GameEventPayload[]): void {
        this.events.publish(events)
    }
}
