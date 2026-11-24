import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { defaultNpcAiSettings } from '../src/ai/config'
import { createNpcAiState, type NpcAiActorState } from '../src/ai/runtimeState'
import { npcNearPlayer, prepareNpcAiTurns } from '../src/ai/schedulerPolicy'
import type { GameCharacter } from '../src/game/character'
import { NPC_OBSERVATION_RADIUS } from '../src/game/queries'
import { GameRoom } from '../src/game/room'
import { joinScenarioRoom } from './scenarioRoomHelpers'

let room: GameRoom

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    room = new GameRoom()
})

afterEach(() => {
    room.stop()
    vi.unstubAllGlobals()
})

function npcState(actorId: string) {
    const actor = room.getCharacter(actorId)
    if (actor === undefined) {
        throw new Error(`Missing test NPC ${actorId}`)
    }
    actor.position = { x: 100, y: 100 }
    return {
        actor,
        state: createNpcAiState(
            { actorId, role: 'companion', settings: defaultNpcAiSettings },
            actor
        ),
    }
}

function queueTask(state: NpcAiActorState, requesterId: string | null) {
    state.task = { id: 'task', requesterId, request: 'Continue', steps: 0 }
    state.events.push({ kind: 'world', id: 'ready', reason: 'test', at: 1 })
}

function queueReply(
    state: NpcAiActorState,
    sender: GameCharacter,
    at: number,
    system = false
) {
    state.inbox.push({
        kind: 'message',
        id: `message:${String(at)}`,
        senderId: sender.id,
        text: 'Hello',
        at,
        system,
        position: { ...sender.position },
        locationId: sender.locationId,
    })
}

it('holds remote background work during scarcity until the budget or proximity recovers', () => {
    const { actor, state } = npcState('npc_friendly_girl_1')
    const { actor: player } = joinScenarioRoom(room, 'Budget player')
    player.position = {
        x: actor.position.x + NPC_OBSERVATION_RADIUS + 1,
        y: 100,
    }
    queueTask(state, null)

    expect(prepareNpcAiTurns(room, [state], 100, true)).toEqual([])
    expect(prepareNpcAiTurns(room, [state], 100)).toEqual([state])
    expect(state.events).toHaveLength(1)

    player.position.x -= 1
    expect(prepareNpcAiTurns(room, [state], 100, true)).toEqual([state])
})

it('counts only living connected players on the NPC map', () => {
    const { actor } = npcState('npc_friendly_girl_1')
    const alice = joinScenarioRoom(room, 'Budget Alice')
    const { actor: bob } = joinScenarioRoom(room, 'Budget Bob')
    alice.actor.position = { ...actor.position }
    bob.position = { ...actor.position }
    bob.locationId = 'map-2-1'

    expect(npcNearPlayer(room, actor)).toBe(true)
    room.handleClose(alice.socket)
    expect(npcNearPlayer(room, actor)).toBe(false)

    bob.locationId = actor.locationId
    expect(npcNearPlayer(room, actor)).toBe(true)
    bob.alive = false
    expect(npcNearPlayer(room, actor)).toBe(false)
})

it('keeps player replies in FIFO order ahead of accepted errands when scarce', () => {
    const { state: earlier } = npcState('npc_friendly_girl_1')
    const { state: later } = npcState('npc_magic_slime_1')
    const { state: errand } = npcState('npc_princess_1')
    const { state: remote } = npcState('npc_veteran_1')
    const { actor: player } = joinScenarioRoom(room, 'Queue player')
    player.position = { x: 400, y: 100 }
    queueReply(earlier, player, 1, true)
    queueReply(later, player, 2)
    queueTask(errand, player.id)
    queueTask(remote, null)

    const states = [remote, errand, later, earlier]
    expect(prepareNpcAiTurns(room, states, 100, true)).toEqual([
        earlier,
        later,
        errand,
    ])
})
