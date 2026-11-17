/** Manual inference check: no decisions are applied to the isolated game room. */
import assert from 'node:assert/strict'

import {
    CharacterKnowledge,
    characterKnowledge,
    type KnowledgeResult,
} from '../apps/backend/src/ai/characterKnowledge'
import { CharacterMemory } from '../apps/backend/src/ai/characterMemory'
import { CodexCliProvider } from '../apps/backend/src/ai/codexCliProvider'
import { loadNpcAiConfig } from '../apps/backend/src/ai/config'
import { characterKnowledgeScope } from '../apps/backend/src/ai/knowledgeScope'
import { npcSpeechContext } from '../apps/backend/src/ai/npcSpeechInstructions'
import { buildNpcAiObservation } from '../apps/backend/src/ai/observation'
import { createNpcAiState } from '../apps/backend/src/ai/runtimeState'
import { invokeNpcAiTurn } from '../apps/backend/src/ai/turn'
import type { NpcAiContext } from '../apps/backend/src/ai/types'
import { GameRoom } from '../apps/backend/src/game/room'

const cases = [
    { actorId: 'npc_friendly_girl_1', question: 'Спасибо' },
    { actorId: 'npc_friendly_girl_1', question: 'Подскажи где кузнец' },
    {
        actorId: 'npc_friendly_girl_1',
        question: 'Подскажи как срубить дерево и убрать пень',
    },
    {
        actorId: 'npc_friendly_girl_1',
        question: 'Сколько древесины и саженцев выйдет с дерева?',
    },
    {
        actorId: 'npc_lumberjack_1',
        question:
            'Сколько древесины и саженцев выйдет со взрослого и малого дерева?',
    },
    {
        actorId: 'npc_friendly_girl_1',
        question: 'У Игната сейчас точно есть топор? Сколько он стоит?',
    },
]
const room = new GameRoom()
const knowledge = new CharacterKnowledge()
const provider = new CodexCliProvider()
const config = await loadNpcAiConfig()
const selectedCase = process.argv.find((value) => value.startsWith('--case='))
try {
    for (const [index, scenario] of cases.entries()) {
        if (
            selectedCase !== undefined &&
            Number(selectedCase.slice(7)) !== index
        ) {
            continue
        }
        const actor = room.getCharacter(scenario.actorId)
        assert.ok(actor, `Missing authored actor ${scenario.actorId}`)
        const navigation = room.navigationFor(actor)
        const memory = new CharacterMemory(
            `manual-evaluation:${actor.id}:${index}`
        )
        const role =
            config.npcs.find((npc) => npc.actorId === actor.id)?.role ??
            'advisor'
        const event = {
            kind: 'message' as const,
            id: `manual-question:${index}`,
            senderId: 'manual-listener',
            text: scenario.question,
            locationId: actor.locationId,
            position: { ...actor.position },
            at: 0,
        }
        const context: NpcAiContext = {
            actorId: actor.id,
            role,
            personality: actor.soul.personality,
            ...(npcSpeechContext(actor) === undefined
                ? {}
                : { speechStyle: npcSpeechContext(actor)! }),
            task: null,
            memory: '',
            facts: [],
            events: [event],
            observation: buildNpcAiObservation(room, actor, role, 0),
            conversation: memory.context('manual-listener', scenario.question),
            knowledgeScope: characterKnowledgeScope(actor),
        }
        const state = createNpcAiState(
            { actorId: actor.id, role, settings: config.defaults },
            actor
        )
        state.mind = memory
        state.dialogue = event
        const contexts: NpcAiContext[] = []
        let searched: string | undefined
        let retrieved: KnowledgeResult = {
            groups: [],
            entries: [],
            memories: [],
        }
        await invokeNpcAiTurn(
            state,
            context,
            {
                decide: async (input, settings, signal) => {
                    contexts.push(input)
                    return provider.decide(input, settings, signal)
                },
            },
            () => true,
            {
                reserveCall: () => true,
                search: async (query) => {
                    searched = query
                    retrieved = await knowledge.retrieve(
                        actor,
                        navigation,
                        memory,
                        query
                    )
                    const permitted = new Set(
                        characterKnowledge(actor, navigation).map(
                            (entry) => entry.id
                        )
                    )
                    assert.ok(
                        retrieved.entries.every((entry) =>
                            permitted.has(entry.id)
                        )
                    )
                    if (actor.id !== 'npc_lumberjack_1') {
                        assert.ok(
                            !retrieved.entries.some(
                                (entry) =>
                                    entry.id === 'forestry.chopping.expert'
                            )
                        )
                    }
                    return retrieved
                },
            }
        )
        assert.ok(
            state.ready && 'reply' in state.ready,
            state.ready && 'error' in state.ready
                ? state.ready.error
                : 'Missing model result'
        )
        const reply = state.ready.reply
        const speech =
            reply.speech ??
            (reply.decision?.type === 'speak' ? reply.decision.text : '')
        console.info(
            JSON.stringify({
                actorId: actor.id,
                question: scenario.question,
                modelCalls: contexts.length,
                searched,
                articles: retrieved.entries.map((entry) => entry.id),
                speech,
                decisionApplied: false,
            })
        )
        assert.equal(
            contexts[0]?.knowledge,
            undefined,
            'First model call must not receive articles'
        )
        assert.ok(contexts.length <= 2)
        if (scenario.question === 'Спасибо') {
            assert.equal(contexts.length, 1)
            assert.equal(searched, undefined)
        } else if (index >= 2 && index <= 4) {
            assert.ok(
                searched,
                'Unknown world facts must use model-chosen search'
            )
        }
        assert.ok(speech.length > 0, 'Expected a conversational reply')
        assert.doesNotMatch(
            speech,
            /\b(?:WASD|HUD|JSON|MCP)\b|клавиш|кнопк|нажми|хотбар/iu
        )
        if (
            scenario.question.startsWith('Сколько') &&
            actor.id !== 'npc_lumberjack_1'
        ) {
            assert.doesNotMatch(
                speech,
                /\d|восемь|восеми|восьми|два саженца|двух саженцев/iu
            )
        }
        if (actor.id === 'npc_lumberjack_1') {
            assert.match(speech, /8|восемь/iu)
            assert.match(speech, /2|два/iu)
        }
    }
} finally {
    knowledge.stop()
    room.stop()
}
