import { expect, it } from 'vitest'

import { CharacterMemory } from '../src/ai/characterMemory'

it('keeps the princess exchange after more than twenty movement observations', () => {
    const memory = new CharacterMemory('kaplya')
    memory.remember({
        id: 'question',
        conversationPartnerId: 'kaplya',
        senderId: 'player',
        senderName: 'Андрей',
        text: 'Кто эта принцесса в таверне?',
        channel: 'say',
        source: 'heard',
        at: 1,
        locationId: 'city',
    })
    memory.remember({
        id: 'answer',
        conversationPartnerId: 'player',
        senderId: 'kaplya',
        senderName: 'Капля',
        text: 'Принцесса Лея. Я не проверял, там ли она сейчас.',
        channel: 'say',
        source: 'heard',
        at: 2,
        locationId: 'city',
    })
    for (let index = 0; index < 50; index += 1) {
        memory.remember({
            id: `movement-${String(index)}`,
            senderId: `walker-${String(index)}`,
            senderName: 'Прохожий',
            text: 'Идёт по улице.',
            channel: 'say',
            source: 'seen',
            at: index + 3,
            locationId: 'city',
        })
    }
    memory.remember({
        id: 'check',
        conversationPartnerId: 'kaplya',
        senderId: 'player',
        senderName: 'Андрей',
        text: 'проверь',
        channel: 'say',
        source: 'heard',
        at: 55,
        locationId: 'city',
    })
    const context = memory.context('player', 'проверь')
    expect(context.recent.map((entry) => entry.id)).toEqual([
        'question',
        'answer',
        'check',
    ])
    expect(memory.deep('walker-0').status).toBe('found')
})
