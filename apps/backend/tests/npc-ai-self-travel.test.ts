import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { snapshotCharacterRoute } from '../src/game/characterRoute'
import { distance } from '../src/game/math'
import { canConverseWithNpc } from '../src/game/socialSpeech'
import { npcReply } from './npcAiRuntimeFixture'
import {
    guideRoadY,
    regionalGuideFixture,
    regionalTavern,
} from './npcRegionalGuideFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const fixtures: Array<ReturnType<typeof regionalGuideFixture>> = []

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})

afterEach(async () => {
    for (const fixture of fixtures.splice(0)) {
        fixture.room.stop()
        await fixture.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

async function followingCompanion(
    actorId = 'npc_princess_1',
    fromId = 'map-3-2'
) {
    const fixture = regionalGuideFixture(false, fromId, actorId)
    fixtures.push(fixture)
    const { actor, alice, advance, diagnostics, provider, records } = fixture
    alice.send({ type: 'chat', targetId: actor.id, text: 'Пойдём со мной.' })
    await advance(1000)
    provider.turns[0]?.resolve(
        npcReply(null, {
            taskAcceptance: 'accept',
            companionOrder: 'follow',
            speech: 'Пойду рядом с тобой.',
        })
    )
    await advance(1000)
    await diagnostics.flush()
    expect(actor.soul.companion?.leaderId, JSON.stringify(records)).toBe(
        alice.actor.id
    )
    return fixture
}

const tavernKey = `building:map-2-2:${regionalTavern.id}`

async function beginReturn(fixture: ReturnType<typeof regionalGuideFixture>) {
    const { actor, alice, advance, diagnostics, provider, records } = fixture
    alice.send({ type: 'chat', targetId: actor.id, text: 'А дальше куда?' })
    await advance(1000)
    const turn = provider.turns[1]
    await diagnostics.flush()
    expect(turn, JSON.stringify(records)).toBeDefined()
    expect(turn?.context.observation.knownPlaces).toContainEqual(
        expect.objectContaining({ key: tavernKey })
    )
    turn?.resolve(
        npcReply(
            { type: 'travel_to', targetKey: tavernKey, inviteEscort: true },
            {
                taskAcceptance: 'none',
                speech: 'Я возвращаюсь в «Три дороги». Хочешь проводить меня?',
            }
        )
    )
    await advance(500)
    expect(actor.soul.companion?.leaderId).toBeNull()
}

it.each(['goes east', 'dismisses accompaniment', 'disconnects'] as const)(
    'lets Leia reach the tavern by herself when the player %s',
    async (playerAction) => {
        const fixture = await followingCompanion()
        const { actor, alice, advance, diagnostics, records, room } = fixture
        await beginReturn(fixture)
        if (playerAction === 'goes east') {
            alice.send({ type: 'move_to', target: { x: 320, y: guideRoadY } })
        } else if (playerAction === 'dismisses accompaniment') {
            alice.send({
                type: 'companion_request',
                targetId: actor.id,
                request: 'dismiss',
            })
        } else {
            joinScenarioRoom(room, 'An observer in town')
            room.handleClose(alice.socket)
        }
        await advance(12_000)
        await diagnostics.flush()

        expect(alice.actor.locationId).toBe('map-3-2')
        expect(actor.locationId).toBe('map-2-2')
        expect(
            distance(actor.position, regionalTavern.interior)
        ).toBeLessThanOrEqual(1)
        expect(actor.soul.companion?.order).toBe('idle')
        expect(
            records.filter(
                (record) =>
                    record.category === 'action_completed' &&
                    record.reason === 'arrived'
            )
        ).toHaveLength(1)
    },
    20_000
)

it('keeps the escort while the player follows the same road through an exit', async () => {
    const fixture = await followingCompanion()
    const { actor, alice, advance, provider } = fixture
    await beginReturn(fixture)
    await crossIntoCity(fixture)
    alice.send({ type: 'move_to', target: regionalTavern.entry })
    alice.send({ type: 'chat', targetId: actor.id, text: 'Я рядом с тобой.' })
    await advance(500)
    expect(provider.turns[2]?.context.commandCapabilities?.travel).toEqual({
        mode: 'escorted',
        targetKey: tavernKey,
    })
    provider.turns[2]?.resolve(
        npcReply(null, {
            taskAcceptance: 'none',
            speech: 'Спасибо за компанию.',
        })
    )
    await advance(9000)
    expect(
        distance(actor.position, regionalTavern.interior)
    ).toBeLessThanOrEqual(1)
    expect(actor.soul.companion?.leaderId).toBeNull()
}, 20_000)

async function crossIntoCity(fixture: ReturnType<typeof regionalGuideFixture>) {
    const { actor, alice, advance } = fixture
    alice.send({ type: 'move_to', target: { x: 8, y: guideRoadY } })
    for (
        let elapsed = 0;
        elapsed < 2500 && alice.actor.locationId !== 'map-2-2';
        elapsed += 250
    ) {
        await advance(250)
    }
    expect(alice.actor.locationId).toBe('map-2-2')
    expect(actor.locationId).toBe(alice.actor.locationId)
}

it('continues the same interior leg when Leia chooses to finish alone', async () => {
    const fixture = await followingCompanion()
    const { actor, alice, advance, diagnostics, provider, records, room } =
        fixture
    await beginReturn(fixture)
    await crossIntoCity(fixture)
    alice.send({ type: 'move_to', target: regionalTavern.entry })
    alice.send({
        type: 'move_to',
        target: regionalTavern.interior,
        append: true,
    })
    const destination = () =>
        snapshotCharacterRoute(actor)?.route?.points.at(-1)?.position
    const inReach = () =>
        canConverseWithNpc(
            alice.actor,
            actor,
            room.navigationFor(actor),
            room.gameplayNow(),
            80
        )
    const insideTavern = () =>
        actor.position.y < regionalTavern.entry.y - 1 &&
        alice.actor.position.y < regionalTavern.entry.y - 1
    for (
        let elapsed = 0;
        elapsed < 8000 &&
        (destination()?.y !== regionalTavern.interior.y ||
            !insideTavern() ||
            !inReach());
        elapsed += 250
    ) {
        await advance(250)
    }
    expect(destination()).toEqual(regionalTavern.interior)
    expect(insideTavern()).toBe(true)
    expect(inReach()).toBe(true)
    const asked = 'Дойдёшь сама?'
    alice.send({ type: 'chat', targetId: actor.id, text: asked })
    await advance(250)
    const turn = provider.turns[2]
    expect(turn?.context.commandCapabilities?.travel?.mode).toBe('escorted')
    turn?.resolve(
        npcReply(null, {
            taskAcceptance: 'none',
            speech: 'Да, дойду сама. Таверна уже рядом.',
        })
    )
    await advance(500)
    const correction = provider.turns[3]
    await diagnostics.flush()
    expect(
        correction,
        JSON.stringify({
            turns: provider.turns.map(({ context, signal }) => ({
                aborted: signal.aborted,
                correction: context.replyCorrection,
            })),
            inReach: inReach(),
            records: records.filter(({ request }) => request === asked),
        })
    ).toBeDefined()
    expect(correction?.context.replyCorrection?.reason?.detail).toMatch(
        /Самостоятельный путь/u
    )
    correction?.resolve(
        npcReply(
            { type: 'travel_to', targetKey: tavernKey, inviteEscort: false },
            {
                taskAcceptance: 'none',
                speech: 'Да, дальше я сама.',
            }
        )
    )
    const before = actor.position.y
    await advance(500)
    expect(destination()).toEqual(regionalTavern.interior)
    expect(actor.position.y).toBeLessThan(before)
    await advance(4000)
    await diagnostics.flush()
    expect(records).toContainEqual(
        expect.objectContaining({
            category: 'request_status',
            request: asked,
            reason: 'completed',
        })
    )
    expect(
        distance(actor.position, regionalTavern.interior)
    ).toBeLessThanOrEqual(1)
}, 20_000)

it('keeps current follow when a self-travel destination is unknown', async () => {
    const { actor, alice, advance, provider } = await followingCompanion()
    alice.send({
        type: 'chat',
        targetId: actor.id,
        text: 'Куда ты теперь идёшь?',
    })
    await advance(1000)
    provider.turns[1]?.resolve(
        npcReply(
            {
                type: 'travel_to',
                targetKey: 'building:no-such-tavern',
                inviteEscort: false,
            },
            {
                taskAcceptance: 'none',
            }
        )
    )
    await advance(1000)
    expect(provider.turns[2]?.context.replyCorrection?.reason?.detail).toBe(
        'Это место мне пока неизвестно.'
    )
    expect(actor.soul.companion?.leaderId).toBe(alice.actor.id)
    expect(actor.locationId).toBe('map-3-2')
})

it.each(['npc_veteran_1', 'npc_magic_slime_1'])(
    'lets %s leave a player without inheriting the old follow route',
    async (actorId) => {
        const { actor, alice, advance, provider } = await followingCompanion(
            actorId,
            'map-2-2'
        )
        alice.send({
            type: 'chat',
            targetId: actor.id,
            text: 'Дальше я пойду один.',
        })
        await advance(500)
        provider.turns[1]?.resolve(
            npcReply(
                { type: 'leave_companion' },
                {
                    taskAcceptance: 'none',
                    speech: 'Я пока останусь здесь.',
                }
            )
        )
        await advance(500)
        expect(actor.soul.companion).toMatchObject({
            leaderId: null,
            order: 'idle',
        })
        const position = { ...actor.position }
        alice.send({ type: 'move_to', target: { x: 320, y: guideRoadY } })
        await advance(2500)
        expect(actor.position).toEqual(position)
    }
)
