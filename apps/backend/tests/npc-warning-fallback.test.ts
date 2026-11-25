import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { NPC_HUM } from '../src/game/roomNpcReplySpeech'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const leiaId = 'npc_princess_1'
const threat = 'Я тебя ударю.'
const warning = 'Держись подальше.'
const fixtures: GameRoom[] = []

function npcSpeech(player: ReturnType<typeof joinScenarioRoom>) {
    return player.sent.flatMap((message) =>
        message.type === 'event' &&
        message.event.kind === 'chat' &&
        message.event.actorId === leiaId
            ? [message.event.text]
            : []
    )
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    vi.stubGlobal('Bun', { env: {} })
})

afterEach(() => {
    for (const room of fixtures.splice(0)) {
        room.stop()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function fixture(model = true) {
    const provider = controlledNpcProvider()
    const config = parseNpcAiConfig(
        {
            proactive: false,
            npcs: [{ actorId: leiaId, role: 'companion' }],
        },
        model
    )
    const room = new GameRoom(
        new NavigationService({
            id: 'warning-probe',
            width: 40,
            height: 72,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(40 * 72).fill(false),
            solidLayerNames: [],
        }),
        { ai: { config, provider } }
    )
    fixtures.push(room)
    const npc = room.getCharacter(leiaId)
    if (npc === undefined) {
        throw new Error('Missing Leia warning fixture')
    }
    const player = joinScenarioRoom(room, 'Warning listener')
    // Arrange hearing range without changing positions after any measured action starts.
    player.actor.position = { x: npc.position.x - 16, y: npc.position.y }
    const react = npc.temperament.react.bind(npc.temperament)
    vi.spyOn(npc.temperament, 'react').mockImplementation((request, now) => ({
        ...react(request, now),
        ...(request.trigger === 'threat' && request.available.includes('warn')
            ? { action: 'warn' }
            : {}),
    }))
    room.start()
    return {
        room,
        npc,
        player,
        provider,
        say: (text = threat) =>
            player.send({ type: 'chat', targetId: leiaId, text }),
        speech: () => npcSpeech(player),
    }
}

it('rejects a weather reply and accepts a verified warning with natural words after it', async () => {
    const f = fixture()
    f.say('I will hit you.')
    await vi.advanceTimersByTimeAsync(100)
    expect(f.provider.turns[0]?.context.temperament?.warningOpenings).toContain(
        'Do not threaten me.'
    )
    f.provider.turns[0]?.resolve(
        npcReply(null, {
            speech: 'The weather is lovely.',
            taskAcceptance: 'none',
        })
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(f.speech()).toEqual([])
    const corrected = f.provider.turns[1]
    expect(corrected?.context.replyCorrection?.reason?.code).toBe(
        'warning_required'
    )
    const speech = 'Do not threaten me. We can talk when you settle down.'
    corrected?.resolve(npcReply(null, { speech, taskAcceptance: 'none' }))
    await vi.advanceTimersByTimeAsync(8500)
    expect(f.speech()).toEqual([speech])
})

it('settles the warning only after the model’s speech is published', async () => {
    const f = fixture()
    f.say()
    await vi.advanceTimersByTimeAsync(100)
    expect(f.provider.turns[0]?.context.temperament?.reaction).toMatchObject({
        action: 'warn',
    })
    f.provider.turns[0]?.resolve(
        npcReply(null, { speech: 'Не угрожай мне.', taskAcceptance: 'none' })
    )
    await vi.advanceTimersByTimeAsync(8500)
    expect(f.speech()).toEqual(['Не угрожай мне.'])
})

it('publishes one fallback at the real-time deadline and prevents a late model reply', async () => {
    const f = fixture()
    f.say()
    await vi.advanceTimersByTimeAsync(7950)
    expect(f.speech()).toEqual([])
    await vi.advanceTimersByTimeAsync(150)
    expect(f.speech()).toEqual([warning])
    expect(f.provider.turns[0]?.signal.aborted).toBe(true)
    f.provider.turns[0]?.resolve(
        npcReply(null, { speech: 'Ты меня услышал.', taskAcceptance: 'none' })
    )
    await vi.advanceTimersByTimeAsync(250)
    expect(f.speech()).toEqual([warning])
})

it('uses the same fallback when the model returns no private speech and skips the hum', async () => {
    const f = fixture()
    f.player.send({
        type: 'companion_request',
        request: 'talk',
        targetId: leiaId,
        text: threat,
    })
    await vi.advanceTimersByTimeAsync(100)
    expect(f.provider.turns).toHaveLength(1)
    f.provider.turns[0]?.resolve(
        npcReply(null, { speech: null, taskAcceptance: 'none' })
    )
    await vi.advanceTimersByTimeAsync(8500)
    expect(f.speech()).not.toContain(NPC_HUM)
    expect(f.speech().filter((line) => line === warning)).toHaveLength(1)
})

it.each([
    { model: false, condition: 'model disabled' },
    { model: true, condition: 'model budget exhausted' },
])(
    'lets a nearby bystander hear a public scripted warning ($condition)',
    async ({ model }) => {
        const f = fixture(model)
        const near = joinScenarioRoom(f.room, 'Nearby bystander')
        const far = joinScenarioRoom(f.room, 'Distant bystander')
        near.actor.position = { x: f.npc.position.x + 16, y: f.npc.position.y }
        far.actor.position = { x: f.npc.position.x - 200, y: f.npc.position.y }
        if (model) {
            for (let index = 0; index < 4; index++) {
                f.say(`Обычная реплика ${String(index)}.`)
            }
        }
        f.say()
        if (model) {
            expect(npcSpeech(near)).toEqual([])
            await vi.advanceTimersByTimeAsync(8500)
        }
        expect(
            f.provider.turns
                .flatMap(({ context }) => context.events)
                .some(
                    (event) => event.kind === 'message' && event.text === threat
                )
        ).toBe(false)
        expect(f.speech()).toEqual([warning])
        expect(npcSpeech(near)).toEqual([warning])
        expect(npcSpeech(far)).toHaveLength(1)
        expect(npcSpeech(far)).not.toContain(warning)
    },
    15_000
)

it('does not deliver a stale warning to someone who walked out of hearing', async () => {
    const f = fixture()
    f.say()
    await vi.advanceTimersByTimeAsync(100)
    f.player.send({
        type: 'move_to',
        target: { x: f.npc.position.x - 160, y: f.npc.position.y },
    })
    await vi.advanceTimersByTimeAsync(8500)
    expect(f.speech()).toEqual([])
})

it('drops the old warning when a physical reaction takes over', async () => {
    const f = fixture()
    f.say()
    await vi.advanceTimersByTimeAsync(100)
    const conflicts = f.room.social.society.conflicts
    const now = f.room.gameplayNow()
    conflicts?.apply(
        f.npc,
        f.player.actor,
        'flee',
        {
            id: 'new-threat-while-warning',
            kind: 'threat',
            locationId: f.npc.locationId,
        },
        now
    )
    expect(conflicts?.hasPhysicalReaction(f.npc, now)).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(f.provider.turns[0]?.signal.aborted).toBe(true)
    f.provider.turns[0]?.resolve(
        npcReply(null, { speech: 'Не угрожай мне.', taskAcceptance: 'none' })
    )
    await vi.advanceTimersByTimeAsync(8500)
    expect(f.speech()).toEqual([])
})

it('publishes an immediate scripted warning only to the private whisper partner', async () => {
    const f = fixture(false)
    const bystander = joinScenarioRoom(f.room, 'Warning bystander')
    bystander.actor.position = { ...f.npc.position }
    f.player.send({ type: 'whisper_open', targetId: leiaId })
    f.player.send({ type: 'whisper', targetId: leiaId, text: threat })
    const privateLines = (id: string) =>
        f.room
            .snapshot(f.room.gameplayNow(), f.npc.locationId, id)
            .social?.privateMessages?.filter(
                (message) => message.senderId === leiaId
            )
            .map((message) => message.text)
    expect(privateLines(f.player.actor.id)).toEqual([warning])
    expect(privateLines(bystander.actor.id)).toEqual([])
    await vi.advanceTimersByTimeAsync(8500)
    expect(privateLines(f.player.actor.id)).toEqual([warning])
    expect(f.speech()).toEqual([])
    expect(f.provider.turns).toEqual([])
})
