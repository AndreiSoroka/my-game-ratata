import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import { containsBuildingPoint } from '../src/game/mapBuildings'
import {
    controlledNpcProvider,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
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

function scoutingFixture() {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    const princess = f.room.getCharacter('npc_princess_1')
    if (princess === undefined) {
        throw new Error('Missing authored princess')
    }
    const navigation = f.room.navigationFor(f.actor)
    const building = navigation.grid.buildings?.find((entry) =>
        containsBuildingPoint(entry.bounds, princess.position)
    )
    if (building === undefined) {
        throw new Error('Missing princess home')
    }
    const outside = [48, 32, 16, 64]
        .map((offset) => ({
            x: building.entry.x,
            y: building.entry.y + offset,
        }))
        .find(
            (point) =>
                !navigation.isSolidTile(navigation.worldToTile(point)) &&
                navigation.findPathWorld(point, building.entry).length > 0
        )
    if (outside === undefined) {
        throw new Error('Missing reachable exterior')
    }
    const exteriorView = [16, 32, 48, 64, 80]
        .map((offset) => ({
            x: building.entry.x,
            y: building.entry.y + offset,
        }))
        .find(
            (point) =>
                point.y !== outside.y &&
                !containsBuildingPoint(building.bounds, point) &&
                !navigation.isSolidTile(navigation.worldToTile(point)) &&
                navigation.findPathWorld(outside, point).length > 0
        )
    if (exteriorView === undefined) {
        throw new Error('Missing exterior observation point')
    }
    // Only fixture setup changes positions; each observed arrival below follows a validated route.
    f.actor.position = { ...outside }
    f.alice.actor.position = { ...outside }
    const arrived = async (count: number) => {
        for (
            let elapsed = 0;
            elapsed < 15_000 && provider.turns.length < count;
            elapsed += 100
        ) {
            await f.advance(100)
        }
        expect(provider.turns).toHaveLength(count)
        return provider.turns[count - 1]?.context
    }
    return {
        ...f,
        provider,
        princess,
        building,
        navigation,
        outside,
        exteriorView,
        arrived,
    }
}

async function visitPalace(f: ReturnType<typeof scoutingFixture>) {
    const {
        provider,
        princess,
        building,
        navigation,
        outside,
        exteriorView,
        arrived,
    } = f
    f.talk('Сходи во дворец, посмотри, кого увидишь, и возвращайся.')
    await f.advance()
    expect(
        provider.turns[0]?.context.observation.targets.some(
            (target) => target.id === princess.id
        )
    ).toBe(false)
    provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target: { ...exteriorView } },
            {
                taskAcceptance: 'accept',
                done: false,
                speech: 'Схожу и посмотрю.',
            }
        )
    )
    const entrance = await arrived(2)
    expect(f.actor.position).toEqual(exteriorView)
    expect(f.actor.position).not.toEqual(outside)
    expect(navigation.hasLineOfSight(f.actor.position, princess.position)).toBe(
        true
    )
    const entranceFact = entrance?.facts.find(
        (fact) => fact.kind === 'scouting'
    )
    expect(entranceFact?.kind).toBe('scouting')
    if (entranceFact?.kind !== 'scouting') {
        throw new Error('Missing scouting receipt')
    }
    expect(entranceFact.scope).toBe('visible_only')
    expect(
        entranceFact.visible.some((target) => target.id === princess.id)
    ).toBe(false)
    expect(
        entranceFact.visible.every((target) => target.kind !== 'building')
    ).toBe(true)
    provider.turns[1]?.resolve(
        npcReply(
            { type: 'move_to', target: { ...building.interior } },
            { taskAcceptance: 'none', done: false }
        )
    )
    const inside = await arrived(3)
    expect(containsBuildingPoint(building.bounds, f.actor.position)).toBe(true)
    const insideFact = inside?.facts.find(
        (fact) =>
            fact.kind === 'scouting' &&
            fact.visible.some((target) => target.id === princess.id)
    )
    expect(insideFact?.kind).toBe('scouting')
    if (insideFact?.kind !== 'scouting') {
        throw new Error('Missing indoor scouting')
    }
    expect(
        insideFact.visible.find((target) => target.id === princess.id)
    ).toEqual({
        id: princess.id,
        name: princess.nickname,
        kind: 'character',
        position: princess.position,
    })
    expect(insideFact.observedAt).toBeGreaterThan(entranceFact.observedAt)
    const observedPosition = { ...insideFact.position }
    provider.turns[2]?.resolve(
        npcReply(
            { type: 'move_to', target: { ...outside } },
            { taskAcceptance: 'none', done: false }
        )
    )
    const returned = await arrived(4)
    expect(f.actor.position).toEqual(outside)
    expect(
        returned?.observation.targets.some(
            (target) => target.id === princess.id
        )
    ).toBe(false)
    expect(
        returned?.facts.some(
            (fact) =>
                fact.kind === 'scouting' &&
                fact.observedAt === insideFact.observedAt &&
                fact.position.x === observedPosition.x &&
                fact.visible.some((target) => target.id === princess.id)
        )
    ).toBe(true)
    return insideFact
}

it('earns bounded scouting on real arrivals, hides indoor residents and remembers the trip after an undelivered reply', async () => {
    const f = scoutingFixture()
    const insideFact = await visitPalace(f)
    const { provider, princess, navigation, outside, arrived } = f
    const far = [
        { x: outside.x + 208, y: outside.y },
        { x: outside.x, y: outside.y + 208 },
        { x: outside.x - 208, y: outside.y },
    ].find(
        (point) =>
            navigation.findPathWorld(f.alice.actor.position, point).length > 0
    )
    if (far === undefined) {
        throw new Error('Missing reachable player destination')
    }
    f.alice.send({ type: 'move_to', target: far })
    await f.advance(4000)
    expect(
        Math.hypot(
            f.alice.actor.position.x - f.actor.position.x,
            f.alice.actor.position.y - f.actor.position.y
        )
    ).toBeGreaterThan(120)
    const answer = 'Во дворце я видел принцессу Лею.'
    provider.turns[3]?.resolve(
        npcReply(null, {
            taskAcceptance: 'none',
            speech: answer,
            done: true,
        })
    )
    await f.advance()
    expect(f.speech().some((event) => event.text === answer)).toBe(false)
    await f.diagnostics.flush()
    expect(
        f
            .entries()
            .some(
                (entry) =>
                    entry['category'] === 'request_status' &&
                    typeof entry['reason'] === 'string' &&
                    entry['reason'].startsWith('undelivered:')
            )
    ).toBe(true)
    const memory = memoryForCharacter(f.actor)
    const observation = memory
        .entries()
        .find(
            (entry) =>
                entry.id.startsWith('scouting:') &&
                entry.text.includes(princess.nickname)
        )
    expect(observation?.source).toBe('seen')
    expect(observation?.recipientId).toBe(f.alice.actor.id)
    expect(observation?.at).toBe(insideFact.observedAt)
    expect(observation?.text).toContain('только видимое')
    f.alice.send({ type: 'move_to', target: { ...outside } })
    await f.advance(4000)
    f.talk('Ты видел принцессу Лею?')
    const recalled = await arrived(5)
    expect(
        recalled?.observation.targets.some(
            (target) => target.id === princess.id
        )
    ).toBe(false)
    expect(
        recalled?.conversation?.relevant.some(
            (entry) => entry.id === observation?.id
        )
    ).toBe(true)
    provider.turns[4]?.resolve(
        npcReply(null, { taskAcceptance: 'none', speech: answer })
    )
    await f.advance()
}, 15_000)
