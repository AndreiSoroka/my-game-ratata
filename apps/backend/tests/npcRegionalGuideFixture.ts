import { expect, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import {
    type NpcAiDiagnosticRecord,
    NpcAiDiagnostics,
} from '../src/ai/diagnostics'
import { knownGuidePlaces } from '../src/ai/guideTargets'
import type { NpcAiContext } from '../src/ai/types'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

export const guideRoadY = 1064
export const regionalTavern = {
    id: 'three-roads',
    name: 'Таверна «Три дороги»',
    bounds: { x: 64, y: 832, width: 48, height: 216 },
    entry: { x: 88, y: 1048 },
    interior: { x: 88, y: 856 },
}

export function regionalGuideFixture(
    playerFirst = false,
    fromId = 'map-2-2',
    actorId = 'npc_magic_slime_1'
) {
    const width = 32
    const height = 72
    const navigation = new NavigationService({
        id: 'regional-guide-fixture',
        width,
        height,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(width * height).fill(false),
        buildings: [regionalTavern],
        // Put the road well south of the ordinary encounter spawns on this fixture.
        landmarks: [
            {
                id: 'west-road',
                name: 'Западная дорога',
                kind: 'gate',
                direction: 'west',
                position: { x: 8, y: guideRoadY },
            },
        ],
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
            npcs: [{ actorId, role: 'companion' }],
        },
        true
    )
    const startAt = Date.now()
    const timeScale = 5
    const now = () => startAt + (Date.now() - startAt) * timeScale
    const advance = (ms = 250) => vi.advanceTimersByTimeAsync(ms / timeScale)
    const room = new GameRoom(navigation, {
        ai: { config, provider, diagnostics, clock: now },
        worldClock: now,
    })
    const alice = joinScenarioRoom(room, 'Regional guide player')
    const actor = room.getCharacter(actorId)
    if (actor === undefined) {
        throw new Error(`Missing ${actorId}`)
    }
    // Unit setup only: all subsequent travel is resolved by normal commands and simulation.
    knownGuidePlaces(actor, room.navigationFor(actor))
    actor.locationId = fromId
    alice.actor.locationId = fromId
    actor.position = { x: 56, y: guideRoadY }
    alice.actor.position = { x: playerFirst ? 16 : 64, y: guideRoadY }
    room.start()
    return {
        room,
        actor,
        alice,
        provider,
        diagnostics,
        records,
        advance,
        async begin(targetId = 'map-1-2') {
            alice.send({
                type: 'chat',
                targetId: actor.id,
                text: 'Проведи меня в западную землю.',
            })
            await advance()
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
            await advance()
        },
        closing(): NpcAiContext | undefined {
            return provider.turns.at(-1)?.context
        },
    }
}
