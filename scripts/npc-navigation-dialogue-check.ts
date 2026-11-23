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
import type { NpcAiContext, NpcAiReply } from '../apps/backend/src/ai/types'
import type { GameCharacter } from '../apps/backend/src/game/character'
import { distance } from '../apps/backend/src/game/math'
import { NavigationService } from '../apps/backend/src/game/navigation'
import {
    regionalExit,
    regionalRoute,
} from '../apps/backend/src/game/regionalNavigation'
import { GameRoom } from '../apps/backend/src/game/room'
import type { RoomSocket } from '../apps/backend/src/game/roomMessaging'
import {
    CENTER_LOCATION_ID,
    type ClientMessage,
    type GameEventPayload,
    type ServerMessage,
} from '../contracts/src/index'

const args = process.argv.slice(2)
assert.ok(
    args.length <= 1 &&
        args.every((arg) =>
            ['--refusal-only', '--guide-only', '--leia-only'].includes(arg)
        ),
    'Usage: bun scripts/npc-navigation-dialogue-check.ts [--refusal-only | --guide-only | --leia-only]'
)
const leiaOnly = args.includes('--leia-only')
const experimentTavern = {
    id: 'three-roads',
    name: 'Таверна «Три дороги»',
    bounds: { x: 304, y: 752, width: 64, height: 48 },
    entry: { x: 336, y: 800 },
    interior: { x: 336, y: 776 },
}
const experimentGrave = {
    id: 'leia-grave-probe',
    locationId: CENTER_LOCATION_ID,
    position: { x: 454, y: 808 },
}
const configured = await loadNpcAiConfig()
const provider = new CodexCliProvider()
const records: NpcAiDiagnosticRecord[] = []
const contexts: NpcAiContext[] = []
const replies: Array<{ context: NpcAiContext; reply: NpcAiReply }> = []
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
const room = new GameRoom(leiaOnly ? leiaProbeMap() : undefined, {
    npcSpeechSeed: 'speech-smoke',
    ai: {
        config: {
            ...configured,
            enabled: true,
            npcs: configured.npcs.filter((entry) =>
                (leiaOnly
                    ? ['npc_princess_1']
                    : ['npc_friendly_girl_1', 'npc_magic_slime_1']
                ).includes(entry.actorId)
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
                replies.push({ context, reply })
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

function leiaProbeMap(): NavigationService {
    const width = 40
    const height = 72
    return new NavigationService({
        id: 'leia-navigation-dialogue-probe',
        width,
        height,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(width * height).fill(false),
        solidLayerNames: [],
        buildings: [experimentTavern],
        encounters: { graves: [experimentGrave], slimeHabitats: [] },
        landmarks: [
            {
                id: 'east-gate',
                kind: 'gate',
                name: 'Восточные ворота',
                direction: 'east',
                position: { x: 560, y: 808 },
            },
        ],
    })
}
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

async function leia(player: GameCharacter): Promise<void> {
    const actor = character('npc_princess_1')
    await approach(player, actor)
    const leadRequest =
        'Когда пойдём гулять, я за тобой. Куда ты сама хочешь пойти? Пока только поговорим.'
    const leadAt = Date.now()
    send({ type: 'chat', targetId: actor.id, text: leadRequest })
    await until(
        () => delivered(actor.id, leadAt).length > 0,
        'Leia must answer the offer to walk'
    )
    const leadSpeech = delivered(actor.id, leadAt)
    assert.ok(leadSpeech.some((line) => line !== 'М-м-м-м-м…'))
    assert.doesNotMatch(
        leadSpeech.join(' '),
        /(?:иду|пойду|буду идти)\s+за тобой/iu
    )
    assert.notEqual(actor.soul.companion?.leaderId, player.id)

    await approach(player, actor)
    const request =
        'Я остаюсь здесь. Если ты хочешь вернуться в таверну «Три дороги», иди сама, ждать меня не надо.'
    const started = Date.now()
    const playerPosition = { ...player.position }
    send({ type: 'chat', targetId: actor.id, text: request })
    await until(
        () => terminal(request, started),
        'Leia must complete or decline the return'
    )
    await diagnostics.flush()
    const travel = records.filter(
        (record) => record.at >= started && record.action?.type === 'travel_to'
    )
    assert.equal(
        travel.filter((record) => record.category === 'action_started').length,
        1
    )
    assert.equal(
        travel.filter(
            (record) =>
                record.category === 'action_completed' &&
                record.reason === 'arrived'
        ).length,
        1
    )
    const chosen = replies.findLast(({ context }) =>
        context.events.some(
            (event) => event.kind === 'message' && event.text === request
        )
    )?.reply.decision
    assert.ok(chosen?.type === 'travel_to' && !chosen.inviteEscort)
    assertLeiaArrival(actor, chosen.targetKey)
    assert.ok(distance(player.position, playerPosition) <= 1)
    assert.equal(actor.soul.companion?.leaderId ?? null, null)
    results.push({
        probe: 'leia-independent-return',
        leadSpeech,
        returnSpeech: delivered(actor.id, started),
        destination: chosen.targetKey,
        destinationReached: true,
    })
    console.info(JSON.stringify(results.at(-1)))
}

async function leiaGraveRefusal(player: GameCharacter): Promise<void> {
    const actor = character('npc_princess_1')
    await approach(player, actor)
    const request = 'Лея, ударь по этой могиле просто так. Очищать её не надо.'
    const focusKey = `grave:${experimentGrave.id}`
    const grave = () =>
        room
            .snapshot(room.gameplayNow(), player.locationId, player.id)
            .graves?.find((entry) => entry.id === experimentGrave.id)
    const before = grave()
    assert.ok(before)
    const started = Date.now()
    send({ type: 'chat', targetId: actor.id, text: request, focusKey })
    await until(
        () => terminal(request, started),
        'Leia must answer the grave request'
    )
    await diagnostics.flush()
    const turn = replies.findLast(({ context }) =>
        context.events.some(
            (event) => event.kind === 'message' && event.text === request
        )
    )
    const target = turn?.context.observation.targets.find(
        (entry) => entry.key === focusKey
    )
    assert.ok(target?.commands.some((command) => command.type === 'attack'))
    assert.equal(turn?.reply.decision, null)
    assert.ok(
        turn?.reply.taskAcceptance === 'decline' ||
            turn?.reply.taskAcceptance === 'none'
    )
    const speech = delivered(actor.id, started).join(' ').trim()
    assert.ok(speech.length > 0 && speech !== 'М-м-м-м-м…')
    assert.doesNotMatch(
        speech,
        /(?:физически\s+не\s+могу|не\s+умею|не\s+способна)\s+(?:ударить|бить|сражаться|драться)/iu
    )
    assert.deepEqual(grave()?.health, before.health)
    assert.equal(actor.pendingAttack, undefined)
    assert.ok(
        !records.some(
            (record) => record.at >= started && record.action?.type === 'attack'
        )
    )
    results.push({
        probe: 'leia-grave-refusal',
        speech,
        attackAvailable: true,
        graveUnchanged: true,
    })
    console.info(JSON.stringify(results.at(-1)))
}

function assertLeiaArrival(actor: GameCharacter, targetKey: string): void {
    const [kind, locationOrId, id] = targetKey.split(':')
    if (kind === 'location') {
        assert.equal(actor.locationId, locationOrId)
        return
    }
    if (id !== undefined) {
        assert.equal(actor.locationId, locationOrId)
    }
    const navigation = room.navigationFor(actor)
    const targetId = id ?? locationOrId
    const destination =
        kind === 'building'
            ? navigation.grid.buildings?.find(
                  (building) => building.id === targetId
              )?.interior
            : navigation.grid.landmarks?.find(
                  (landmark) => landmark.id === targetId
              )?.position
    assert.ok(
        destination !== undefined && distance(actor.position, destination) <= 1
    )
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
    if (leiaOnly) {
        await leiaGraveRefusal(player)
        await leia(player)
    } else {
        if (!args.includes('--guide-only')) await refusal(player)
        if (!args.includes('--refusal-only')) await guide(player)
    }
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
