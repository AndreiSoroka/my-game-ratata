import { type ClientMessage } from '@my-game-ratata/contracts'

import { archiveRoomConversations } from '../ai/memoryLifecycle'
import * as roomAi from '../ai/roomAi'
export type { GameRoomOptions } from '../ai/roomAi'
import { AdventureService } from './adventure'
import { adventureWorldOptions } from './adventureWorld'
import type { GameCharacter } from './character'
import { type attemptAttack } from './combat'
import { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import { createRoomScavenger } from './mobScavenging'
import { loadNavigationService, type NavigationService } from './navigation'
import { seedNpcPockets } from './npcPockets'
import { bindPrayerAuraEnvironment } from './prayerAuras'
import { createRoomCombatActions } from './roomAbilities'
import { decideForRoomAgent } from './roomAgent'
import { createRoomChestActions } from './roomChests'
import * as roomClientDispatch from './roomClientDispatch'
import { createRoomControlRequester } from './roomControl'
import * as roomEconomy from './roomEconomy'
import { publishRoomEvents } from './roomEvents'
import { createDefaultRoomJoiner, leaveRoom } from './roomIdentity'
import { createRoomItemPicker } from './roomItems'
import { RoomLife } from './roomLife'
import { type RoomSocket } from './roomMessaging'
import * as roomQueries from './roomQueries'
import * as roomScenarios from './roomScenarios'
import { advanceRoomSimulation } from './roomSimulation'
import { createRoomSnapshotter } from './roomSnapshot'
import { RoomSocial } from './roomSocial'
import { spawnRoomCharacters } from './roomSpawns'
import { createRoomTheftRequester } from './roomTheft'
import { configureRoomQuests, createRoomParties } from './roomWorkerRequests'
import { TheftService } from './theft'
import { WorkerRequestService } from './workerRequests'
import { WorldLocations } from './worldLocations'

const tickMs = 50

export class GameRoom {
    private readonly characters = new Map<string, GameCharacter>()
    private readonly connections = new Map<RoomSocket, string | undefined>()
    private readonly controllers = new Map<string, CharacterController>()
    private readonly playerIdsByNickname = new Map<string, string>()
    private readonly world: WorldLocations
    private readonly adventure = new AdventureService(
        adventureWorldOptions(() => this.world)
    )
    private readonly companions = new CompanionService()
    public readonly scenarios = roomScenarios.createRoomScenarioService(
        this,
        this.companions,
        () => this.characters.values(),
        this.adventure
    )
    public readonly scenarioEnvironment =
        roomScenarios.createScenarioEnvironment(() => this.world)
    private readonly life = new RoomLife(
        this.characters,
        this.connections,
        this.controllers,
        this.playerIdsByNickname,
        () => this.world,
        this.companions,
        (events) => this.publishEvents(events)
    )
    private readonly theft = new TheftService()
    public readonly workerRequests = new WorkerRequestService()
    private readonly parties = createRoomParties(this, this.adventure)
    public readonly social = new RoomSocial(
        this,
        this.adventure,
        this.parties,
        () => this.npcAi,
        () => this.characters.values()
    )
    private readonly prayerAuras = {
        characters: () => this.characters.values(),
        navigationFor: (locationId: string) =>
            this.world.get(locationId).navigation,
        sameParty: this.parties.sameParty.bind(this.parties),
    }
    private lastTickAt = Date.now()
    private timer: ReturnType<typeof setInterval> | undefined
    private tickIndex = 0
    private readonly npcAi: ReturnType<typeof roomAi.createNpcAiCoordinator>

    public constructor(
        public readonly navigation = loadNavigationService(),
        options: roomAi.GameRoomOptions = {}
    ) {
        this.world = new WorldLocations(navigation, this.adventure)
        configureRoomQuests(this, this.adventure, this.parties, this.characters)
        const graves = spawnRoomCharacters(
            this.world,
            this.navigation,
            this.characters,
            this.controllers,
            this.companions,
            options.npcSpeechSeed,
            options.npcIdentitySeed
        )
        this.life.registerGraves(graves, Date.now())
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
    }

    public start(): void {
        if (this.timer !== undefined) {
            return
        }

        this.timer = setInterval(() => this.tick(), tickMs)
        this.npcAi?.start()
    }

    public stop(): void {
        this.social.stop()
        this.npcAi?.stop()
        if (this.timer !== undefined) {
            clearInterval(this.timer)
            this.timer = undefined
        }
    }

    public handleOpen(ws: RoomSocket): void {
        this.connections.set(ws, undefined)
    }

    public handleMessage(ws: RoomSocket, raw: unknown): void {
        roomClientDispatch.dispatchRawRoomMessage(ws, raw, (message) =>
            this.handleClientMessage(ws, message)
        )
    }

    public handleClose(ws: RoomSocket): void {
        leaveRoom(
            this.connections,
            this.characters,
            ws,
            this.world.closeChestViews.bind(this.world),
            this.adventure.closeConversations.bind(this.adventure)
        )
    }

    public readonly hasLocation = (locationId: string): boolean =>
        this.world.locations.has(locationId)

    public readonly getCharacter = (id: string) => this.characters.get(id)

    public readonly hasConnectedPlayerInLocation = (
        locationId: string
    ): boolean =>
        roomQueries.hasConnectedPlayerInLocation(
            this.characters.values(),
            locationId
        )

    public readonly refreshPrayerAuraEnvironment = (): void =>
        bindPrayerAuraEnvironment(this.characters.values(), this.prayerAuras)

    public readonly adventureForWorkers = () => this.adventure
    public readonly requestAdventure = roomEconomy.createAdventureRequester(
        () => this.adventure,
        () => [...this.characters.values()],
        (actor) => this.navigationFor(actor)
    )
    public readonly requestInventoryAction =
        roomEconomy.createInventoryRequester(() => this.world)

    public decideForAgent(actorId: string, decision: unknown) {
        return decideForRoomAgent(this, this.companions, actorId, decision)
    }

    public readonly notifyNpcAi = roomAi.createNpcAiRequestReceiver(
        () => this.npcAi
    )

    public readonly requestTheft = createRoomTheftRequester(
        this.theft,
        this.adventure,
        this.characters,
        (actor) => this.navigationFor(actor)
    )

    public readonly chestActions = createRoomChestActions(() => this.world)
    public readonly requestPickup = createRoomItemPicker(() => this.world)
    public readonly requestScavenge = createRoomScavenger(
        () => this.world,
        (events) => this.publishEvents(events)
    )

    public navigationFor(
        character: Pick<GameCharacter, 'locationId'>
    ): NavigationService {
        return this.world.get(character.locationId).navigation
    }

    private readonly connectionsIn = (locationId: string) =>
        roomQueries.connectionsInLocation(
            this.connections,
            this.characters,
            locationId
        )

    public readonly findVisibleTarget = roomQueries.createRoomTargetFinder(
        () => this.characters,
        (actor) => this.navigationFor(actor)
    )

    private readonly combat = createRoomCombatActions(
        () => this.world,
        () => this.characters,
        (events) => this.publishEvents(events),
        this.life.graveRules
    )
    public readonly requestAttack = this.combat.requestAttack
    public readonly requestAbility = this.combat.requestAbility
    public readonly charactersFor = this.combat.charactersFor
    public readonly abilityContextFor = this.combat.contextFor
    public readonly requestControl = createRoomControlRequester(this)

    public readonly requestAutomation = roomScenarios.createScenarioRequester(
        this,
        this.scenarios
    )

    public readonly snapshot = createRoomSnapshotter(
        () => ({
            adventure: this.adventure,
            theft: this.theft,
            characters: this.characters,
            parties: this.parties,
            tick: this.tickIndex,
            world: this.world,
            life: this.life,
            social: this.social,
        }),
        this.scenarios
    )

    private handleClientMessage(ws: RoomSocket, message: ClientMessage): void {
        roomClientDispatch.dispatchRoomClientMessage(
            {
                room: this,
                adventure: this.adventure,
                theft: this.theft,
                characters: this.characters,
                parties: this.parties,
                companions: this.companions,
                world: this.world,
                connections: this.connections,
                join: (...args) => this.join(...args),
                abandon: (actor) => this.life.abandon(actor, Date.now()),
            },
            ws,
            message
        )
    }

    private readonly join = createDefaultRoomJoiner({
        closeConversations: (id) => this.adventure.closeConversations(id),
        characters: this.characters,
        connections: this.connections,
        controllers: this.controllers,
        nicknames: this.playerIdsByNickname,
        room: this,
        world: () => this.world,
        tickMs,
    })

    private tick(now = Date.now()): void {
        const deltaMs = Math.max(1, Math.min(250, now - this.lastTickAt))
        this.lastTickAt = now
        this.tickIndex += 1
        this.npcAi?.beforeTick(now)

        advanceRoomSimulation({
            companions: this.companions,
            characters: this.characters,
            connections: this.connections,
            controllers: this.controllers,
            theft: this.theft,
            deltaMs,
            nicknames: this.playerIdsByNickname,
            life: this.life,
            now,
            onEvents: (events) => this.publishEvents(events),
            parties: this.parties,
            room: this,
            snapshot: (time, locationId, playerId) =>
                this.snapshot(time, locationId, playerId),
            world: this.world,
        })
        this.npcAi?.afterTick(now)
    }

    public publishEvents(events: ReturnType<typeof attemptAttack>): void {
        archiveRoomConversations(events, this.characters.values(), (id, now) =>
            this.npcAi?.archivePerson(id, now)
        )
        this.social.observe(events)
        publishRoomEvents(
            events,
            this.characters,
            this.adventure,
            this.parties,
            (locationId) => this.connectionsIn(locationId).keys(),
            this.connections,
            this.world,
            (character, now) =>
                this.companions.hasActiveLease(character, now, this)
        )
    }
}
