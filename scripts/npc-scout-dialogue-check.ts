/** Manual real-model playtest. Every movement uses normal validated commands in an isolated world. */
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

import type {
    ClientMessage,
    GameEventPayload,
    ServerMessage,
} from '../contracts/src/index'
import { CodexCliProvider } from '../apps/backend/src/ai/codexCliProvider'
import { loadNpcAiConfig } from '../apps/backend/src/ai/config'
import {
    NpcAiDiagnostics,
    type NpcAiDiagnosticRecord,
} from '../apps/backend/src/ai/diagnostics'
import type { NpcAiContext } from '../apps/backend/src/ai/types'
import { containsBuildingPoint } from '../apps/backend/src/game/mapBuildings'
import { GameRoom } from '../apps/backend/src/game/room'
import type { RoomSocket } from '../apps/backend/src/game/roomMessaging'

const actorId = 'npc_magic_slime_1'
const configured = await loadNpcAiConfig()
const settings =
    configured.npcs.find((entry) => entry.actorId === actorId)?.settings ??
    configured.defaults
const contexts: NpcAiContext[] = []
const records: NpcAiDiagnosticRecord[] = []
const speeches: GameEventPayload[] = []
const calls = new Map<string, number>()
const provider = new CodexCliProvider()
const diagnostics = new NpcAiDiagnostics({
    sink: (line) => {
        const record = JSON.parse(line) as NpcAiDiagnosticRecord
        records.push(record)
        if (
            record.category === 'action_completed' ||
            record.category === 'action_rejected'
        ) {
            console.info(
                JSON.stringify({
                    stage: record.category,
                    action: record.action,
                    reason: record.reason,
                })
            )
        }
        return Promise.resolve()
    },
})
const room = new GameRoom(undefined, {
    npcSpeechSeed: 'speech-smoke',
    ai: {
        config: {
            ...configured,
            enabled: true,
            npcs: [{ actorId, role: 'companion', settings }],
        },
        diagnostics,
        provider: {
            decide: async (context, options, signal) => {
                contexts.push(context)
                const source = context.events.at(-1)?.id ?? 'none'
                const count = (calls.get(source) ?? 0) + 1
                calls.set(source, count)
                assert.ok(
                    count <= 2,
                    'No input may invoke the model more than twice'
                )
                assert.ok(
                    context.speechStyle,
                    'Own speech profile is supplied on every call'
                )
                const reply = await provider.decide(context, options, signal)
                console.info(
                    JSON.stringify({
                        stage: 'reply',
                        task: context.task?.id,
                        acceptance: reply.taskAcceptance,
                        decision: reply.decision,
                        speech: reply.speech,
                        correction: context.replyCorrection?.code,
                    })
                )
                return reply
            },
        },
    },
})
let playerId: string | undefined
const socket = {
    send: (raw: string) => {
        const message = JSON.parse(raw) as ServerMessage
        if (message.type === 'world_init') playerId = message.playerId
        if (
            message.type === 'event' &&
            message.event.kind === 'chat' &&
            message.event.actorId === actorId
        ) {
            speeches.push(message.event)
        }
    },
} as unknown as RoomSocket
const send = (command: ClientMessage) =>
    room.handleMessage(socket, JSON.stringify(command))
async function until(
    predicate: () => boolean,
    timeoutMs: number,
    reason: string
): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline) await delay(100)
    assert.ok(predicate(), reason)
}
try {
    room.start()
    room.handleOpen(socket)
    send({
        type: 'join',
        nickname: 'Manual Scout Observer',
        heroClass: 'vanguard',
    })
    await until(
        () => playerId !== undefined,
        10000,
        'Player joined through normal commands'
    )
    const player = room.getCharacter(playerId ?? '')
    const actor = room.getCharacter(actorId)
    assert.ok(player && actor)
    const tavern = room
        .navigationFor(actor)
        .grid.buildings?.find((entry) => entry.name.includes('Три дороги'))
    assert.ok(tavern, 'Authored tavern exists')
    send({ type: 'move_to', target: { ...actor.position } })
    await until(
        () =>
            Math.hypot(
                player.position.x - actor.position.x,
                player.position.y - actor.position.y
            ) <= 32,
        30000,
        'Player approached Kaplya using ordinary movement'
    )
    send({ type: 'cancel_control' })
    const first =
        'Ты видел принцессу Лею в таверне «Три дороги»? Пока просто ответь по памяти, никуда не ходи.'
    send({ type: 'chat', targetId: actorId, text: first })
    await until(
        () =>
            records.some(
                (entry) =>
                    entry.category === 'request_status' &&
                    entry.request === first &&
                    entry.reason === 'completed'
            ),
        90000,
        'Initial conversational response completed'
    )
    const request =
        'Проверь. Сходи внутрь, посмотри, есть ли она там, вернись и расскажи. Я подожду здесь.'
    const before = { ...actor.position }
    const speechStart = speeches.length
    send({ type: 'chat', targetId: actorId, text: request })
    await until(
        () =>
            records.some(
                (entry) =>
                    entry.category === 'request_status' &&
                    entry.request === request &&
                    entry.reason === 'completed'
            ),
        240000,
        'Scouting errand completed'
    )
    const observations = contexts.filter(
        (context) => context.task?.request === request
    )
    const indoor = observations.find((context) =>
        containsBuildingPoint(tavern.bounds, context.observation.self.position)
    )
    assert.ok(
        indoor,
        'Kaplya physically entered the requested tavern before reporting'
    )
    assert.ok(
        observations.some((context) =>
            context.facts.some((fact) => fact.kind === 'scouting')
        )
    )
    assert.ok(
        Math.hypot(actor.position.x - before.x, actor.position.y - before.y) <=
            80,
        'Kaplya returned to the waiting player'
    )
    assert.ok(
        speeches.length > speechStart,
        'A report was delivered within ordinary hearing'
    )
    const spoken = speeches.slice(speechStart).map((entry) => entry.text ?? '')
    assert.doesNotMatch(
        spoken.join(' '),
        /JSON|taskAcceptance|сервер отклонил|кость скелета/iu
    )
    console.info(
        JSON.stringify({
            result: 'passed',
            modelCalls: contexts.length,
            traits: actor.npcSpeechProfile,
            inspected: tavern.name,
            actualIndoorTargets: indoor.observation.targets
                .filter((target) => target.kind === 'character')
                .map((target) => target.name),
            report: spoken,
            ordinaryCommandsOnly: true,
            isolatedWorld: true,
        })
    )
} finally {
    room.stop()
    await diagnostics.flush()
}
