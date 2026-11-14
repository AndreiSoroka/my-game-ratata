import {
    type CharacterControlCommand,
    type ClientMessage,
    type HeroClass,
    type TheftClientMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { type attemptAttack } from './combat'
import { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import { parseSocketMessage } from './messages'
import { createRoomScavenger } from './mobScavenging'
import { loadNavigationService, type NavigationService } from './navigation'
import { seedNpcPockets } from './npcPockets'
import { PartyService } from './parties'
import { findVisibleTarget as findVisibleTargetInRoom } from './queries'
import { createRoomCombatActions } from './roomAbilities'
import { decideForRoomAgent } from './roomAgent'
import { createRoomChestActions } from './roomChests'
import { handleCharacterMessage } from './roomClientMessages'
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
import { createRoomPlayer } from './roomPlayer'
import { charactersInLocation, connectionsInLocation } from './roomQueries'
import { advanceRoomSimulation } from './roomSimulation'
import { roomSnapshot } from './roomSnapshot'
import { spawnRoomCharacters } from './roomSpawns'
import { TheftService } from './theft'
import { centerLocationId, WorldLocations } from './worldLocations'

const tickMs = 50

export class GameRoom {
    public readonly navigation: NavigationService
    private readonly characters = new Map<string, GameCharacter>()
    private readonly connections = new Map<RoomSocket, string | undefined>()
    private readonly controllers = new Map<string, CharacterController>()
    private readonly playerIdsByNickname = new Map<string, string>()
    private readonly world: WorldLocations
    private readonly adventure = new AdventureService()
    private readonly companions = new CompanionService()
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
    private readonly parties = new PartyService((id, amount, rewardId) =>
        this.adventure.grantGoldOnce(id, amount, rewardId)
    )
    private lastTickAt = Date.now()
    private nextPlayerIndex = 1
    private timer: ReturnType<typeof setInterval> | undefined
    private tickIndex = 0

    public constructor(navigation = loadNavigationService()) {
        this.navigation = navigation
        this.world = new WorldLocations(navigation, this.adventure)
        const graves = spawnRoomCharacters(
            this.world,
            this.navigation,
            this.characters,
            this.controllers,
            this.companions
        )
        this.life.registerGraves(graves, Date.now())
        seedNpcPockets(this.characters.values())
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
        leaveRoom(this.connections, this.characters, ws, (id) =>
            this.world.closeChestViews(id)
        )
    }

    public hasLocation(locationId: string): boolean {
        return this.world.locations.has(locationId)
    }

    public getCharacter(id: string): GameCharacter | undefined {
        return this.characters.get(id)
    }

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

    public navigationFor(character: GameCharacter): NavigationService {
        return this.world.get(character.locationId).navigation
    }

    private charactersIn(locationId: string): Map<string, GameCharacter> {
        return charactersInLocation(this.characters, locationId)
    }

    private connectionsIn(
        locationId: string
    ): Map<RoomSocket, string | undefined> {
        return connectionsInLocation(
            this.connections,
            this.characters,
            locationId
        )
    }

    public findVisibleTarget(
        observer: GameCharacter,
        radius: number
    ): GameCharacter | undefined {
        return findVisibleTargetInRoom(
            this.charactersIn(observer.locationId).values(),
            this.navigationFor(observer),
            observer,
            radius
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

    public snapshot(
        now = Date.now(),
        locationId = centerLocationId,
        playerId?: string
    ): WorldSnapshot {
        return roomSnapshot(
            {
                adventure: this.adventure,
                theft: this.theft,
                characters: this.characters,
                parties: this.parties,
                tick: this.tickIndex,
                world: this.world,
                life: this.life,
            },
            now,
            locationId,
            playerId
        )
    }

    private handleClientMessage(ws: RoomSocket, message: ClientMessage): void {
        if (message.type === 'join') {
            this.join(
                ws,
                message.nickname,
                message.archetype ?? 'human',
                message.heroClass
            )
            return
        }

        const player = this.characters.get(this.connections.get(ws) ?? '')

        if (player === undefined) {
            sendError(ws, 'not_joined', 'Join the room before sending input')
            return
        }

        if (message.type === 'abandon_life') {
            this.life.abandon(player, Date.now())
            return
        }

        handleCharacterMessage(
            {
                room: this,
                adventure: this.adventure,
                theft: this.theft,
                characters: this.characters,
                parties: this.parties,
                companions: this.companions,
                world: this.world,
                connections: this.connections,
            },
            player,
            message
        )
    }

    private readonly join = createRoomJoiner({
        characters: this.characters,
        connections: this.connections,
        controllers: this.controllers,
        nicknames: this.playerIdsByNickname,
        room: this,
        world: () => this.world,
        createPlayer: (name, key, type, hero) =>
            this.createPlayerCharacter(name, key, type, hero),
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
            this.world
        )
    }

    private createPlayerCharacter(
        nickname: string,
        nicknameKey: string,
        archetype: GameCharacter['archetype'],
        heroClass?: HeroClass
    ): GameCharacter {
        return createRoomPlayer(
            this.characters,
            this.playerIdsByNickname,
            this.navigation,
            this.nextPlayerIndex++,
            { nickname, nicknameKey, archetype, heroClass }
        )
    }
}
