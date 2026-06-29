import {
    type ClientMessage,
    CONTRACT_PROTOCOL_VERSION,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { GameCharacter as Character, type GameCharacter } from './character'
import { attemptAttack } from './combat'
import {
    type CharacterController,
    NetworkPlayerController,
} from './controllers'
import { normalizeNickname } from './identity'
import { parseClientMessage, readSocketMessage } from './messages'
import { advanceCharacter } from './movement'
import { loadNavigationService, type NavigationService } from './navigation'
import {
    createSnapshot,
    faceNearestTarget,
    findVisiblePlayer as findVisiblePlayerInRoom,
} from './queries'
import {
    broadcast,
    broadcastChat,
    broadcastEvent,
    type RoomSocket,
    send,
    sendError,
} from './roomMessaging'
import { createSkeleton, playerSpawn } from './spawns'

const tickMs = 50
const playerRespawnMs = 5000
const mobRespawnMs = 15000

export class GameRoom {
    public readonly navigation: NavigationService
    private readonly characters = new Map<string, GameCharacter>()
    private readonly connections = new Map<RoomSocket, string | undefined>()
    private readonly controllers = new Map<string, CharacterController>()
    private readonly playerIdsByNickname = new Map<string, string>()
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
            respawnDelayMsFor: resolveRespawnDelayMs,
            targets,
            tileSize: this.navigation.grid.tileWidth,
        })

        for (const event of events) {
            broadcastEvent(this.connections.keys(), event)
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
            sendError(ws, 'not_joined', 'Join the room before sending input')
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
            const existingCharacter = this.characters.get(existingId)
            existingCharacter?.setMoveInput({ x: 0, y: 0 })
            existingCharacter?.clearPath()
        }

        const nicknameKey = normalizeNickname(nickname)
        const existingPlayerId = this.playerIdsByNickname.get(nicknameKey)
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
            return
        }

        if (message.type === 'chat') {
            broadcastChat(
                this.connections,
                this.characters,
                player,
                message.text
            )
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
                broadcastEvent(this.connections.keys(), event)
            }
        }

        broadcast(this.connections.keys(), {
            snapshot: this.snapshot(now),
            type: 'snapshot',
        })
    }

    private spawnSkeleton(): void {
        const { character, controller } = createSkeleton(this.navigation)

        this.characters.set(character.id, character)
        this.controllers.set(character.id, controller)
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
}

function resolveRespawnDelayMs(target: GameCharacter): number {
    return target.controllerKind === 'mob1' ? mobRespawnMs : playerRespawnMs
}
