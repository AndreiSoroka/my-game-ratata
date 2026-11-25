/** Manual real-model protocol check in an isolated ordinary GameRoom. */
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

import { CodexCliProvider } from '../apps/backend/src/ai/codexCliProvider'
import { loadNpcAiConfig } from '../apps/backend/src/ai/config'
import {
    NpcAiDiagnostics,
    type NpcAiDiagnosticRecord,
} from '../apps/backend/src/ai/diagnostics'
import type { NpcAiContext, NpcAiReply } from '../apps/backend/src/ai/types'
import type { GameCharacter } from '../apps/backend/src/game/character'
import { GameRoom } from '../apps/backend/src/game/room'
import type { RoomSocket } from '../apps/backend/src/game/roomMessaging'
import type {
    ClientMessage,
    GameEventPayload,
    QuestOfferSnapshot,
    ServerMessage,
} from '../contracts/src/index'

const scenarios = [
    {
        id: 'accept',
        description:
            'Устное приглашение, уточнение, согласие посмотреть условия',
    },
    {
        id: 'decline',
        description:
            'Отказ от приглашения, затем прямая просьба во время паузы',
    },
    {
        id: 'direct',
        description:
            'Прямая просьба о задании без предварительного приглашения',
    },
    {
        id: 'kaplya-orders',
        description:
            'Средний род Капли: согласие гулять, отказ от боя, обычное освобождение спутника',
    },
] as const
type Scenario = (typeof scenarios)[number]
const args = process.argv.slice(2)
assert.ok(
    args.length <= 1 &&
        args.every((arg) => arg === '--list' || arg.startsWith('--case=')),
    'Usage: bun scripts/npc-invitation-dialogue-check.ts [--list | --case=<index|accept|decline|direct|kaplya-orders>]'
)
if (args[0] === '--list') {
    console.info(
        JSON.stringify(
            scenarios.map((scenario, index) => ({ index, ...scenario }))
        )
    )
    process.exit(0)
}
const selection = args[0]?.slice('--case='.length)
const selected = scenarios.filter(
    (scenario, index) =>
        selection === undefined ||
        selection === scenario.id ||
        selection === String(index)
)
assert.ok(selected.length > 0, 'Unknown invitation scenario; use --list')
const configured = await loadNpcAiConfig()
const provider = new CodexCliProvider()
let totalCalls = 0

for (const scenario of selected) {
    await run(scenario)
}
console.info(
    JSON.stringify({
        scenarios: selected.length,
        totalCalls,
        isolatedWorld: true,
        noQuestAccepted: true,
    })
)

async function run(scenario: Scenario): Promise<void> {
    const actorId =
        scenario.id === 'kaplya-orders'
            ? 'npc_magic_slime_1'
            : 'npc_friendly_girl_1'
    const actorConfig = configured.npcs.find(
        (entry) => entry.actorId === actorId
    )
    assert.ok(
        actorConfig,
        'The speaker must have an authored model configuration'
    )
    let playerId: string | undefined
    let inviteEnabled = false
    let backgroundCalls = 0
    let silencedTurns = 0
    const calls = new Map<string, number>()
    const contexts: NpcAiContext[] = []
    const speeches: string[] = []
    const records: NpcAiDiagnosticRecord[] = []
    const events: GameEventPayload[] = []
    const deadline = Date.now() + 240_000
    const diagnostics = new NpcAiDiagnostics({
        sink: (line) => {
            records.push(JSON.parse(line) as NpcAiDiagnosticRecord)
            return Promise.resolve()
        },
    })
    const room = new GameRoom(undefined, {
        npcIdentitySeed: 'invitation-smoke',
        npcSpeechSeed: 'speech-smoke',
        ai: {
            config: {
                ...configured,
                enabled: true,
                proactive: true,
                limits: {
                    ...configured.limits,
                    maxCallsPerHour: 1000,
                    reviewIntervalMs: 1000,
                },
                npcs: [actorConfig],
            },
            diagnostics,
            provider: { decide: decide },
        },
    })
    const socket = {
        send: (raw: string) => {
            const message = JSON.parse(raw) as ServerMessage
            if (message.type === 'world_init') playerId = message.playerId
            if (message.type !== 'event') return
            events.push(message.event)
            if (
                message.event.kind === 'chat' &&
                message.event.actorId === actorId &&
                message.event.text
            ) {
                speeches.push(message.event.text)
            }
        },
    } as unknown as RoomSocket
    const send = (command: ClientMessage): void =>
        room.handleMessage(socket, JSON.stringify(command))
    const invitation = () =>
        room.social.quests.invitationFor(actorId, playerId ?? '', Date.now())
    const offer = (): QuestOfferSnapshot | null | undefined =>
        room.social.quests.snapshot(playerId ?? '', Date.now()).questOffer

    async function decide(
        context: NpcAiContext,
        settings: Parameters<CodexCliProvider['decide']>[1],
        signal: AbortSignal
    ): Promise<NpcAiReply> {
        const message = context.events.find(
            (event) =>
                event.kind === 'message' &&
                event.senderId === playerId &&
                event.system !== true
        )
        const proactive =
            inviteEnabled &&
            invitation() === null &&
            context.task?.requesterId === null &&
            context.task.background === undefined
        if (message?.kind !== 'message' && !proactive) {
            silencedTurns++
            return {
                decision: null,
                speech: null,
                taskAcceptance: 'none',
                companionOrder: null,
                memory: '',
                done: true,
                waitMs: 1000,
            }
        }
        const key = message?.id ?? context.task?.id ?? 'missing-source'
        const count = (calls.get(key) ?? 0) + 1
        calls.set(key, count)
        assert.ok(count <= 2, 'One input cannot use more than two model calls')
        if (proactive) {
            backgroundCalls++
            assert.ok(
                backgroundCalls <= 4,
                'The invitation protocol check has a bounded real-model budget'
            )
        }
        let input = context
        if (proactive && context.task !== null) {
            const request = context.observation.city?.requests[0]
            assert.ok(
                request && playerId,
                'Need a real published worker request and nearby player'
            )
            // A focused controller goal, not edited world state: this checks the protocol,
            // not which useful activity a spontaneous city review happens to choose.
            input = {
                ...context,
                task: {
                    ...context.task,
                    request: `Предложи видимому игроку ${playerId} существующее обращение ${request.id} (${request.workerName}) через worker_quest_propose. Одновременно своей репликой спроси, хочет ли он посмотреть условия. Не принимай задание за игрока.`,
                },
            }
        }
        contexts.push(input)
        totalCalls++
        const reply = await provider.decide(input, settings, signal)
        console.info(
            JSON.stringify({
                scenario: scenario.id,
                stage: 'model',
                request:
                    message?.kind === 'message'
                        ? message.text
                        : 'focused-background-invitation',
                decision: reply.decision,
                taskAcceptance: reply.taskAcceptance,
                companionOrder: reply.companionOrder,
                done: reply.done,
                speech: reply.speech,
                correction: context.replyCorrection?.code,
                focusedBackgroundInput: proactive,
            })
        )
        return reply
    }

    async function until(
        predicate: () => boolean,
        reason: string,
        timeoutMs = 90_000
    ): Promise<void> {
        const end = Math.min(deadline, Date.now() + timeoutMs)
        while (!predicate() && Date.now() < end) await delay(100)
        assert.ok(predicate(), reason)
    }
    async function ask(text: string): Promise<void> {
        const before = speeches.length
        const started = Date.now()
        send({ type: 'chat', targetId: actorId, text })
        await until(
            () =>
                speeches.length > before &&
                records.some(
                    (entry) =>
                        entry.at >= started &&
                        entry.request === text &&
                        entry.category === 'request_status' &&
                        (entry.reason === 'completed' ||
                            entry.reason?.startsWith('failed:') === true ||
                            (scenario.id === 'kaplya-orders' &&
                                ['accepted', 'declined', 'started'].includes(
                                    entry.reason?.split(':')[0] ?? ''
                                )))
                ),
            `The dialogue must finish: ${text}`
        )
        await diagnostics.flush()
        assert.ok(
            !records.some(
                (entry) =>
                    entry.at >= started &&
                    entry.request === text &&
                    entry.category === 'action_rejected'
            ),
            'The model dialogue must choose an admissible command'
        )
    }

    try {
        room.start()
        room.handleOpen(socket)
        send({
            type: 'join',
            nickname: `Manual invitation ${scenario.id}`,
            heroClass: 'vanguard',
        })
        await until(
            () => playerId !== undefined,
            'Player must join normally',
            5000
        )
        const player = room.getCharacter(playerId ?? '')
        const actor = room.getCharacter(actorId)
        assert.ok(player && actor)
        await approach(room, send, player, actor, deadline)
        if (scenario.id === 'kaplya-orders') {
            await ask('Пойдём со мной, просто погуляем вместе по городу.')
            assert.equal(actor.soul.companion?.leaderId, player.id)
            assert.equal(actor.soul.companion.order, 'follow')
            const agreement = speeches.at(-1)
            await ask('Теперь помоги мне в бою: напади на любого слизня.')
            assert.equal(actor.soul.companion?.canFight, false)
            assert.equal(actor.soul.companion.leaderId, player.id)
            assert.equal(actor.soul.companion.order, 'follow')
            const refusal = speeches.at(-1)
            assert.ok(
                contexts.length <= 4,
                'Two player inputs share at most four paid calls including repairs'
            )
            send({
                type: 'companion_request',
                request: 'dismiss',
                targetId: actor.id,
            })
            await until(
                () => actor.soul.companion?.leaderId == null,
                'The ordinary owner dismissal must release the companion',
                5000
            )
            console.info(
                JSON.stringify({
                    scenario: scenario.id,
                    result: 'passed',
                    calls: contexts.length,
                    agreement,
                    refusal,
                    canFight: false,
                    ordinaryDismissed: true,
                    isolatedWorld: true,
                    manualReview:
                        'Согласие и отказ используют средний род или естественную безличную конструкцию, не меняя добровольное согласие и запрет боя.',
                })
            )
            return
        }
        await until(
            () =>
                room.workerRequests
                    .list()
                    .some((request) => request.clerkId === actorId),
            'Ordinary worker simulation must publish an actual request',
            120_000
        )
        const goldBefore = room.social.quests.cityFund(actor.locationId)
        if (scenario.id !== 'direct') {
            inviteEnabled = true
            await until(
                () => invitation() !== null,
                'The autonomous turn must create an oral invitation without an offer'
            )
            inviteEnabled = false
            const pending = invitation()
            assert.ok(pending)
            assert.equal(
                offer() ?? null,
                null,
                'An oral invitation must not open a modal'
            )
            assert.ok(
                speeches.length > 0,
                'The invitation must actually be spoken'
            )
            assert.equal(
                room.social.quests.cityFund(actor.locationId),
                goldBefore
            )
            console.info(
                JSON.stringify({
                    scenario: scenario.id,
                    stage: 'oral-invitation',
                    invitation: pending,
                    offer: null,
                    speech: speeches.at(-1),
                    noRewardReserved: true,
                })
            )
            if (scenario.id === 'accept') {
                await ask(
                    'Это опасно? Пока только объясни риск, условия показывать ещё не надо.'
                )
                assert.equal(
                    offer() ?? null,
                    null,
                    'Clarification must not show conditions'
                )
                assert.equal(
                    invitation()?.id,
                    pending.id,
                    'Clarification must preserve the invitation'
                )
                await ask('Да, покажи условия этого поручения.')
            } else {
                await ask(
                    'Нет, спасибо. Сейчас не хочу смотреть это поручение.'
                )
                assert.equal(offer() ?? null, null)
                assert.equal(invitation(), null)
                assert.equal(
                    room.social.quests.canInvite(
                        actorId,
                        player.id,
                        Date.now()
                    ),
                    false,
                    'Refusal must start the proactive cooldown'
                )
                await ask('Я передумал. Покажи мне задание, пожалуйста.')
            }
        } else {
            await ask(
                'Покажи мне существующее поручение работника, хочу увидеть условия.'
            )
        }
        const shown = offer()
        assert.ok(
            shown,
            'The requested conditions must produce an ordinary offer'
        )
        const introduction = shown.introduction
        assert.ok(
            introduction !== undefined && introduction.trim().length > 0,
            'The offer must carry its generated introduction'
        )
        assert.ok(
            speeches.includes(introduction),
            'The introduction must match actually spoken speech'
        )
        assert.equal(room.social.quests.cityFund(actor.locationId), goldBefore)
        assert.equal(
            room.snapshot(Date.now(), player.locationId, player.id).party
                ?.activeJobs[0] ?? null,
            null
        )
        assert.equal(invitation(), null)
        console.info(
            JSON.stringify({
                scenario: scenario.id,
                result: 'passed',
                calls: contexts.length,
                backgroundCalls,
                silencedTurns,
                offerId: shown.id,
                introduction: shown.introduction,
                noQuestAccepted: true,
                noRewardReserved: true,
                ordinaryMovementAndSpeech: true,
                isolatedWorld: true,
                notices: events
                    .filter((event) => event.kind === 'notice')
                    .map((event) => event.text),
            })
        )
    } finally {
        room.stop()
        await diagnostics.flush()
    }
}

async function approach(
    room: GameRoom,
    send: (command: ClientMessage) => void,
    player: GameCharacter,
    actor: GameCharacter,
    deadline: number
): Promise<void> {
    const nearby = () =>
        Math.hypot(
            player.position.x - actor.position.x,
            player.position.y - actor.position.y
        ) <= 32 &&
        room
            .navigationFor(actor)
            .hasLineOfSight(player.position, actor.position)
    const end = Math.min(deadline, Date.now() + 30_000)
    while (!nearby() && Date.now() < end) {
        send({ type: 'move_to', target: { ...actor.position } })
        await delay(250)
    }
    assert.ok(
        nearby(),
        'Player must physically approach the observed NPC before conversation'
    )
    send({ type: 'cancel_control' })
}
