import { expect, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import {
    type NpcAiDiagnosticRecord,
    NpcAiDiagnostics,
} from '../src/ai/diagnostics'
import type { NpcAiContext } from '../src/ai/types'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

export function regionalGuideFixture(playerFirst = false, fromId = 'map-2-2') {
    const navigation = new NavigationService({
        id: 'regional-guide-fixture',
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(96 * 80).fill(false),
    })
    const provider = controlledNpcProvider()
    const records: NpcAiDiagnosticRecord[] = []
    const diagnostics = new NpcAiDiagnostics({
        sink: (line) => {
            records.push(JSON.parse(line) as NpcAiDiagnosticRecord)
            return Promise.resolve()
        },
    })
    const config = parseNpcAiConfig(
        {
            defaults: { timeoutMs: 10_000 },
            npcs: [{ actorId: 'npc_magic_slime_1', role: 'companion' }],
        },
        true
    )
    const room = new GameRoom(navigation, {
        ai: { config, provider, diagnostics, clock: Date.now },
    })
    const alice = joinScenarioRoom(room, 'Regional guide player')
    const actor = room.getCharacter('npc_magic_slime_1')
    if (actor === undefined) {
        throw new Error('Missing Kaplya')
    }
    // Unit setup only: all subsequent travel is resolved by normal commands and simulation.
    actor.locationId = fromId
    alice.actor.locationId = fromId
    actor.position = { x: 56, y: 648 }
    alice.actor.position = { x: playerFirst ? 16 : 64, y: 648 }
    room.start()
    return {
        room,
        actor,
        alice,
        provider,
        diagnostics,
        records,
        advance: (ms = 100) => vi.advanceTimersByTimeAsync(ms),
        async begin(targetId = 'map-1-2') {
            alice.send({
                type: 'chat',
                targetId: actor.id,
                text: 'Проведи меня в западную землю.',
            })
            await vi.advanceTimersByTimeAsync(100)
            expect(provider.turns).toHaveLength(1)
            expect(
                provider.turns[0]?.context.observation.knownPlaces?.some(
                    (place) => place.key === `location:${targetId}`
                )
            ).toBe(true)
            provider.turns[0]?.resolve(
                npcReply(
                    { type: 'guide', targetKey: `location:${targetId}` },
                    {
                        taskAcceptance: 'accept',
                        done: false,
                        speech: 'Пойдём на запад.',
                    }
                )
            )
            await vi.advanceTimersByTimeAsync(100)
        },
        closing(): NpcAiContext | undefined {
            return provider.turns.at(-1)?.context
        },
    }
}
