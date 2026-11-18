import {
    CENTER_LOCATION_ID,
    type CityBellState,
} from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { NpcAiDiagnostics } from '../src/ai/diagnostics'
import type { NpcAiRole } from '../src/ai/types'
import type { GameCharacter } from '../src/game/character'
import { parseNpcQuestDecision } from '../src/game/npcQuestCommands'
import { GameRoom } from '../src/game/room'
import { WorldMaps } from '../src/game/worldMaps'
import { controlledNpcProvider, miraId } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

export const questId = 'hearts-for-the-border-bell'
const fixtures: Array<{ room: GameRoom; diagnostics: NpcAiDiagnostics }> = []

export async function stopCityBellAiFixtures(): Promise<void> {
    for (const fixture of fixtures.splice(0)) {
        fixture.room.stop()
        await fixture.diagnostics.flush()
    }
}

export function setup(
    actorId: string,
    role: NpcAiRole,
    initialBellState: CityBellState = 'silent'
) {
    const provider = controlledNpcProvider()
    const diagnostics = new NpcAiDiagnostics({ sink: () => Promise.resolve() })
    const maps = new WorldMaps({
        seed: 'bell-ai',
        epoch: 'bell-ai-test',
        cityStyle: 'grid',
    })
    const config = parseNpcAiConfig(
        {
            proactive: false,
            defaults: { timeoutMs: 10_000 },
            limits: { maxCallsPerHour: 120, reviewIntervalMs: 60_000 },
            npcs: [{ actorId, role }],
        },
        true
    )
    const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        worldMaps: maps,
        initialBellState,
        npcIdentitySeed: 'bell-ai-identity',
        npcSpeechSeed: 'bell-ai-speech',
        ai: {
            config,
            provider: { decide: provider.decide },
            diagnostics,
            clock: Date.now,
        },
    })
    const player = joinScenarioRoom(room, 'Новая Искра')
    fixtures.push({ room, diagnostics })
    room.start()
    return {
        room,
        player,
        provider,
        diagnostics,
        advance: (ms = 150) => vi.advanceTimersByTimeAsync(ms),
        talk: (text: string, speaker = player) =>
            speaker.send({ type: 'chat', targetId: actorId, text }),
        speech: () =>
            player.sent.flatMap((message) =>
                message.type === 'event' &&
                message.event.kind === 'chat' &&
                message.event.actorId === actorId
                    ? [message.event]
                    : []
            ),
    }
}

export function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) {
        throw new Error('Required test fixture value is missing')
    }
    return value
}

export function actor(f: ReturnType<typeof setup>, id: string): GameCharacter {
    return required(f.room.getCharacter(id))
}

export function placeForConversation(
    f: ReturnType<typeof setup>,
    npc: GameCharacter,
    player = f.player
): void {
    // Unit fixture placement; navigation itself is checked by the map and browser suites.
    const nav = f.room.navigationFor(npc)
    const point = nav
        .walkableNeighbors(nav.worldToTile(npc.position))
        .map((tile) => nav.tileToWorld(tile))
        .find((position) => nav.hasLineOfSight(position, npc.position))
    if (point === undefined) {
        throw new Error('No clear conversation position')
    }
    player.actor.position = point
}

export function authoredDecision(targetId: string, tamper = false) {
    const decision = parseNpcQuestDecision({
        type: 'quest_propose',
        targetId,
        draft: tamper
            ? {
                  authoredId: questId,
                  title: 'Модель меняет условия',
                  description: 'Одна кость за триста.',
                  objectives: [
                      {
                          kind: 'deliver',
                          itemId: 'bone',
                          quantity: 1,
                          recipientId: miraId,
                      },
                  ],
                  rewardGold: 300,
                  rewardItems: [],
                  funding: 'city',
              }
            : { authoredId: questId },
    })
    if (decision === undefined) {
        throw new Error('Invalid authored decision fixture')
    }
    return decision
}
