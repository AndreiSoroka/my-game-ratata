import {
    type CharacterControlCommand,
    type ClientMessage,
    type TheftClientMessage,
} from '@my-game-ratata/contracts'

import { AdventureService } from './adventure'
import { adventureWorldOptions } from './adventureWorld'
import type { GameCharacter } from './character'
import { type attemptAttack } from './combat'
import { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import { parseSocketMessage } from './messages'
import { createRoomScavenger } from './mobScavenging'
import { loadNavigationService, type NavigationService } from './navigation'
import { seedNpcPockets } from './npcPockets'
import { bindPrayerAuraEnvironment } from './prayerAuras'
import { findVisibleTarget as findVisibleTargetInRoom } from './queries'
import { createRoomCombatActions } from './roomAbilities'
import { decideForRoomAgent } from './roomAgent'
import { createRoomChestActions } from './roomChests'
import { dispatchRoomClientMessage } from './roomClientDispatch'
import { controlIntent } from './roomControl'
import {
    createAdventureRequester,
    createInventoryRequester,
} from './roomEconomy'
import { publishRoomEvents } from './roomEvents'
import { createRoomJoiner, leaveRoom } from './roomIdentity'
import { createRoomItemPicker } from './roomItems'
import { RoomLife } from './roomLife'
import { type RoomSocket, sendError } from './roomMessaging'
import { createRoomPlayerFactory } from './roomPlayer'
import { charactersInLocation, connectionsInLocation } from './roomQueries'
import {
    createRoomScenarioService,
    createScenarioEnvironment,
    createScenarioRequester,
    registerWandererScenarios,
} from './roomScenarios'
import { advanceRoomSimulation } from './roomSimulation'
import { createRoomSnapshotter } from './roomSnapshot'
import { spawnRoomCharacters } from './roomSpawns'
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
    public readonly scenarios = createRoomScenarioService(
        this,
        this.companions,
        () => this.characters.values(),
        this.adventure
    )
    public readonly scenarioEnvironment = createScenarioEnvironment(
        () => this.world
    )
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
    private readonly prayerAuras = {
        characters: () => this.characters.values(),
        navigationFor: (locationId: string) =>
            this.world.get(locationId).navigation,
        sameParty: this.parties.sameParty.bind(this.parties),
    }
    private lastTickAt = Date.now()
    private timer: ReturnType<typeof setInterval> | undefined
    private tickIndex = 0

    public constructor(public readonly navigation = loadNavigationService()) {
        this.world = new WorldLocations(navigation, this.adventure)
        configureRoomQuests(this, this.adventure, this.parties, this.characters)
        const graves = spawnRoomCharacters(
            this.world,
            this.navigation,
            this.characters,
            this.controllers,
            this.companions
        )
        this.life.registerGraves(graves, Date.now())
        seedNpcPockets(this.characters.values())
        this.refreshPrayerAuraEnvironment()
        registerWandererScenarios(
            this,
            this.scenarios,
            this.characters.values()
        )
    }

    public start(): void {
        if (this.timer !== undefined) {
            return
        }

        this.timer = setInterval(() => this.tick(), tickMs)
    }

    public stop(): void {
        if (this.timer !== undefined) {
            clearInterval(this.timer)
            this.timer = undefined
        }
    }

    public handleOpen(ws: RoomSocket): void {
        this.connections.set(ws, undefined)
    }

    public handleMessage(ws: RoomSocket, raw: unknown): void {
        const result = parseSocketMessage(raw)

        if (result.message === undefined) {
            sendError(ws, 'invalid_message', result.error ?? 'Invalid message')
            return
        }

        this.handleClientMessage(ws, result.message)
    }

    public handleClose(ws: RoomSocket): void {
        leaveRoom(
            this.connections,
            this.characters,
            ws,
            (id) => this.world.closeChestViews(id),
            (id) => this.adventure.closeConversations(id)
        )
    }

    public readonly hasLocation = (locationId: string): boolean =>
        this.world.locations.has(locationId)

    public getCharacter(id: string): GameCharacter | undefined {
        return this.characters.get(id)
    }

    public readonly refreshPrayerAuraEnvironment = (): void =>
        bindPrayerAuraEnvironment(this.characters.values(), this.prayerAuras)

    public readonly adventureForWorkers = () => this.adventure
    public readonly requestAdventure = createAdventureRequester(
        () => this.adventure,
        () => [...this.characters.values()],
        (actor) => this.navigationFor(actor)
    )
    public readonly requestInventoryAction = createInventoryRequester(
        () => this.world
    )

    public decideForAgent(actorId: string, decision: unknown) {
        return decideForRoomAgent(this, this.companions, actorId, decision)
    }

    public requestTheft(
        actor: GameCharacter,
        message: TheftClientMessage,
        now: number
    ) {
        return this.theft.handle(actor, message, {
            adventure: this.adventure,
            characters: this.characters.values(),
            navigation: this.navigationFor(actor),
            now,
        })
    }

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
        connectionsInLocation(this.connections, this.characters, locationId)

    public findVisibleTarget(
        observer: GameCharacter,
        radius: number,
        now = Date.now()
    ): GameCharacter | undefined {
        return findVisibleTargetInRoom(
            charactersInLocation(this.characters, observer.locationId).values(),
            this.navigationFor(observer),
            observer,
            radius,
            now
        )
    }

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
    public requestControl(
        actor: GameCharacter,
        message: CharacterControlCommand,
        now: number
    ): boolean {
        return controlIntent(actor, message, this, now)
    }

    public readonly requestAutomation = createScenarioRequester(
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
        }),
        this.scenarios
    )

    private handleClientMessage(ws: RoomSocket, message: ClientMessage): void {
        dispatchRoomClientMessage(
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

    private readonly join = createRoomJoiner({
        closeConversations: (id) => this.adventure.closeConversations(id),
        characters: this.characters,
        connections: this.connections,
        controllers: this.controllers,
        nicknames: this.playerIdsByNickname,
        room: this,
        world: () => this.world,
        createPlayer: createRoomPlayerFactory(
            this.characters,
            this.playerIdsByNickname,
            () => this.navigation,
            (character) =>
                bindPrayerAuraEnvironment([character], this.prayerAuras)
        ),
        tickMs,
    })

    private tick(now = Date.now()): void {
        const deltaMs = Math.max(1, Math.min(250, now - this.lastTickAt))
        this.lastTickAt = now
        this.tickIndex += 1

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
    }

    public publishEvents(events: ReturnType<typeof attemptAttack>): void {
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
