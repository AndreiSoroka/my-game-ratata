/** Manual inference check. The isolated room is never started and no decisions are applied. */
import assert from 'node:assert/strict'

import {
    characterKnowledge,
    type KnowledgeResult,
} from '../apps/backend/src/ai/characterKnowledge'
import { CodexCliProvider } from '../apps/backend/src/ai/codexCliProvider'
import { loadNpcAiConfig } from '../apps/backend/src/ai/config'
import { characterKnowledgeScope } from '../apps/backend/src/ai/knowledgeScope'
import { npcSpeechContext } from '../apps/backend/src/ai/npcSpeechInstructions'
import { buildNpcAiObservation } from '../apps/backend/src/ai/observation'
import { createNpcAiState } from '../apps/backend/src/ai/runtimeState'
import { invokeNpcAiTurn } from '../apps/backend/src/ai/turn'
import type { NpcAiContext } from '../apps/backend/src/ai/types'
import { generateNpcSpeechProfile } from '../apps/backend/src/game/npcSpeechProfiles'
import { GameRoom } from '../apps/backend/src/game/room'

const scenarios = [
    { id: 'mira-liar', actorId: 'npc_friendly_girl_1', seed: 'region-a' },
    { id: 'mira-joker', actorId: 'npc_friendly_girl_1', seed: 'speech-smoke' },
    { id: 'kaplya', actorId: 'npc_magic_slime_1', seed: 'region-a' },
] as const
const question =
    'Привет! Чем срубить дерево и как убрать пень? Сколько древесины получится?'
const args = process.argv.slice(2)
if (
    args.length > 1 ||
    args.some((value) => value !== '--list' && !value.startsWith('--case='))
) {
    throw new Error(
        'Usage: bun scripts/npc-style-dialogue-check.ts [--list | --case=<0..2|scenario-id>]'
    )
}
if (args[0] === '--list') {
    console.info(
        JSON.stringify(
            scenarios.map((scenario, index) => ({
                index,
                ...scenario,
                profile: generateNpcSpeechProfile(
                    scenario.seed,
                    scenario.actorId
                ),
            }))
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
assert.ok(selected.length > 0, 'Unknown style scenario; use --list')
const provider = new CodexCliProvider()
const config = await loadNpcAiConfig()
for (const scenario of selected) {
    const room = new GameRoom(undefined, { npcSpeechSeed: scenario.seed })
    try {
        const actor = room.getCharacter(scenario.actorId)
        assert.ok(actor, 'Missing authored NPC')
        const speechStyle = npcSpeechContext(actor)
        assert.ok(speechStyle, 'Missing server-assigned speech profile')
        const role =
            config.npcs.find((npc) => npc.actorId === actor.id)?.role ??
            'advisor'
        const state = createNpcAiState(
            { actorId: actor.id, role, settings: config.defaults },
            actor
        )
        const common = characterKnowledge(
            actor,
            room.navigationFor(actor)
        ).find((entry) => entry.id === 'forestry.chopping')
        assert.ok(common, 'NPC must have the common forestry article')
        assert.equal(common.group, 'world.common')
        const permitted: KnowledgeResult = {
            groups: [common.group],
            entries: [
                {
                    id: common.id,
                    group: common.group,
                    text: common.text,
                    source: common.source,
                },
            ],
            memories: [],
        }
        const event = {
            kind: 'message' as const,
            id: `manual-style:${scenario.id}`,
            senderId: 'manual-style-listener',
            text: question,
            locationId: actor.locationId,
            position: { ...actor.position },
            at: 0,
        }
        state.dialogue = event
        const context: NpcAiContext = {
            actorId: actor.id,
            role,
            personality: actor.soul.personality,
            speechStyle,
            task: null,
            taskConsent: {
                state: 'idle',
                allowed: ['none', 'decline', 'accept'],
            },
            events: [event],
            // An explicitly supplied, authorized teaching text keeps this check about speech.
            // It is a manual fixture, never a live observation or an ability unlock.
            memory: `Известная общая справка:\n${common.text}`,
            facts: [],
            observation: buildNpcAiObservation(room, actor, role, 0),
            knowledgeScope: characterKnowledgeScope(actor),
        }
        const contexts: NpcAiContext[] = []
        let searches = 0
        const current = () =>
            state.actor === actor &&
            room.getCharacter(actor.id) === actor &&
            actor.alive
        await invokeNpcAiTurn(
            state,
            context,
            {
                decide: async (input, settings, signal) => {
                    contexts.push(input)
                    assert.deepEqual(
                        input.speechStyle,
                        speechStyle,
                        'Every model call must retain only this NPC profile'
                    )
                    const reply = await provider.decide(input, settings, signal)
                    console.info(
                        JSON.stringify({
                            stage: 'style-reply',
                            scenario: scenario.id,
                            informationRequest: reply.informationRequest,
                            taskAcceptance: reply.taskAcceptance,
                            decision: reply.decision,
                            speech: reply.speech,
                        })
                    )
                    return reply
                },
            },
            current,
            {
                current,
                reserveCall: () => true,
                scope: () => characterKnowledgeScope(actor, false),
                search: () => {
                    searches += 1
                    return Promise.resolve(permitted)
                },
            }
        )
        assert.ok(
            state.ready && 'reply' in state.ready,
            `No valid model reply: ${JSON.stringify(state.ready)}`
        )
        const reply = state.ready.reply
        const speech =
            reply.speech ??
            (reply.decision?.type === 'speak' ? reply.decision.text : '')
        console.info(
            JSON.stringify({
                scenario: scenario.id,
                actorId: actor.id,
                seed: scenario.seed,
                traits: speechStyle.traits.map(({ id, label }) => ({
                    id,
                    label,
                })),
                tone: {
                    id: speechStyle.tone.id,
                    label: speechStyle.tone.label,
                },
                question,
                suppliedArticle: common.id,
                modelCalls: contexts.length,
                searches,
                speech,
                decisionApplied: false,
                manualReview:
                    'Сравнить естественность речи, точность справки и честное незнание количества; это не проверка векторного поиска.',
            })
        )
        assert.ok(contexts.length >= 1 && contexts.length <= 2)
        assert.ok(speech.trim().length > 0 && speech.length <= 400)
        assert.ok(
            reply.decision === null || reply.decision.type === 'speak',
            'An explanation must not start an errand'
        )
        assert.equal(reply.companionOrder ?? null, null)
        assert.equal(reply.taskAcceptance ?? 'none', 'none')
        assert.doesNotMatch(
            speech,
            /\b(?:JSON|MCP|speechStyle|taskAcceptance)\b|мои черты|мой тон|мой профиль/iu
        )
        assert.doesNotMatch(
            speech,
            /(?:\d+|восемь|восьми|двух|два)\s*(?:единиц[а-я]*\s+)?(?:древесин|сажен)/iu
        )
    } finally {
        room.stop()
    }
}
