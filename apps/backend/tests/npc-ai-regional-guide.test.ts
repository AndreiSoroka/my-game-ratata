import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { npcAiDecisionError } from '../src/ai/actions'
import { knownGuideTargetError } from '../src/ai/guideTargets'
import { npcReply } from './npcAiRuntimeFixture'
import { guideRoadY, regionalGuideFixture } from './npcRegionalGuideFixture'

const fixtures: Array<ReturnType<typeof regionalGuideFixture>> = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    for (const f of fixtures.splice(0)) {
        f.room.stop()
        await f.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it.each([false, true])(
    'guides through a real west crossing; player crosses first: %s',
    async (playerFirst) => {
        const f = regionalGuideFixture(playerFirst)
        fixtures.push(f)
        const start = { ...f.actor.position }
        await f.begin()
        if (playerFirst) {
            f.alice.send({ type: 'move_to', target: { x: 8, y: guideRoadY } })
        }
        await f.advance(1000)
        expect(f.actor.locationId).toBe('map-1-2')
        expect(f.actor.position).not.toEqual(start)
        if (!playerFirst) {
            expect(f.alice.actor.locationId).toBe('map-2-2')
            expect(f.actor.hasPath()).toBe(false)
            expect(f.provider.turns).toHaveLength(1)
            f.alice.send({ type: 'move_to', target: { x: 8, y: guideRoadY } })
        }
        await f.advance(1000)
        expect(f.alice.actor.locationId).toBe('map-1-2')
        expect(f.provider.turns).toHaveLength(2)
        expect(f.closing()?.task?.concluding).toBe(true)
        expect(
            f
                .closing()
                ?.facts.some(
                    (fact) =>
                        fact.kind === 'scouting' &&
                        fact.locationId === 'map-1-2'
                )
        ).toBe(true)
        f.provider.turns[1]?.resolve(
            npcReply(null, { taskAcceptance: 'none', speech: 'Мы пришли.' })
        )
        await f.advance()
        await f.diagnostics.flush()
        expect(
            f.records.filter(
                (record) =>
                    record.category === 'action_completed' &&
                    record.reason === 'arrived_with_requester'
            )
        ).toHaveLength(1)
        expect(f.actor.soul.companion?.canFight ?? false).toBe(false)
    }
)

it('waits after each regional hop and follows a multi-hop route without a model call per tile', async () => {
    const f = regionalGuideFixture()
    fixtures.push(f)
    await f.begin('map-0-2')
    await f.advance(1500)
    expect(f.actor.locationId).toBe('map-1-2')
    const waiting = { ...f.actor.position }
    await f.advance(1000)
    expect(f.actor.position).toEqual(waiting)
    expect(f.provider.turns).toHaveLength(1)
    for (
        let elapsed = 0;
        elapsed < 10_000 && f.closing()?.task?.concluding !== true;
        elapsed += 250
    ) {
        const { actor: player } = f.alice
        const behindGuide = player.position.x > f.actor.position.x + 16
        const stillCrossing = player.locationId !== f.actor.locationId
        f.alice.send({
            type: 'move_input',
            axis: { x: behindGuide || stillCrossing ? -1 : 0, y: 0 },
        })
        await f.advance(250)
    }
    f.alice.send({ type: 'move_input', axis: { x: 0, y: 0 } })
    expect(f.actor.locationId).toBe('map-0-2')
    expect(f.alice.actor.locationId).toBe('map-0-2')
    expect(f.provider.turns).toHaveLength(2)
    expect(
        f
            .closing()
            ?.facts.filter(
                (fact) =>
                    fact.kind === 'scouting' && fact.locationId !== 'map-2-2'
            ).length
    ).toBeGreaterThanOrEqual(2)
    f.provider.turns[1]?.resolve(
        npcReply(null, { taskAcceptance: 'none', speech: 'Мы пришли.' })
    )
    await f.advance()
}, 15_000)

it('allows companion work outside the city while keeping Mira and pacifist actions constrained', () => {
    const f = regionalGuideFixture(false, 'map-3-2')
    fixtures.push(f)
    expect(
        npcAiDecisionError(
            f.actor,
            'companion',
            { type: 'move_to', target: { x: 120, y: guideRoadY } },
            f.room.navigationFor(f.actor)
        )
    ).toBeUndefined()
    expect(
        knownGuideTargetError(f.room, f.actor, 'companion', 'location:map-1-2')
    ).toBeUndefined()
    const mira = f.room.getCharacter('npc_friendly_girl_1')
    if (mira === undefined) {
        throw new Error('Missing Mira')
    }
    expect(
        knownGuideTargetError(
            f.room,
            mira,
            'city_coordinator',
            'location:map-1-2'
        )
    ).toBeDefined()
    expect(
        npcAiDecisionError(f.actor, 'companion', {
            type: 'attack',
            targetId: mira.id,
        })
    ).toBeDefined()
    expect(
        knownGuideTargetError(
            f.room,
            f.actor,
            'companion',
            'location:map-99-99'
        )
    ).toBeDefined()
})
