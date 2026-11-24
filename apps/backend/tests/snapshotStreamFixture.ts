import {
    CONTRACT_PROTOCOL_VERSION,
    type ServerMessage,
    type WorldInitServerMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import type { RoomSocket } from '../src/game/roomMessaging'

export function streamFixture(socketId = 'socket') {
    const frames: ServerMessage[] = []
    const close = vi.fn()
    const getBufferedAmount = vi.fn(() => 0)
    const send = vi.fn((payload: string): number => {
        frames.push(JSON.parse(payload) as ServerMessage)
        return 1
    })
    const socket = {
        data: { socketId },
        send,
        close,
        getBufferedAmount,
    } as unknown as RoomSocket
    const actor = new GameCharacter({
        id: 'hero',
        nickname: 'Hero',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 100, y: 120 },
    })
    function snapshot(tick = 1): WorldSnapshot {
        return {
            serverEpoch: 'epoch',
            tick,
            serverTime: tick * 50,
            stepMs: 50,
            characters: [actor.snapshot(tick * 50)],
            chests: [],
            items: [],
        }
    }
    function last(): ServerMessage {
        const frame = frames.at(-1)
        if (frame === undefined) {
            throw new Error('Expected wire frame')
        }
        return frame
    }
    return {
        actor,
        close,
        frames,
        getBufferedAmount,
        last,
        send,
        snapshot,
        socket,
    }
}

export function initialMessage(
    snapshot: WorldSnapshot
): Omit<WorldInitServerMessage, 'streamId' | 'seq'> {
    return {
        type: 'world_init',
        playerId: 'hero',
        protocolVersion: CONTRACT_PROTOCOL_VERSION,
        snapshot,
        tickMs: 50,
        map: {
            id: 'map-2-2',
            asset: { url: '/test.json', revision: 'test' },
            width: 10,
            height: 10,
            tileWidth: 16,
            tileHeight: 16,
            worldWidth: 160,
            worldHeight: 160,
            solidLayerNames: [],
        },
    }
}

export function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Expected test value')
    }
    return value
}
