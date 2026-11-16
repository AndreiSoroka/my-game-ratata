import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { leaveRoom } from '../src/game/roomIdentity'
import type { RoomSocket } from '../src/game/roomMessaging'
import {
    approachScenarioNpc,
    joinScenarioRoom,
    openScenarioRoom,
    roomScenario,
} from './scenarioRoomHelpers'

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('socket identity switches preserve separate simulation presence', () => {
    it('detaches the previous identity as an Echo, closes its dialogue and keeps its scenario when the same socket joins another name', () => {
        const room = openScenarioRoom(),
            first = joinScenarioRoom(room, 'Before Switch')
        const npc = approachScenarioNpc(room, first, 'npc_wanderer_1')
        first.send({ type: 'interact', targetId: npc.id })
        expect(
            room.snapshot(Date.now(), first.actor.locationId, first.actor.id)
                .adventure?.dialogue?.npcId
        ).toBe(npc.id)
        first.send({ type: 'marker_create', name: 'Old owner marker' })
        first.save(
            roomScenario(
                'old-owner-loop',
                [{ id: 'wait', kind: 'wait', durationMs: 1000 }],
                null
            )
        )
        first.send({ type: 'scenario_start', scenarioId: 'old-owner-loop' })
        first.send({ type: 'join', nickname: 'After Switch' })
        const init = first.sent
            .filter((message) => message.type === 'world_init')
            .at(-1)
        const current = room.getCharacter(init?.playerId ?? '')
        expect(current?.id).not.toBe(first.actor.id)
        expect(current?.connected).toBe(true)
        expect(current?.soul).toMatchObject({
            kind: 'spark',
            controlSource: 'human',
        })
        expect(first.actor.connected).toBe(false)
        expect(first.actor.soul).toMatchObject({
            kind: 'echo',
            controlSource: 'script',
        })
        expect(
            room.snapshot(Date.now(), first.actor.locationId, first.actor.id)
                .adventure?.dialogue
        ).toBeNull()
        expect(first.view().markers).toHaveLength(1)
        expect(first.view().run).toMatchObject({
            scenarioId: 'old-owner-loop',
            status: 'running',
        })
        vi.advanceTimersByTime(1200)
        expect(first.view().run?.iteration).toBeGreaterThanOrEqual(2)
        if (current === undefined) {
            throw new Error('Missing replacement socket identity')
        }
        expect(
            room.snapshot(Date.now(), current.locationId, current.id).automation
        ).toMatchObject({ markers: [], scenarios: [], run: null })
        room.handleClose(first.socket)
        expect(current.connected).toBe(false)
        expect(first.actor.connected).toBe(false)
        room.stop()
    })

    it('keeps the original connection attached when switching to an already connected nickname is rejected', () => {
        const room = openScenarioRoom(),
            first = joinScenarioRoom(room, 'First Online'),
            second = joinScenarioRoom(room, 'Second Online')
        first.send({ type: 'join', nickname: 'second online' })
        expect(first.sent.at(-1)).toMatchObject({
            type: 'error',
            code: 'name_taken',
        })
        expect(first.actor.connected).toBe(true)
        expect(first.actor.soul.controlSource).toBe('human')
        expect(second.actor.connected).toBe(true)
        first.send({ type: 'marker_create', name: 'Still the first owner' })
        expect(first.view().markers).toHaveLength(1)
        expect(second.view().markers).toEqual([])
        room.stop()
    })
})

describe('last socket detachment guard', () => {
    it('does not turn an identity into an Echo or revoke its sessions while another socket remains attached', () => {
        const actor = new GameCharacter({
            id: 'shared',
            nickname: 'Shared',
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: { x: 80, y: 80 },
        })
        const first = {} as RoomSocket,
            second = {} as RoomSocket
        const connections = new Map([
            [first, actor.id],
            [second, actor.id],
        ])
        const characters = new Map([[actor.id, actor]])
        const closeChest = vi.fn(),
            closeConversation = vi.fn()
        leaveRoom(connections, characters, first, closeChest, closeConversation)
        expect(actor.connected).toBe(true)
        expect(actor.soul.controlSource).toBe('human')
        expect(closeChest).not.toHaveBeenCalled()
        expect(closeConversation).not.toHaveBeenCalled()
        leaveRoom(
            connections,
            characters,
            second,
            closeChest,
            closeConversation
        )
        expect(actor.connected).toBe(false)
        expect(actor.soul).toMatchObject({
            kind: 'echo',
            controlSource: 'script',
        })
        expect(closeChest).toHaveBeenCalledExactlyOnceWith(actor.id)
        expect(closeConversation).toHaveBeenCalledExactlyOnceWith(actor.id)
    })
})
