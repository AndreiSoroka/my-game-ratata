/** Manual real-model dialogue check. Isolated generated worlds never start or execute decisions. */
import assert from 'node:assert/strict'

import { CharacterKnowledge } from '../apps/backend/src/ai/characterKnowledge'
import { characterKnowledge } from '../apps/backend/src/ai/knowledgeCatalog'
import { CodexCliProvider } from '../apps/backend/src/ai/codexCliProvider'
import { loadNpcAiConfig } from '../apps/backend/src/ai/config'
import { NpcAiDiagnostics } from '../apps/backend/src/ai/diagnostics'
import { NpcAiDialogue } from '../apps/backend/src/ai/dialogue'
import { npcDialogueContext } from '../apps/backend/src/ai/dialogueContext'
import { characterKnowledgeScope } from '../apps/backend/src/ai/knowledgeScope'
import {
    createNpcAiState,
    type NpcAiActorState,
} from '../apps/backend/src/ai/runtimeState'
import { npcSelfReferenceProblem } from '../apps/backend/src/ai/speechSelfReference'
import { invokeNpcAiTurn } from '../apps/backend/src/ai/turn'
import type { NpcAiContext, NpcAiReply } from '../apps/backend/src/ai/types'
import { CompanionService } from '../apps/backend/src/game/companions'
import { GameRoom } from '../apps/backend/src/game/room'
import type { RoomSocket } from '../apps/backend/src/game/roomMessaging'
import { WorldMaps } from '../apps/backend/src/game/worldMaps'
import {
    CENTER_LOCATION_ID,
    type CityBellState,
    type ServerMessage,
} from '../contracts/src/index'

const scenarios = [
    {
        id: 'mira-silent',
        actorId: 'npc_friendly_girl_1',
        bellState: 'silent',
        question:
            'Почему городские мастера ничего не продают? Что нужно для Колокола, сколько сердец и какая награда? Пока просто расскажи, окно задания не открывай.',
        review: 'Мира объясняет закрытые услуги, общий заказ на три настоящих сердца за общую награду 40 золотых и последующую физическую активацию. Не объявляет услугу или договор уже выполненными.',
    },
    {
        id: 'vera-prepared',
        actorId: 'npc_cleric_1',
        bellState: 'prepared',
        question:
            'Мира уже получила сердца. Что теперь делать с Колоколом? Мастерские уже работают или нужно ещё что-то?',
        review: 'Вера знает: заказ исполнен, но Колокол ещё нужно активировать внутри часовни; услуги пока закрыты. Не просит дополнительные сердца и не объявляет звон уже состоявшимся.',
    },
    {
        id: 'vera-active',
        actorId: 'npc_cleric_1',
        bellState: 'active',
        question:
            'Мы раньше говорили, что Колокол молчит. Он теперь работает? Нужно ещё нести сердца Мире?',
        review: 'Вера ставит текущее состояние выше старого разговора: Колокол активен, услуги открыты, сердца больше не нужны. Объясняет это своими участливыми словами.',
    },
] as const satisfies ReadonlyArray<{
    id: string
    actorId: string
    bellState: CityBellState
    question: string
    review: string
}>

const args = process.argv.slice(2)
assert.ok(
    args.length <= 1 &&
        args.every((arg) => arg === '--list' || arg.startsWith('--case=')),
    'Usage: bun scripts/npc-city-dialogue-check.ts [--list | --case=<index|scenario-id>]'
)
if (args[0] === '--list') {
    console.info(
        JSON.stringify(
            scenarios.map((scenario, index) => ({ index, ...scenario }))
        )
    )
    process.exit(0)
}
const choice = args[0]?.slice('--case='.length)
const selected = scenarios.filter(
    (scenario, index) =>
        choice === undefined ||
        choice === scenario.id ||
        choice === String(index)
)
assert.ok(selected.length > 0, 'Unknown city scenario; use --list')

const config = await loadNpcAiConfig()
const provider = new CodexCliProvider()
let totalCalls = 0
for (const scenario of selected) {
    const maps = new WorldMaps({
        seed: 'city-dialogue-smoke',
        epoch: 'city-dialogue-smoke',
        cityStyle: 'grid',
    })
    const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        worldMaps: maps,
        initialBellState: scenario.bellState,
        npcIdentitySeed: 'city-dialogue-identity',
        npcSpeechSeed: 'city-dialogue-speech',
    })
    const knowledge = new CharacterKnowledge(
        undefined,
        undefined,
        (actor, navigation) =>
            characterKnowledge(actor, navigation, {
                residentExists: (id) => room.getCharacter(id) !== undefined,
            })
    )
    const diagnostics = new NpcAiDiagnostics({ sink: () => Promise.resolve() })
    try {
        const actor = room.getCharacter(scenario.actorId)
        assert.ok(actor?.npcIdentityProfile, 'Missing authored NPC identity')
        const configured = config.npcs.find((npc) => npc.actorId === actor.id)
        assert.ok(configured, 'Missing configured NPC')
        const player = joinListener(room)
        const near = room.navigation
            .walkableNeighbors(room.navigation.worldToTile(actor.position))
            .map((tile) => room.navigation.tileToWorld(tile))
            .find((point) =>
                room.navigation.hasLineOfSight(point, actor.position)
            )
        assert.ok(near, 'Missing clear conversation position')
        // Explicit isolated fixture placement; this checks reasoning, not movement.
        player.position = near
        const state = createNpcAiState(configured, actor)
        const service = new NpcAiDialogue(
            room,
            new CompanionService(),
            diagnostics
        )
        const now = 2000
        if (scenario.id === 'vera-active') {
            state.mind.remember({
                id: 'city-check:outdated-report',
                senderId: player.id,
                senderName: player.nickname,
                recipientId: actor.id,
                conversationPartnerId: actor.id,
                text: 'Колокол молчит, мастерские закрыты, городу ещё нужны сердца.',
                at: 1000,
                channel: 'say',
                source: 'heard',
                locationId: actor.locationId,
            })
        }
        state.dialogue = {
            kind: 'message',
            id: `city-check:${scenario.id}`,
            senderId: player.id,
            text: scenario.question,
            channel: 'say',
            locationId: actor.locationId,
            position: { ...player.position },
            at: now,
        }
        state.mind.remember({
            ...state.dialogue,
            channel: 'say',
            senderName: player.nickname,
            recipientId: actor.id,
            conversationPartnerId: actor.id,
            source: 'heard',
        })
        const refresh = (): NpcAiContext =>
            npcDialogueContext(room, service, state, actor, now)
        const initial = refresh()
        assert.equal(initial.cityStory?.current.bellState, scenario.bellState)
        assert.ok(
            initial.selfIdentity,
            'Production context must contain own identity'
        )
        const contexts: NpcAiContext[] = []
        let lookups = 0
        await invokeNpcAiTurn(
            state,
            initial,
            {
                decide: (context, settings, signal) => {
                    contexts.push(context)
                    totalCalls++
                    assert.ok(
                        contexts.length <= 2,
                        'The common two-call budget must hold'
                    )
                    assert.equal(
                        context.cityStory?.current.bellState,
                        scenario.bellState
                    )
                    assert.deepEqual(context.selfIdentity, initial.selfIdentity)
                    return provider.decide(context, settings, signal)
                },
            },
            () => true,
            {
                current: () => true,
                reserveCall: () => true,
                refreshContext: refresh,
                validateReply: (reply) =>
                    npcSelfReferenceProblem(actor, reply, {
                        humanAddressee: true,
                    }),
                scope: () => characterKnowledgeScope(actor),
                search: (query) => {
                    lookups++
                    return knowledge.retrieve(
                        actor,
                        room.navigationFor(actor),
                        state.mind,
                        query
                    )
                },
                lookup: (personId) => {
                    lookups++
                    return Promise.resolve(
                        state.mind.deep(personId, scenario.question)
                    )
                },
            }
        )
        const reply = readyReply(state)
        const speech =
            reply.speech ??
            (reply.decision?.type === 'speak' ? reply.decision.text : '')
        assert.ok(
            speech.length > 0 && speech.length <= 400,
            'Expected one short spoken answer'
        )
        assert.equal(reply.taskAcceptance ?? 'none', 'none')
        assert.equal(reply.companionOrder ?? null, null)
        assert.ok(
            reply.decision === null || reply.decision.type === 'speak',
            'A request to explain city facts must not act or show an unrequested offer'
        )
        assert.doesNotMatch(
            speech,
            /\b(?:JSON|MCP|cityStory|authoredQuests|taskAcceptance)\b/iu
        )
        console.info(
            JSON.stringify({
                scenario: scenario.id,
                bellState: scenario.bellState,
                question: scenario.question,
                speech,
                modelCalls: contexts.length,
                lookups,
                manualReview: scenario.review,
                isolatedWorld: true,
                decisionsApplied: false,
            })
        )
    } finally {
        knowledge.stop()
        room.stop()
        await diagnostics.flush()
    }
}
console.info(
    JSON.stringify({
        scenarios: selected.length,
        totalCalls,
        isolatedWorld: true,
        decisionsApplied: false,
    })
)

function readyReply(state: NpcAiActorState): NpcAiReply {
    assert.ok(
        state.ready && 'reply' in state.ready,
        `Invalid response: ${JSON.stringify(state.ready)}`
    )
    return state.ready.reply
}

function joinListener(room: GameRoom) {
    const sent: ServerMessage[] = []
    const socket = {
        send: (raw: string) => sent.push(JSON.parse(raw) as ServerMessage),
    } as unknown as RoomSocket
    room.handleOpen(socket)
    room.handleMessage(
        socket,
        JSON.stringify({ type: 'join', nickname: 'Путник проверки' })
    )
    const init = sent.find((message) => message.type === 'world_init')
    const player = room.getCharacter(init?.playerId ?? '')
    assert.ok(player, 'An ordinary join must create the listener')
    return player
}
