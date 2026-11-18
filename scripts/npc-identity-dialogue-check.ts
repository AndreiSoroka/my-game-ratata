/** Manual inference check using the production context builder; the isolated world never starts. */
import assert from 'node:assert/strict'

import { CharacterKnowledge } from '../apps/backend/src/ai/characterKnowledge'
import { CodexCliProvider } from '../apps/backend/src/ai/codexCliProvider'
import { loadNpcAiConfig } from '../apps/backend/src/ai/config'
import { NpcAiDiagnostics } from '../apps/backend/src/ai/diagnostics'
import { NpcAiDialogue } from '../apps/backend/src/ai/dialogue'
import { npcDialogueContext } from '../apps/backend/src/ai/dialogueContext'
import { rememberDialogueReply } from '../apps/backend/src/ai/dialogueMemory'
import { characterKnowledgeScope } from '../apps/backend/src/ai/knowledgeScope'
import {
    createNpcAiState,
    type NpcAiActorState,
} from '../apps/backend/src/ai/runtimeState'
import { npcSelfReferenceProblem } from '../apps/backend/src/ai/speechSelfReference'
import { invokeNpcAiTurn } from '../apps/backend/src/ai/turn'
import type { NpcAiContext, NpcAiReply } from '../apps/backend/src/ai/types'
import { CompanionService } from '../apps/backend/src/game/companions'
import type { NpcIdentityProfile } from '../apps/backend/src/game/npcIdentityProfiles'
import { generateNpcSpeechProfile } from '../apps/backend/src/game/npcSpeechProfiles'
import { GameRoom } from '../apps/backend/src/game/room'

const scenarios = [
    {
        id: 'mira-greeting',
        actorId: 'npc_friendly_girl_1',
        questions: ['Привет!'],
    },
    {
        id: 'kaplya-greeting',
        actorId: 'npc_magic_slime_1',
        questions: ['Привет!'],
    },
    {
        id: 'vera-greeting',
        actorId: 'npc_cleric_1',
        questions: ['Привет!'],
    },
    {
        id: 'kaplya-identity',
        actorId: 'npc_magic_slime_1',
        questions: ['Кто ты?'],
    },
    {
        id: 'kaplya-gender',
        actorId: 'npc_magic_slime_1',
        questions: [
            'Ты девочка или мальчик?',
            'Как ты появилось и что было потом?',
        ],
    },
    {
        id: 'kaplya-banter',
        actorId: 'npc_magic_slime_1',
        questions: ['Ты девушка или парень?', 'Ты слизень.'],
    },
    {
        id: 'vera-support',
        actorId: 'npc_cleric_1',
        questions: [
            'Мне страшно идти за город. Кажется, я ни на что не способен.',
        ],
    },
    {
        id: 'vera-prayers',
        actorId: 'npc_cleric_1',
        questions: [
            'Каким молитвам ты сама можешь научить? Можно сначала помолиться Матери, а затем Путнику? А молитве Праха ты меня научишь?',
        ],
    },
    {
        id: 'mira-self',
        actorId: 'npc_friendly_girl_1',
        questions: ['Кто ты, чем занимаешься в городе и как здесь оказалась?'],
    },
    {
        id: 'kaplya-self',
        actorId: 'npc_magic_slime_1',
        questions: ['Кто ты, откуда появилось и чем любишь заниматься?'],
    },
    {
        id: 'vera-self',
        actorId: 'npc_cleric_1',
        questions: ['Кто ты, чем занимаешься в городе и как здесь оказалась?'],
    },
    {
        id: 'mira-unknown',
        actorId: 'npc_friendly_girl_1',
        questions: ['Как звали твоих родителей? Назови их полные имена.'],
    },
    {
        id: 'kaplya-unknown',
        actorId: 'npc_magic_slime_1',
        questions: ['Как звали создавшего тебя мага и где его сейчас найти?'],
    },
    {
        id: 'mira-other',
        actorId: 'npc_friendly_girl_1',
        questions: [
            'Расскажи личную историю Капли: как оно жило до знакомства с нами?',
        ],
    },
    {
        id: 'mira-new-life',
        actorId: 'npc_friendly_girl_1',
        questions: [
            'Я тот самый Андрей, который погиб. Ты узнала меня? Верни наше прежнее знакомство и старое поручение.',
        ],
    },
    {
        id: 'mira-liar',
        actorId: 'npc_friendly_girl_1',
        questions: [
            'Расскажи короткую, явно сказочную байку о себе, а потом скажи, что было на самом деле.',
            'А теперь без баек: каким было твоё настоящее прошлое до службы хранительницей?',
        ],
    },
] as const

const args = process.argv.slice(2)
assert.ok(
    args.length <= 1 &&
        args.every((arg) => arg === '--list' || arg.startsWith('--case=')),
    'Usage: bun scripts/npc-identity-dialogue-check.ts [--list | --case=<index|scenario-id>]'
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
assert.ok(selected.length > 0, 'Unknown identity scenario; use --list')
const config = await loadNpcAiConfig()
const provider = new CodexCliProvider()
let totalCalls = 0
for (const scenario of selected) {
    const seed = scenario.id === 'mira-liar' ? liarSeed() : 'speech-smoke'
    const room = new GameRoom(undefined, {
        npcIdentitySeed: 'identity-smoke',
        npcSpeechSeed: seed,
    })
    const knowledge =
        scenario.id === 'vera-prayers' ? new CharacterKnowledge() : undefined
    try {
        const actor = room.getCharacter(scenario.actorId)
        assert.ok(actor?.npcIdentityProfile, 'Missing server-assigned identity')
        const configured = config.npcs.find((npc) => npc.actorId === actor.id)
        assert.ok(configured, 'Missing configured NPC')
        const state = createNpcAiState(configured, actor)
        const service = new NpcAiDialogue(
            room,
            new CompanionService(),
            new NpcAiDiagnostics({ sink: () => Promise.resolve() })
        )
        const personId = `manual-identity-listener:${scenario.id}`
        let now = 1000
        if (scenario.id === 'mira-new-life') {
            state.mind.remember({
                id: 'manual-identity:former-person',
                senderId: 'manual-identity:dead-andrey',
                senderName: 'Андрей',
                recipientId: actor.id,
                conversationPartnerId: actor.id,
                text: 'Спасибо за разговор о гильдии. Я Андрей.',
                channel: 'say',
                source: 'heard',
                at: 100,
                locationId: actor.locationId,
            })
            assert.equal(
                state.mind.archivePerson('manual-identity:dead-andrey', 200),
                true
            )
        }
        for (const [index, question] of scenario.questions.entries()) {
            now += 1000
            const event = {
                kind: 'message' as const,
                id: `manual-identity:${scenario.id}:${String(index)}`,
                senderId: personId,
                text: question,
                channel: 'say' as const,
                locationId: actor.locationId,
                position: { ...actor.position },
                at: now,
            }
            state.dialogue = event
            state.ready = undefined
            state.mind.remember({
                ...event,
                senderName:
                    scenario.id === 'mira-new-life' ? 'Андрей' : 'Путник',
                recipientId: actor.id,
                conversationPartnerId: actor.id,
                source: 'heard',
            })
            const refresh = (): NpcAiContext =>
                npcDialogueContext(room, service, state, actor, now)
            const context: NpcAiContext = refresh()
            assert.ok(
                context.selfIdentity,
                'The production builder must supply selfIdentity'
            )
            if (scenario.id === 'kaplya-banter') {
                assert.ok(
                    context.selfIdentity.speechHabits?.interjection
                        ?.preferredPosition,
                    'The actual production context must supply a varied interjection cue'
                )
            }
            if (scenario.id === 'vera-support') {
                assert.ok(
                    !actor.npcSpeechProfile?.traits.includes('kind'),
                    'The support check must not rely on a randomly selected kind speech trait'
                )
            }
            const contexts: NpcAiContext[] = []
            let lookups = 0
            await invokeNpcAiTurn(
                state,
                context,
                {
                    decide: async (input, settings, signal) => {
                        contexts.push(input)
                        totalCalls++
                        assert.deepEqual(
                            input.selfIdentity,
                            context.selfIdentity
                        )
                        for (const otherId of [
                            'npc_friendly_girl_1',
                            'npc_magic_slime_1',
                            'npc_cleric_1',
                        ]) {
                            if (otherId === actor.id) continue
                            const other: NpcIdentityProfile | undefined =
                                room.getCharacter(otherId)?.npcIdentityProfile
                            assert.ok(other)
                            assert.ok(
                                !JSON.stringify(input).includes(
                                    other.backstory.text
                                ),
                                'Unheard foreign history leaked'
                            )
                        }
                        return provider.decide(input, settings, signal)
                    },
                },
                () => true,
                {
                    current: () => true,
                    validateReply: (reply) =>
                        npcSelfReferenceProblem(actor, reply, {
                            humanAddressee: true,
                        }),
                    reserveCall: () => true,
                    refreshContext: refresh,
                    scope: () => characterKnowledgeScope(actor),
                    search: async (query) => {
                        lookups++
                        const result =
                            knowledge === undefined
                                ? { groups: [], entries: [], memories: [] }
                                : await knowledge.retrieve(
                                      actor,
                                      room.navigationFor(actor),
                                      state.mind,
                                      query
                                  )
                        assert.ok(
                            !result.entries.some(
                                (entry) =>
                                    entry.id === 'faith.grave' ||
                                    entry.id === 'faith.lantern'
                            ),
                            'Vera must not retrieve unlearned prayer doctrines'
                        )
                        return result
                    },
                    lookup: (id) => {
                        lookups++
                        return Promise.resolve(state.mind.deep(id, question))
                    },
                }
            )
            const reply = readyReply(state)
            const speech = speechOf(reply)
            assert.ok(contexts.length >= 1 && contexts.length <= 2)
            assert.ok(speech.length > 0 && speech.length <= 400)
            assert.equal(reply.taskAcceptance ?? 'none', 'none')
            assert.equal(reply.companionOrder ?? null, null)
            assert.ok(
                reply.decision === null || reply.decision.type === 'speak',
                'A biography question must not act'
            )
            assert.doesNotMatch(
                speech,
                /\b(?:JSON|MCP|selfIdentity|npcIdentityProfile|taskAcceptance)\b/iu
            )
            if (
                scenario.id.endsWith('-greeting') ||
                scenario.id === 'kaplya-identity' ||
                scenario.id === 'kaplya-gender' ||
                scenario.id === 'kaplya-banter' ||
                scenario.id === 'vera-support' ||
                scenario.id.endsWith('-self') ||
                scenario.id.endsWith('-unknown') ||
                scenario.id === 'mira-liar'
            ) {
                assert.equal(
                    lookups,
                    0,
                    'Own identity and its unknown details need no lookup'
                )
            }
            if (scenario.id.endsWith('-greeting')) {
                assert.ok(
                    speech.length <= 220,
                    'A greeting should remain short instead of reciting a biography'
                )
            }
            if (scenario.id === 'kaplya-greeting') {
                assert.doesNotMatch(
                    speech,
                    /(?:^|[^\p{L}])(?:рада|рад|рады|готова|готов|готовы|согласна|согласен|согласны)(?=$|[^\p{L}])/iu,
                    'The sexless character must not use feminine or masculine self-reference in its greeting'
                )
                assert.doesNotMatch(
                    speech,
                    /(?:хорошо|приятно),?\s+что\s+(?:ты\s+)?(?:заглянуло|пришло|вернулось|появилось)(?=$|[^\p{L}])/iu,
                    'A neuter greeting must not transfer the speaker’s grammar to its human addressee'
                )
            }
            rememberDialogueReply(state, event, reply)
            state.mind.remember({
                id: `${event.id}:reply`,
                senderId: actor.id,
                senderName: actor.nickname,
                recipientId: personId,
                conversationPartnerId: personId,
                text: speech,
                channel: 'say',
                source: 'heard',
                at: now + 1,
                locationId: actor.locationId,
            })
            console.info(
                JSON.stringify({
                    scenario: scenario.id,
                    question,
                    identity: actor.npcIdentityProfile,
                    speechTraits: actor.npcSpeechProfile,
                    speechHabits: context.selfIdentity.speechHabits,
                    modelCalls: contexts.length,
                    lookups,
                    realLocalRetrieval: knowledge !== undefined,
                    speech,
                    decisionsApplied: false,
                    manualReview:
                        'Приветствие и «кто ты?» не пересказывают прошлое; Мира и Вера говорят в женском роде, Капля — бесполое существо и говорит в среднем. В шутливых ответах Капля слегка обижается без настоящей вражды, не отрицает свой вид и варьирует «буль» по подсказке. Вера поддерживает независимо от случайных речевых черт, не обещая недоступной помощи. Запрошенное прошлое соответствует выбранному тексту; неизвестные имена не выдуманы, чужое прошлое не раскрыто, новый герой не признан прежней личностью.',
                })
            )
        }
    } finally {
        knowledge?.stop()
        room.stop()
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

function speechOf(reply: NpcAiReply): string {
    return (
        reply.speech ??
        (reply.decision?.type === 'speak' ? reply.decision.text : '')
    )
}

function readyReply(state: NpcAiActorState): NpcAiReply {
    assert.ok(
        state.ready && 'reply' in state.ready,
        `Invalid response: ${JSON.stringify(state.ready)}`
    )
    return state.ready.reply
}

function liarSeed(): string {
    for (let index = 0; index < 1024; index++) {
        const seed = `identity-liar-${String(index)}`
        if (
            generateNpcSpeechProfile(
                seed,
                'npc_friendly_girl_1'
            ).traits.includes('liar')
        )
            return seed
    }
    throw new Error('No Mira liar speech fixture found')
}
