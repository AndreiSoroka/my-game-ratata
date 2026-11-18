import { expect, it } from 'vitest'

import { CharacterMemory } from '../src/ai/characterMemory'
import type { MemoryMessage } from '../src/ai/characterMemoryTypes'
import { defaultNpcAiSettings } from '../src/ai/config'
import {
    dialogueConversationKey,
    rememberDialogueReply,
    taskConversationKey,
} from '../src/ai/dialogueMemory'
import { createNpcAiState } from '../src/ai/runtimeState'

function speech(
    id: string,
    senderId: string,
    text: string,
    at: number,
    targetId?: string
): MemoryMessage {
    return {
        id,
        senderId,
        senderName: senderId === 'npc' ? 'Капля' : 'andrei',
        text,
        at,
        channel: 'say',
        source: 'heard',
        locationId: 'city',
        ...(targetId === undefined ? {} : { conversationPartnerId: targetId }),
    }
}

it('archives the old identity without transferring its same-named conversation to a new person', () => {
    const mind = new CharacterMemory('npc')
    mind.remember(
        speech('old-question', 'player-1', 'Ищем западную окраину', 1, 'npc')
    )
    mind.remember(
        speech('old-answer', 'npc', 'Западная окраина слева', 2, 'player-1')
    )
    mind.archivePerson('player-1', 3)
    mind.observe('player-2', 'andrei', { x: 0, y: 0 }, 'city', 4)
    mind.remember(speech('new-question', 'player-2', 'продолжим?', 5, 'npc'))
    const current = mind.context('player-2', 'западная окраина')
    expect(current.recent.map(({ id }) => id)).toEqual(['new-question'])
    expect(current.relevant).toEqual([])
    expect(current.person?.id).toBe('player-2')
    expect(current.person?.summary).not.toContain('западную')
    expect(mind.deep('player-1')).toMatchObject({
        status: 'found',
        identityStatus: 'archived',
    })
    expect(mind.deep('player-1').messages?.map(({ id }) => id)).toEqual([
        'old-question',
        'old-answer',
    ])
    expect(mind.deep('andrei')).toEqual({
        personId: 'andrei',
        status: 'not_known',
    })
    const historicalIndex = mind.context(
        'player-2',
        'О чём говорили с прошлым персонажем?'
    ).knownPeople
    expect(historicalIndex[0]?.id).toBe('player-2')
    expect(historicalIndex).toContainEqual(
        expect.objectContaining({ id: 'player-1', status: 'archived' })
    )
    expect(mind.context('player-2', 'andrei').knownPeople).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                id: 'player-1',
                name: 'andrei',
                status: 'archived',
            }),
            expect.objectContaining({
                id: 'player-2',
                name: 'andrei',
                status: 'active',
            }),
        ])
    )
})

it('retains compacted history by exact ID and refuses delayed summary updates for the retired person', () => {
    const mind = new CharacterMemory('npc', 900)
    mind.remember(
        speech('old-first', 'old', 'Западная окраина '.repeat(20), 1, 'npc')
    )
    for (let index = 0; index < 12; index += 1) {
        mind.remember(
            speech(
                `filler-${String(index)}`,
                'old',
                'Беседа продолжается '.repeat(10),
                index + 2,
                'npc'
            )
        )
    }
    mind.remember(speech('old-last', 'old', 'Последнее сообщение', 20, 'npc'))
    const before = mind.deep('old')
    expect(mind.archivePerson('old', 21)).toBe(true)
    expect(mind.archivePerson('old', 22)).toBe(false)
    expect(mind.retirementRevision).toBe(1)
    expect(mind.deep('old')).toMatchObject({
        identityStatus: 'archived',
        compacted: true,
    })
    expect(mind.deep('old').summary).toBe(before.summary)
    expect(mind.deep('old').messages).toEqual(before.messages)
    expect(
        mind.updatePerson(
            {
                personId: 'old',
                throughMessageId: 'old-last',
                sourceMessageIds: ['old-last'],
                text: 'Устаревший ответ',
            },
            'old'
        )
    ).toBe(false)
    mind.remember(speech('new-last', 'new', 'Привет', 23, 'npc'))
    expect(
        mind.updatePerson(
            {
                personId: 'new',
                throughMessageId: 'new-last',
                sourceMessageIds: ['old-last'],
                text: 'Перенос старой беседы',
            },
            'new'
        )
    ).toBe(false)
    expect(mind.lastConversationAt('new')).toBe(23)
})

it('counts only actual pair speech, independently from visibility and ambient conversation', () => {
    const mind = new CharacterMemory('npc')
    mind.observe('player', 'andrei', { x: 0, y: 0 }, 'city', 1)
    mind.observe('player', 'andrei', { x: 20, y: 0 }, 'city', 2)
    mind.remember(
        speech('ambient', 'player', 'Говорю другому жителю', 3, 'other-npc')
    )
    expect(mind.lastConversationAt('player')).toBeUndefined()
    mind.remember(speech('direct', 'player', 'Привет, Капля', 4))
    mind.recordAddressedSpeech('direct', 'player', 4)
    expect(mind.lastConversationAt('player')).toBe(4)
    mind.remember(speech('reply', 'npc', 'Привет!', 5, 'player'))
    expect(mind.lastConversationAt('player')).toBe(5)
    mind.archivePerson('player', 6)
    mind.recordConversation('player', 7)
    expect(mind.lastConversationAt('player')).toBe(5)
})

it('keeps public scratch summaries keyed by actual partner without changing the speech audience key', () => {
    const state = createNpcAiState(
        { actorId: 'npc', role: 'companion', settings: defaultNpcAiSettings },
        undefined
    )
    const oldEvent = {
        kind: 'message' as const,
        id: 'old-message',
        senderId: 'old',
        text: 'Запад',
        locationId: 'city',
        position: { x: 0, y: 0 },
        at: 1,
        channel: 'say' as const,
    }
    const reply = {
        decision: null,
        memory: 'Со старым героем искали запад',
        done: true,
        waitMs: 0,
    }
    rememberDialogueReply(state, oldEvent, reply)
    expect(state.conversations.get('say:old')).toContain('Со старым героем')
    expect(state.conversations.get('say:new')).toBeUndefined()
    expect(dialogueConversationKey({ ...oldEvent, senderId: 'new' })).toBe(
        'say:new'
    )
    expect(
        taskConversationKey({
            id: 'task',
            request: 'Путь',
            requesterId: 'old',
            audienceKey: 'say',
            steps: 1,
        })
    ).toBe('say:old')
})
