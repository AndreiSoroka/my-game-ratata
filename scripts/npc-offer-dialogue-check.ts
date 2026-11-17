/** Manual isolated-world playtest. Only player dialogue calls a real model; city reviews are silent. */
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

import { CodexCliProvider } from '../apps/backend/src/ai/codexCliProvider'
import { loadNpcAiConfig } from '../apps/backend/src/ai/config'
import {
    NpcAiDiagnostics,
    type NpcAiDiagnosticRecord,
} from '../apps/backend/src/ai/diagnostics'
import type { NpcAiContext } from '../apps/backend/src/ai/types'
import type { GameCharacter } from '../apps/backend/src/game/character'
import { GameRoom } from '../apps/backend/src/game/room'
import type { RoomSocket } from '../apps/backend/src/game/roomMessaging'
import { workerHomeDefinitions } from '../apps/backend/src/game/workerSpawns'
import type {
    ClientMessage,
    GameEventPayload,
    QuestOfferSnapshot,
    ServerMessage,
} from '../contracts/src/index'

const args = process.argv.slice(2)
assert.ok(
    args.length <= 2 &&
        new Set(args).size === args.length &&
        args.every(
            (arg) => arg === '--prepare-only' || /^--wait-ms=\d+$/u.test(arg)
        ),
    'Usage: bun scripts/npc-offer-dialogue-check.ts [--prepare-only] [--wait-ms=1000..300000]'
)
const prepareOnly = args.includes('--prepare-only')
const waitArgument = args.find((arg) => arg.startsWith('--wait-ms='))
const worldWaitMs =
    waitArgument === undefined ? 30_000 : Number(waitArgument.slice(10))
assert.ok(
    Number.isSafeInteger(worldWaitMs) &&
        worldWaitMs >= 1000 &&
        worldWaitMs <= 300_000,
    'Worker publication wait must be 1000..300000 milliseconds'
)
const actorId = 'npc_friendly_girl_1'
const configured = await loadNpcAiConfig()
const settings =
    configured.npcs.find((entry) => entry.actorId === actorId)?.settings ??
    configured.defaults
const records: NpcAiDiagnosticRecord[] = []
const contexts: NpcAiContext[] = []
const notices: GameEventPayload[] = []
const speeches: string[] = []
const calls = new Map<string, number>()
const provider = new CodexCliProvider()
const diagnostics = new NpcAiDiagnostics({
    sink: (line) => {
        records.push(JSON.parse(line) as NpcAiDiagnosticRecord)
        return Promise.resolve()
    },
})
const deadline = Date.now() + worldWaitMs + 210_000
let playerId: string | undefined
let backgroundReviews = 0
const room = new GameRoom(undefined, {
    npcSpeechSeed: 'speech-smoke',
    ai: {
        config: {
            ...configured,
            enabled: true,
            npcs: [{ actorId, role: 'city_coordinator', settings }],
        },
        diagnostics,
        provider: {
            decide: async (context, options, signal) => {
                const event = context.events.find(
                    (entry) =>
                        entry.kind === 'message' &&
                        entry.senderId === playerId &&
                        entry.system !== true
                )
                if (event?.kind !== 'message') {
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
                assert.equal(
                    prepareOnly,
                    false,
                    'Preparation must never invoke a model'
                )
                const count = (calls.get(event.id) ?? 0) + 1
                calls.set(event.id, count)
                assert.ok(count <= 2, 'At most two model calls per user input')
                contexts.push(context)
                const reply = await provider.decide(context, options, signal)
                console.info(
                    JSON.stringify({
                        stage: 'model-reply',
                        request: event.text,
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
const socket = {
    send: (raw: string) => {
        const message = JSON.parse(raw) as ServerMessage
        if (message.type === 'world_init') playerId = message.playerId
        if (message.type === 'event') {
            if (message.event.kind === 'notice') notices.push(message.event)
            if (
                message.event.kind === 'chat' &&
                message.event.actorId === actorId &&
                message.event.text
            )
                speeches.push(message.event.text)
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
    const end = Math.min(deadline, Date.now() + timeoutMs)
    while (!predicate() && Date.now() < end) await delay(100)
    assert.ok(predicate(), reason)
}

async function approach(
    player: GameCharacter,
    actor: GameCharacter
): Promise<void> {
    const near = () =>
        Math.hypot(
            player.position.x - actor.position.x,
            player.position.y - actor.position.y
        ) <= 32 &&
        room
            .navigationFor(actor)
            .hasLineOfSight(player.position, actor.position)
    const end = Math.min(deadline, Date.now() + 30_000)
    while (!near() && Date.now() < end) {
        send({ type: 'move_to', target: { ...actor.position } })
        await delay(250)
    }
    assert.ok(near(), 'Player must physically reach Mira')
    send({ type: 'cancel_control' })
}

function currentOffer(): QuestOfferSnapshot | null | undefined {
    return room.social.quests.snapshot(playerId ?? '', Date.now()).questOffer
}

async function ask(
    text: string,
    expectedRequestId: string
): Promise<QuestOfferSnapshot> {
    const started = Date.now()
    send({ type: 'chat', targetId: actorId, text })
    await until(
        () =>
            currentOffer()?.workerRequestId === expectedRequestId ||
            records.some(
                (entry) =>
                    entry.at >= started &&
                    entry.request === text &&
                    entry.category === 'request_status' &&
                    (entry.reason === 'completed' ||
                        entry.reason?.startsWith('failed:') === true)
            ),
        90_000,
        'Mira must complete the player dialogue'
    )
    await diagnostics.flush()
    const offer = currentOffer()
    assert.ok(offer, `No offer after ${text}`)
    assert.equal(
        offer.workerRequestId,
        expectedRequestId,
        'The actual requested worker offer must be published'
    )
    assert.equal(offer.issuerId, actorId)
    return structuredClone(offer)
}

try {
    room.start()
    const ready = () =>
        room.workerRequests
            .list()
            .filter((request) => request.clerkId === actorId)
    const waitEnd = Date.now() + worldWaitMs
    while (ready().length < 2 && Date.now() < waitEnd) await delay(100)
    const requests = ready()
    console.info(
        JSON.stringify({
            stage: 'world-prepared',
            publishedRequests: requests,
            workers: workerHomeDefinitions().map(({ id, name }) => ({
                id,
                name,
                locationId: room.getCharacter(id)?.locationId,
                incidentStage: room.workerRequests.forWorker(id)?.stage,
                activity: room.social.workerActivity(id, Date.now()),
            })),
            waitedMs: worldWaitMs,
            realModelCalls: contexts.length,
            backgroundReviewsSilenced: backgroundReviews,
            isolatedWorld: true,
            authoredWorldStateUnmodified: true,
        })
    )
    if (requests.length < 2) {
        console.info(
            JSON.stringify({
                result: 'not-ready',
                reason: `Fewer than two real worker requests published within ${String(worldWaitMs)}ms.`,
                realModelCalls: 0,
                requestsCreatedByHarness: false,
            })
        )
        process.exitCode = 2
    } else if (prepareOnly) {
        console.info(
            JSON.stringify({
                result: 'prepared',
                realModelCalls: 0,
                publishedRequests: requests.length,
            })
        )
    } else {
        room.handleOpen(socket)
        send({
            type: 'join',
            nickname: 'Manual Mira Offer Observer',
            heroClass: 'vanguard',
        })
        await until(
            () => playerId !== undefined,
            10_000,
            'Player must join through ordinary commands'
        )
        const player = room.getCharacter(playerId ?? '')
        const actor = room.getCharacter(actorId)
        assert.ok(player && actor)
        await approach(player, actor)
        const first =
            requests.find((request) => request.workerId === 'npc_miner_1') ??
            requests[0]
        const second = requests.find((request) => request.id !== first?.id)
        assert.ok(first && second)
        const cityFund = room.social.quests.cityFund(actor.locationId)
        const previous = await ask(
            `Я хочу взять задание. Покажи заявку ${first.workerName}.`,
            first.id
        )
        const current = await ask(
            `Давай поменяем предложение: вместо этого дай заявку ${second.workerName}.`,
            second.id
        )
        assert.notEqual(
            current.id,
            previous.id,
            'Replacement must invalidate the previous offer identity'
        )
        assert.equal(
            room.social.quests.cityFund(actor.locationId),
            cityFund,
            'Proposals must not reserve city gold'
        )
        assert.ok(ready().some((request) => request.id === first.id))
        assert.ok(ready().some((request) => request.id === second.id))
        const beforeStaleClick = notices.length
        send({
            type: 'quest_offer_answer',
            offerId: previous.id,
            revision: previous.revision,
            accept: true,
        })
        assert.deepEqual(
            currentOffer(),
            current,
            'Old Take must preserve the replacement offer'
        )
        assert.equal(
            room.snapshot(Date.now(), player.locationId, player.id).party
                ?.activeJob ?? null,
            null
        )
        assert.ok(
            notices
                .slice(beforeStaleClick)
                .some((notice) => notice.text?.includes('заменено'))
        )
        assert.equal(room.social.quests.cityFund(actor.locationId), cityFund)
        console.info(
            JSON.stringify({
                result: 'passed',
                realModelCalls: contexts.length,
                backgroundReviewsSilenced: backgroundReviews,
                previousWorker: first.workerName,
                replacementWorker: second.workerName,
                previousOfferId: previous.id,
                replacementOfferId: current.id,
                oldAcceptanceRejected: true,
                noQuestAccepted: true,
                noCityGoldSpent: true,
                speeches,
                ordinaryCommandsOnly: true,
                isolatedWorld: true,
            })
        )
    }
} finally {
    room.stop()
    await diagnostics.flush()
}
