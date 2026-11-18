/** Manual real-model verification in an isolated world. Player and NPC movement uses ordinary commands. */
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

import { memoryForCharacter } from '../apps/backend/src/ai/characterMinds'
import { CodexCliProvider } from '../apps/backend/src/ai/codexCliProvider'
import { loadNpcAiConfig } from '../apps/backend/src/ai/config'
import {
    NpcAiDiagnostics,
    type NpcAiDiagnosticRecord,
} from '../apps/backend/src/ai/diagnostics'
import { buildNpcAiObservation } from '../apps/backend/src/ai/observation'
import type { NpcAiContext } from '../apps/backend/src/ai/types'
import type { GameCharacter } from '../apps/backend/src/game/character'
import {
    regionalExit,
    regionalRoute,
} from '../apps/backend/src/game/regionalNavigation'
import { GameRoom } from '../apps/backend/src/game/room'
import type { RoomSocket } from '../apps/backend/src/game/roomMessaging'
import type {
    ClientMessage,
    GameEventPayload,
    ServerMessage,
} from '../contracts/src/index'

const args = process.argv.slice(2)
assert.ok(
    args.length <= 1 &&
        args.every((arg) => ['--refusal-only', '--guide-only'].includes(arg)),
    'Usage: bun scripts/npc-navigation-dialogue-check.ts [--refusal-only | --guide-only]'
)
const configured = await loadNpcAiConfig()
const provider = new CodexCliProvider()
const records: NpcAiDiagnosticRecord[] = []
const contexts: NpcAiContext[] = []
const messages: Array<{ event: GameEventPayload; at: number }> = []
const calls = new Map<string, number>()
const results: Record<string, unknown>[] = []
const deadline = Date.now() + 360_000
let playerId: string | undefined
let backgroundReviews = 0
const diagnostics = new NpcAiDiagnostics({
    sink: (line) => {
        records.push(JSON.parse(line) as NpcAiDiagnosticRecord)
        return Promise.resolve()
    },
})
const room = new GameRoom(undefined, {
    npcSpeechSeed: 'speech-smoke',
    ai: {
        config: {
            ...configured,
            enabled: true,
            npcs: configured.npcs.filter((entry) =>
                ['npc_friendly_girl_1', 'npc_magic_slime_1'].includes(
                    entry.actorId
                )
            ),
        },
        diagnostics,
        provider: {
            decide: async (context, settings, signal) => {
                const addressed = context.events.some(
                    (event) =>
                        event.kind === 'message' &&
                        event.senderId === playerId &&
                        event.system !== true
                )
                const continuing =
                    playerId !== undefined &&
                    context.task?.requesterId === playerId &&
                    context.task?.background === undefined
                if (!addressed && !continuing) {
                    backgroundReviews++
                    return {
                        decision: null,
                        speech: null,
                        taskAcceptance: 'none',
                        companionOrder: null,
                        memory: '',
                        done: true,
                        waitMs: 300_000,
                    }
                }
                const source =
                    context.events.at(-1)?.id ?? context.task?.id ?? 'none'
                const count = (calls.get(source) ?? 0) + 1
                calls.set(source, count)
                assert.ok(
                    count <= 2,
                    'One input cannot call a model more than twice'
                )
                contexts.push(context)
                const reply = await provider.decide(context, settings, signal)
                console.info(
                    JSON.stringify({
                        stage: 'model-reply',
                        actorId: context.actorId,
                        request: context.events.find(
                            (event) => event.kind === 'message'
                        ),
                        decision: reply.decision,
                        taskAcceptance: reply.taskAcceptance,
                        companionOrder: reply.companionOrder,
                        speech: reply.speech,
                        correction: context.replyCorrection?.code,
                    })
                )
                return reply
            },
        },
    },
})
const socket = {
    send: (raw: string) => {
        const message = JSON.parse(raw) as ServerMessage
        if (message.type === 'world_init') playerId = message.playerId
        if (message.type === 'event' && message.event.kind === 'chat')
            messages.push({ event: message.event, at: message.serverTime })
    },
} as unknown as RoomSocket
const send = (command: ClientMessage) =>
    room.handleMessage(socket, JSON.stringify(command))

async function until(
    predicate: () => boolean,
    reason: string,
    timeout = 90_000
): Promise<void> {
    const end = Math.min(deadline, Date.now() + timeout)
    while (!predicate() && Date.now() < end) await delay(100)
    assert.ok(predicate(), reason)
}
function character(id: string): GameCharacter {
    const actor = room.getCharacter(id)
    assert.ok(actor, `Missing character ${id}`)
    return actor
}
async function approach(
    player: GameCharacter,
    actor: GameCharacter
): Promise<void> {
    const near = () =>
        player.locationId === actor.locationId &&
        Math.hypot(
            player.position.x - actor.position.x,
            player.position.y - actor.position.y
        ) <= 32 &&
        room
            .navigationFor(player)
            .hasLineOfSight(player.position, actor.position)
    const end = Math.min(deadline, Date.now() + 30_000)
    while (!near() && Date.now() < end) {
        send({ type: 'move_to', target: { ...actor.position } })
        await delay(250)
    }
    assert.ok(near(), 'Player must walk close enough to the addressed NPC')
    send({ type: 'cancel_control' })
}
function terminal(request: string, started: number): boolean {
    return records.some(
        (record) =>
            record.at >= started &&
            record.request === request &&
            record.category === 'request_status' &&
            (record.reason === 'completed' ||
                record.reason === 'declined' ||
                record.reason?.startsWith('failed:') === true)
    )
}
function delivered(actorId: string, started: number): string[] {
    const publicSpeech = messages
        .filter(({ event, at }) => at >= started && event.actorId === actorId)
        .map(({ event }) => event.text ?? '')
    const player = character(playerId ?? '')
    const privateSpeech =
        room
            .snapshot(Date.now(), player.locationId, player.id)
            .social?.privateMessages?.filter(
                (message) =>
                    message.at >= started && message.senderId === actorId
            )
            .map((message) => message.text) ?? []
    return [...publicSpeech, ...privateSpeech]
}

async function refusal(player: GameCharacter): Promise<void> {
    const actor = character('npc_friendly_girl_1')
    await approach(player, actor)
    const request = 'Пойдёшь со мной в поход? Иди за мной.'
    const started = Date.now()
    send({ type: 'chat', targetId: actor.id, text: request })
    await until(
        () => terminal(request, started),
        'Mira must answer the follow request'
    )
    await diagnostics.flush()
    const speech = delivered(actor.id, started)
    assert.equal(
        speech.length,
        1,
        'Only one validated natural reply may be delivered'
    )
    assert.doesNotMatch(
        speech[0] ?? '',
        /сначала познаком|я решаю.*предлож|сервер|профиль|JSON|command_unavailable/iu
    )
    assert.notEqual(
        actor.soul.companion?.leaderId,
        player.id,
        'Mira must not start following'
    )
    assert.ok(
        !records.some(
            (record) =>
                record.at >= started &&
                record.request === request &&
                record.reason === 'accepted'
        )
    )
    const remembered = memoryForCharacter(actor)
        .entries()
        .filter(
            (entry) =>
                entry.at >= started &&
                entry.senderId === actor.id &&
                entry.source !== 'seen'
        )
    assert.equal(
        remembered.length,
        1,
        'Memory may retain only the committed reply, without a rejected draft'
    )
    assert.equal(remembered[0]?.text, speech[0])
    results.push({
        probe: 'mira-refusal',
        speech: speech[0],
        deliveredReplies: speech.length,
        orderApplied: false,
        rememberedReplies: remembered.length,
    })
    console.info(JSON.stringify(results.at(-1)))
}

function followVisibleGuide(
    player: GameCharacter,
    actorId: string,
    destination: string
): void {
    const seen = buildNpcAiObservation(
        room,
        player,
        'companion',
        Date.now()
    ).targets.find(
        (target) => target.kind === 'character' && target.id === actorId
    )
    if (seen !== undefined) {
        send({ type: 'move_to', target: { ...seen.position } })
        return
    }
    // If the guide has crossed, the player follows the already agreed western road, using no foreign GPS.
    const next = regionalRoute(player.locationId, destination)?.[1]
    const exit =
        next === undefined
            ? undefined
            : regionalExit(
                  player.position,
                  player.locationId,
                  next,
                  room.navigationFor(player)
              )
    if (exit !== undefined) send({ type: 'move_to', target: exit.point })
}

async function guide(player: GameCharacter): Promise<void> {
    const actor = character('npc_magic_slime_1')
    await approach(player, actor)
    const request = 'Проведи меня в Западные поля. Иди впереди, я пойду рядом.'
    const started = Date.now()
    const destination = 'map-1-2'
    send({ type: 'chat', targetId: actor.id, text: request })
    const end = Math.min(deadline, Date.now() + 150_000)
    while (!terminal(request, started) && Date.now() < end) {
        followVisibleGuide(player, actor.id, destination)
        await delay(200)
    }
    assert.ok(terminal(request, started), 'Regional guide must finish')
    await diagnostics.flush()
    assert.equal(
        actor.locationId,
        destination,
        'Kaplya must physically cross to Western Fields'
    )
    assert.equal(
        player.locationId,
        destination,
        'The player must cross through ordinary movement'
    )
    const requestContexts = contexts.filter((context) =>
        context.events.some(
            (event) => event.kind === 'message' && event.text === request
        )
    )
    assert.ok(
        requestContexts.some((context) =>
            context.observation.knownPlaces?.some(
                (place) =>
                    place.key === `location:${destination}` &&
                    place.direction.includes('западу')
            )
        )
    )
    assert.equal(
        records.filter(
            (record) =>
                record.at >= started &&
                record.category === 'action_started' &&
                record.action?.type === 'guide'
        ).length,
        1
    )
    assert.equal(
        records.filter(
            (record) =>
                record.at >= started &&
                record.category === 'action_completed' &&
                record.reason === 'arrived_with_requester'
        ).length,
        1
    )
    const speech = delivered(actor.id, started)
    assert.ok(speech.length >= 1)
    assert.doesNotMatch(
        speech.join(' '),
        /только.*(?:город|здани)|сервер|JSON|command_unavailable/iu
    )
    results.push({
        probe: 'regional-guide',
        destination,
        playerLocation: player.locationId,
        npcLocation: actor.locationId,
        sharedOrdinaryTravel: true,
        speech,
    })
    console.info(JSON.stringify(results.at(-1)))
    const orderRequest = 'Иди за мной.'
    const orderAt = Date.now()
    send({ type: 'chat', targetId: actor.id, text: orderRequest })
    await until(
        () =>
            (actor.soul.companion?.leaderId === player.id &&
                actor.soul.companion.order === 'follow') ||
            terminal(orderRequest, orderAt),
        'Kaplya must resolve the follow request'
    )
    assert.equal(actor.soul.companion?.leaderId, player.id)
    assert.equal(actor.soul.companion.order, 'follow')
    const before = { ...actor.position }
    const target = { x: player.position.x - 96, y: player.position.y }
    send({ type: 'move_to', target })
    await delay(2000)
    assert.ok(
        Math.hypot(actor.position.x - before.x, actor.position.y - before.y) >
            1,
        'Ordinary following must move Kaplya outside the city'
    )
    results.push({
        probe: 'follow-outside-city',
        order: actor.soul.companion.order,
        speech: delivered(actor.id, orderAt),
        movementObserved: true,
    })
    console.info(JSON.stringify(results.at(-1)))
}

try {
    room.start()
    room.handleOpen(socket)
    send({
        type: 'join',
        nickname: 'Manual Navigation Observer',
        heroClass: 'vanguard',
    })
    await until(() => playerId !== undefined, 'Player joined normally', 10_000)
    const player = character(playerId ?? '')
    if (!args.includes('--guide-only')) await refusal(player)
    if (!args.includes('--refusal-only')) await guide(player)
    console.info(
        JSON.stringify({
            result: 'passed',
            probes: results.length,
            modelCalls: contexts.length,
            backgroundReviewsSilenced: backgroundReviews,
            ordinaryCommandsOnly: true,
            isolatedWorld: true,
        })
    )
} finally {
    room.stop()
    await diagnostics.flush()
}
