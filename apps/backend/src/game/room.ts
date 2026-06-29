import {
    type ClientMessage,
    CONTRACT_PROTOCOL_VERSION,
    type GameEventPayload,
    type ServerMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { ServerWebSocket } from 'bun'

import { GameCharacter as Character, type GameCharacter } from './character'
import { attemptAttack } from './combat'
import {
    type CharacterController,
    NetworkPlayerController,
} from './controllers'
import { parseClientMessage, readSocketMessage } from './messages'
import { advanceCharacter } from './movement'
import { loadNavigationService, type NavigationService } from './navigation'
import {
    createSnapshot,
    faceNearestTarget,
    findVisiblePlayer as findVisiblePlayerInRoom,
} from './queries'
import { createSkeleton, playerSpawn } from './spawns'

export interface RoomSocketData {
    socketId: string
}

type RoomSocket = ServerWebSocket<RoomSocketData>

const tickMs = 50
const playerRespawnMs = 5000
const mobRespawnMs = 15000

export class GameRoom {
    public readonly navigation: NavigationService
    private readonly characters = new Map<string, GameCharacter>()
    private readonly connections = new Map<RoomSocket, string | undefined>()
    private readonly controllers = new Map<string, CharacterController>()
    private lastTickAt = Date.now()
    private nextPlayerIndex = 1
    private timer: ReturnType<typeof setInterval> | undefined
    private tickIndex = 0

    public constructor(navigation = loadNavigationService()) {
        this.navigation = navigation
        this.spawnSkeleton()
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
            this.sendError(
                ws,
                'invalid_message',
                'Message must be text or binary JSON'
            )
            return
        }

        const result = parseClientMessage(text)

        if (result.message === undefined) {
            this.sendError(
                ws,
                'invalid_message',
                result.error ?? 'Invalid message'
            )
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

        this.characters.delete(playerId)
        this.controllers.delete(playerId)
        this.broadcastEvent({ actorId: playerId, kind: 'leave' })
    }

    public findVisiblePlayer(
        observer: GameCharacter,
        radius: number
    ): GameCharacter | undefined {
        return findVisiblePlayerInRoom(
            this.characters.values(),
            this.navigation,
            observer,
            radius
        )
    }

    public requestAttack(actor: GameCharacter): void {
        const targets = [...this.characters.values()]
        const events = attemptAttack({
            actor,
            now: Date.now(),
            respawnDelayMs:
                actor.controllerKind === 'mob1'
                    ? playerRespawnMs
                    : mobRespawnMs,
            targets,
            tileSize: this.navigation.grid.tileWidth,
        })

        for (const event of events) {
            this.broadcastEvent(event)
        }
    }

    public snapshot(now = Date.now()): WorldSnapshot {
        return createSnapshot(this.characters.values(), this.tickIndex, now)
    }

    private handleClientMessage(ws: RoomSocket, message: ClientMessage): void {
        if (message.type === 'join') {
            this.join(ws, message.nickname, message.archetype ?? 'human')
            return
        }

        const player = this.getSocketPlayer(ws)

        if (player === undefined) {
            this.sendError(
                ws,
                'not_joined',
                'Join the room before sending input'
            )
            return
        }

        this.applyPlayerMessage(player, message)
    }

    private join(
        ws: RoomSocket,
        nickname: string,
        archetype: GameCharacter['archetype']
    ): void {
        const existingId = this.connections.get(ws)

        if (existingId !== undefined) {
            this.characters.delete(existingId)
            this.controllers.delete(existingId)
        }

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
        this.controllers.set(id, new NetworkPlayerController())
        this.connections.set(ws, id)
        this.send(ws, {
            map: this.navigation.summary,
            playerId: id,
            protocolVersion: CONTRACT_PROTOCOL_VERSION,
            snapshot: this.snapshot(),
            tickMs,
            type: 'world_init',
        })
        this.broadcastEvent({ actorId: id, kind: 'join' })
    }

    private applyPlayerMessage(
        player: GameCharacter,
        message: ClientMessage
    ): void {
        if (message.type === 'move_input') {
            player.setMoveInput(message.axis)
            return
        }

        if (message.type === 'move_to') {
            player.setPath(
                this.navigation.findPathWorld(player.position, message.target)
            )
            return
        }

        if (message.type === 'attack') {
            faceNearestTarget(player, this.characters.values(), 48)
            this.requestAttack(player)
        }
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
                this.broadcastEvent(event)
            }
        }

        this.broadcast({ snapshot: this.snapshot(now), type: 'snapshot' })
    }

    private spawnSkeleton(): void {
        const { character, controller } = createSkeleton(this.navigation)

        this.characters.set(character.id, character)
        this.controllers.set(character.id, controller)
    }

    private getSocketPlayer(ws: RoomSocket): GameCharacter | undefined {
        const playerId = this.connections.get(ws)

        if (playerId === undefined) {
            return undefined
        }

        return this.characters.get(playerId)
    }

    private broadcast(message: ServerMessage): void {
        const payload = JSON.stringify(message)

        for (const ws of this.connections.keys()) {
            ws.send(payload)
        }
    }

    private broadcastEvent(event: GameEventPayload): void {
        this.broadcast({
            event,
            serverTime: Date.now(),
            type: 'event',
        })
    }

    private send(ws: RoomSocket, message: ServerMessage): void {
        ws.send(JSON.stringify(message))
    }

    private sendError(ws: RoomSocket, code: string, message: string): void {
        this.send(ws, {
            code,
            message,
            type: 'error',
        })
    }
}
