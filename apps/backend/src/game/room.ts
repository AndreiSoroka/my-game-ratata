import {
    type ClientMessage,
    CONTRACT_PROTOCOL_VERSION,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { GameCharacter as Character, type GameCharacter } from './character'
import { attemptAttack, resolvePendingAttackHit } from './combat'
import {
    type CharacterController,
    NetworkPlayerController,
} from './controllers'
import { normalizeNickname } from './identity'
import { parseClientMessage, readSocketMessage } from './messages'
import { advanceCharacter } from './movement'
import { loadNavigationService, type NavigationService } from './navigation'
import { applyPlayerMessage } from './playerMessages'
import {
    createSnapshot,
    findVisibleTarget as findVisibleTargetInRoom,
} from './queries'
import {
    broadcast,
    broadcastEvent,
    type RoomSocket,
    send,
    sendError,
} from './roomMessaging'
import { createSkeleton, createSlime, playerSpawn } from './spawns'
import { WorldInventory } from './worldInventory'

const tickMs = 50
const playerRespawnMs = 5000
const mobRespawnMs = 15000

export class GameRoom {
    public readonly navigation: NavigationService
    private readonly characters = new Map<string, GameCharacter>()
    private readonly connections = new Map<RoomSocket, string | undefined>()
    private readonly controllers = new Map<string, CharacterController>()
    private readonly playerIdsByNickname = new Map<string, string>()
    private readonly worldInventory: WorldInventory
    private lastTickAt = Date.now()
    private nextPlayerIndex = 1
    private timer: ReturnType<typeof setInterval> | undefined
    private tickIndex = 0

    public constructor(navigation = loadNavigationService()) {
        this.navigation = navigation
        this.worldInventory = new WorldInventory(navigation)
        this.spawnNpcs()
    }

    public start(): void {
        if (this.timer !== undefined) {
            return
        }

        this.timer = setInterval(() => this.tick(), tickMs)
    }

    public stop(): void {
        if (this.timer === undefined) {
            return
        }

        clearInterval(this.timer)
        this.timer = undefined
    }

    public handleOpen(ws: RoomSocket): void {
        this.connections.set(ws, undefined)
    }

    public handleMessage(ws: RoomSocket, raw: unknown): void {
        const text = readSocketMessage(raw)

        if (text === undefined) {
            sendError(
                ws,
                'invalid_message',
                'Message must be text or binary JSON'
            )
            return
        }

        const result = parseClientMessage(text)

        if (result.message === undefined) {
            sendError(ws, 'invalid_message', result.error ?? 'Invalid message')
            return
        }

        this.handleClientMessage(ws, result.message)
    }

    public handleClose(ws: RoomSocket): void {
        const playerId = this.connections.get(ws)
        this.connections.delete(ws)

        if (playerId === undefined) {
            return
        }

        const player = this.characters.get(playerId)
        player?.setMoveInput({ x: 0, y: 0 })
        player?.clearPath()
        broadcastEvent(this.connections.keys(), {
            actorId: playerId,
            kind: 'leave',
        })
    }

    public findVisibleTarget(
        observer: GameCharacter,
        radius: number
    ): GameCharacter | undefined {
        return findVisibleTargetInRoom(
            this.characters.values(),
            this.navigation,
            observer,
            radius
        )
    }

    public requestAttack(actor: GameCharacter, now = Date.now()): void {
        const targets = [...this.characters.values()]
        const events = attemptAttack({
            actor,
            now,
            respawnDelayMsFor: resolveRespawnDelayMs,
            targets,
            tileSize: this.navigation.grid.tileWidth,
        })
        const chestEvents =
            events.length === 0
                ? []
                : this.worldInventory.openChestsHitBy(actor)

        this.broadcastEvents([...events, ...chestEvents])
    }

    public snapshot(now = Date.now()): WorldSnapshot {
        return createSnapshot(
            this.characters.values(),
            this.worldInventory.snapshotItems(),
            this.worldInventory.snapshotChests(),
            this.tickIndex,
            now
        )
    }

    private handleClientMessage(ws: RoomSocket, message: ClientMessage): void {
        if (message.type === 'join') {
            this.join(ws, message.nickname, message.archetype ?? 'human')
            return
        }

        const player = this.getSocketPlayer(ws)

        if (player === undefined) {
            sendError(ws, 'not_joined', 'Join the room before sending input')
            return
        }

        applyPlayerMessage({
            characters: this.characters,
            connections: this.connections,
            message,
            navigation: this.navigation,
            player,
            requestAttack: (actor) => {
                this.requestAttack(actor)
            },
            sendEvents: (events) => {
                this.broadcastEvents(events)
            },
            worldInventory: this.worldInventory,
        })
    }

    private join(
        ws: RoomSocket,
        nickname: string,
        archetype: GameCharacter['archetype']
    ): void {
        const nicknameKey = normalizeNickname(nickname)
        const existingPlayerId = this.playerIdsByNickname.get(nicknameKey)

        if (
            existingPlayerId !== undefined &&
            this.isPlayerConnected(existingPlayerId, ws)
        ) {
            sendError(ws, 'name_taken', 'Nickname is already in use')
            return
        }

        const existingId = this.connections.get(ws)

        if (existingId !== undefined) {
            const existingCharacter = this.characters.get(existingId)
            existingCharacter?.setMoveInput({ x: 0, y: 0 })
            existingCharacter?.clearPath()
        }

        const existingCharacter =
            existingPlayerId === undefined
                ? undefined
                : this.characters.get(existingPlayerId)
        const character =
            existingCharacter ??
            this.createPlayerCharacter(nickname, nicknameKey, archetype)

        character.setMoveInput({ x: 0, y: 0 })
        character.clearPath()
        this.controllers.set(character.id, new NetworkPlayerController())
        this.connections.set(ws, character.id)
        send(ws, {
            map: this.navigation.summary,
            playerId: character.id,
            protocolVersion: CONTRACT_PROTOCOL_VERSION,
            snapshot: this.snapshot(),
            tickMs,
            type: 'world_init',
        })
        broadcastEvent(this.connections.keys(), {
            actorId: character.id,
            kind: 'join',
        })
    }

    private tick(now = Date.now()): void {
        const deltaMs = Math.max(1, Math.min(250, now - this.lastTickAt))
        this.lastTickAt = now
        this.tickIndex += 1

        for (const [id, controller] of this.controllers) {
            const character = this.characters.get(id)

            if (character !== undefined) {
                controller.update(character, this, now)
            }
        }

        for (const character of this.characters.values()) {
            const event = advanceCharacter({
                character,
                deltaMs,
                navigation: this.navigation,
                now,
            })

            if (event !== undefined) {
                broadcastEvent(this.connections.keys(), event)
            }
        }

        for (const character of this.characters.values()) {
            const hitEvents = resolvePendingAttackHit({
                actor: character,
                now,
                respawnDelayMsFor: resolveRespawnDelayMs,
                targets: [...this.characters.values()],
                tileSize: this.navigation.grid.tileWidth,
            })
            const lootEvents = this.worldInventory.dropLootForDeaths(
                hitEvents,
                (id) => this.characters.get(id)
            )

            this.broadcastEvents([...hitEvents, ...lootEvents])
        }

        broadcast(this.connections.keys(), {
            snapshot: this.snapshot(now),
            type: 'snapshot',
        })
    }

    private broadcastEvents(events: ReturnType<typeof attemptAttack>): void {
        for (const event of events) {
            broadcastEvent(this.connections.keys(), event)
        }
    }

    private spawnNpcs(): void {
        for (const { character, controller } of [
            createSkeleton(this.navigation),
            createSlime(this.navigation),
        ]) {
            this.characters.set(character.id, character)
            this.controllers.set(character.id, controller)
        }
    }

    private createPlayerCharacter(
        nickname: string,
        nicknameKey: string,
        archetype: GameCharacter['archetype']
    ): GameCharacter {
        const id = `player_${String(this.nextPlayerIndex)}`
        const spawnPosition = playerSpawn(this.navigation, this.nextPlayerIndex)
        this.nextPlayerIndex += 1
        const character = new Character({
            archetype,
            controllerKind: 'network_player',
            id,
            nickname,
            spawnPosition,
        })

        this.characters.set(id, character)
        this.playerIdsByNickname.set(nicknameKey, id)

        return character
    }

    private getSocketPlayer(ws: RoomSocket): GameCharacter | undefined {
        const playerId = this.connections.get(ws)

        if (playerId === undefined) {
            return undefined
        }

        return this.characters.get(playerId)
    }

    private isPlayerConnected(playerId: string, exceptWs: RoomSocket): boolean {
        for (const [connection, connectedPlayerId] of this.connections) {
            if (connection !== exceptWs && connectedPlayerId === playerId) {
                return true
            }
        }

        return false
    }
}

function resolveRespawnDelayMs(target: GameCharacter): number {
    return target.controllerKind === 'mob1' ? mobRespawnMs : playerRespawnMs
}
