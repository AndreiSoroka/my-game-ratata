import { describe, expect, it } from 'vitest'

import { CharacterMemory } from '../src/ai/characterMemory'

function message(id: string, personId: string, text: string, at = 1) {
    return {
        id,
        senderId: personId,
        senderName: personId,
        text,
        at,
        locationId: 'map-2-2',
        source: 'heard' as const,
        channel: 'whisper' as const,
        recipientId: 'npc',
    }
}
describe('identity-owned deep memory', () => {
    it('remembers the first of 100 speakers and a confidence across interlocutors', () => {
        const mind = new CharacterMemory('npc')
        for (let index = 0; index < 100; index++) {
            const personId = `player-${String(index)}`
            mind.remember(
                message(
                    `speech-${String(index)}`,
                    personId,
                    `Мы говорили о северной заставе ${String(index)}`,
                    index
                )
            )
            expect(
                mind.updatePerson(
                    {
                        personId,
                        throughMessageId: `speech-${String(index)}`,
                        text: `Собеседник ${String(index)} спрашивал о заставе`,
                        sourceMessageIds: [`speech-${String(index)}`],
                    },
                    personId
                )
            ).toBe(true)
        }
        expect(mind.deep('player-0').summary).toContain('Собеседник 0')
        expect(
            mind
                .context('player-99', 'северной')
                .relevant.some((entry) => entry.senderId !== 'player-99')
        ).toBe(true)
        expect(new CharacterMemory('other-npc').deep('player-0')).toEqual({
            personId: 'player-0',
            status: 'not_known',
        })
        expect(mind.deep('player-0').messages?.[0]?.source).toBe('heard')
    })
    it('never treats a question as observed travel and records only real subsequent sightings', () => {
        const mind = new CharacterMemory('npc')
        mind.remember(message('q', 'player', 'Где север?'))
        expect(
            mind.deep('player').messages?.map((entry) => entry.source)
        ).toEqual(['heard'])
        mind.observe('player', 'Игрок', { x: 20, y: 30 }, 'map-2-2', 10)
        mind.observe('player', 'Игрок', { x: 20, y: 10 }, 'map-2-2', 20)
        expect(
            mind
                .deep('player', 'север')
                .messages?.find((entry) => entry.source === 'seen')?.text
        ).toContain('двигался к северу')
        expect(mind.deep('player').messages?.at(-1)?.at).toBe(20)
    })
    it('rejects foreign, invented, empty and stale summary updates', () => {
        const mind = new CharacterMemory('npc')
        mind.remember(message('one', 'player', 'Первое'))
        mind.remember(message('two', 'player', 'Второе', 2))
        mind.remember(message('foreign', 'someone-else', 'Чужая реплика', 3))
        const update = {
            personId: 'player',
            throughMessageId: 'two',
            text: 'Обсудили второе',
            sourceMessageIds: ['one', 'two'],
        }
        expect(mind.updatePerson(update, 'other')).toBe(false)
        expect(
            mind.updatePerson(
                { ...update, throughMessageId: 'foreign' },
                'player'
            )
        ).toBe(false)
        expect(
            mind.updatePerson(
                { ...update, sourceMessageIds: ['invented'] },
                'player'
            )
        ).toBe(false)
        expect(mind.updatePerson(update, 'player')).toBe(true)
        expect(
            mind.updatePerson(
                { ...update, throughMessageId: 'one', text: 'Старое' },
                'player'
            )
        ).toBe(false)
        expect(mind.updatePerson({ ...update, text: '' }, 'player')).toBe(false)
        expect(mind.deep('player').summary).toBe('Обсудили второе')
    })
    it('compacts raw history without evicting the person or pretending verbatim text remains', () => {
        const mind = new CharacterMemory('npc', 1000)
        for (let index = 0; index < 20; index++) {
            mind.remember(
                message(
                    `m-${String(index)}`,
                    `p-${String(index)}`,
                    'Разговор '.repeat(20),
                    index
                )
            )
        }
        expect(mind.deep('p-0').status).toBe('found')
        expect(mind.deep('p-0').compacted).toBe(true)
        expect(mind.deep('p-0').summary).toContain('m-0')
        expect(mind.entries().length).toBeLessThan(20)
    })
})

it('accumulates observed small steps without mistaking unseen gaps for observed motion', () => {
    const mind = new CharacterMemory('npc')
    for (let step = 0; step <= 20; step++) {
        mind.observe(
            'walker',
            'Путник',
            { x: 20, y: 30 - step },
            'map-2-2',
            step * 100
        )
    }
    expect(
        mind
            .deep('walker')
            .messages?.some((entry) => entry.text.includes('двигался к северу'))
    ).toBe(true)
    const before = mind.entries().length
    mind.observe('walker', 'Путник', { x: 400, y: 400 }, 'map-2-2', 10000)
    expect(mind.entries()).toHaveLength(before)
})
