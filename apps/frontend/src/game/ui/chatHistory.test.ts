import { expect, it } from 'vitest'

import { worldFixture } from '../testing/characterFixture'
import { createChatHistory } from './chatHistory'

it('retains only delivered speech, deduplicates snapshots and isolates world/identity sessions', () => {
    const history = createChatHistory()
    const world = {
        ...worldFixture([]),
        serverEpoch: 'one',
        social: {
            privateMessages: [
                {
                    id: 'w1',
                    senderId: 'partner',
                    senderName: 'Капля',
                    partnerId: 'partner',
                    partnerName: 'Капля',
                    text: 'Секрет',
                    at: 1,
                },
            ],
        },
    }
    history.observe(world, 'self')
    history.observe(world, 'self')
    history.event({
        kind: 'chat',
        actorId: 'speaker',
        speakerName: 'Мира',
        speechId: 1,
        text: 'Н..р...о',
    })
    history.event({ kind: 'chat', actorId: 'speaker', speechId: 1, text: 'Скрытый оригинал' })
    expect(history.entries.value.map((entry) => entry.text)).toEqual(['Секрет', 'Н..р...о'])
    history.observe({ ...world, serverEpoch: 'two', social: {} }, 'self')
    history.event({ kind: 'chat', actorId: 'speaker', speechId: 1, text: 'Новая речь' })
    expect(history.entries.value.map((entry) => entry.text)).toEqual(['Новая речь'])
    history.session('two', 'another')
    expect(history.entries.value).toEqual([])
})

it('keeps 500 entries without replaying an older private snapshot after busy public chat', () => {
    const history = createChatHistory()
    const world = {
        ...worldFixture([]),
        social: {
            privateMessages: [
                {
                    id: 'w1',
                    senderId: 'self',
                    senderName: 'Я',
                    partnerId: 'partner',
                    partnerName: 'Капля',
                    text: 'Секрет',
                    at: 1,
                },
            ],
        },
    }
    history.observe(world, 'self')
    for (let id = 0; id < 1500; id += 1) {
        history.event({ kind: 'chat', actorId: 'speaker', speechId: id, text: `Реплика ${id}` })
        history.observe(world, 'self')
    }
    expect(history.entries.value).toHaveLength(500)
    expect(history.entries.value.at(-1)?.text).toBe('Реплика 1499')
    expect(history.entries.value.some((entry) => entry.text === 'Секрет')).toBe(false)
})

it('labels a delivered private scripted reply as personal without replaying explicit whisper events', () => {
    const history = createChatHistory()
    history.observe(worldFixture([]), 'self')
    history.event({
        kind: 'chat',
        actorId: 'worker',
        targetId: 'self',
        speakerName: 'Работник',
        speechId: 1,
        text: 'Жду проверки участка.',
    })
    history.event({
        kind: 'chat',
        channel: 'whisper',
        actorId: 'worker',
        targetId: 'self',
        speechId: 2,
        text: 'Хранится в парной истории.',
    })
    expect(history.entries.value).toHaveLength(1)
    expect(history.entries.value[0]).toMatchObject({
        channel: 'whisper',
        partnerId: 'worker',
        text: 'Жду проверки участка.',
    })
})

it('names the original errand in task statuses while keeping ordinary replies concise', () => {
    const history = createChatHistory()
    history.observe(worldFixture([]), 'self')
    history.event({
        kind: 'npc_request_status',
        speakerName: 'Капля',
        requestStatus: {
            id: 'request-1',
            npcId: 'kaplya',
            state: 'started',
            request: 'покажи гильдию',
            at: 1,
        },
    })
    expect(history.entries.value[0]?.text).toBe('Выполняет поручение: «покажи гильдию»')
    history.event({
        kind: 'npc_request_status',
        speakerName: 'Капля',
        requestStatus: {
            id: 'request-1',
            npcId: 'kaplya',
            state: 'failed',
            request: 'покажи гильдию',
            reason: 'Собеседник не вернулся.',
            at: 2,
        },
    })
    expect(history.entries.value).toHaveLength(1)
    expect(history.entries.value[0]?.text).toBe(
        'Не удалось выполнить: «покажи гильдию». Собеседник не вернулся.'
    )
    history.event({
        kind: 'npc_request_status',
        requestStatus: {
            id: 'request-2',
            npcId: 'kaplya',
            state: 'completed',
            request: 'привет',
            at: 3,
        },
    })
    expect(history.entries.value.at(-1)?.text).toBe('Запрос завершён')
})
