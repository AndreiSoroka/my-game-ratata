import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import { defaultNpcAiSettings } from '../src/ai/config'
import {
    rememberHeardSpeech,
    rememberPublishedSpeech,
} from '../src/ai/memoryObservation'
import { createNpcAiState } from '../src/ai/runtimeState'
import { GameRoom } from '../src/game/room'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())
it('records heard public NPC speech without starting decisions and keeps whispers with their actual hearers', () => {
    const room = new GameRoom()
    try {
        const mira = room.getCharacter('npc_friendly_girl_1')
        const kaplya = room.getCharacter('npc_magic_slime_1')
        const vera = room.getCharacter('npc_cleric_1')
        if (mira === undefined || kaplya === undefined || vera === undefined) {
            throw new Error('Missing NPCs')
        }
        mira.position = { x: 360, y: 1000 }
        kaplya.position = { x: 360, y: 1000 }
        vera.position = { x: 376, y: 1000 }
        const state = createNpcAiState(
            {
                actorId: mira.id,
                role: 'city_coordinator',
                settings: defaultNpcAiSettings,
            },
            mira
        )
        rememberHeardSpeech(
            room,
            new Map([[mira.id, state]]),
            mira,
            {
                kind: 'message',
                id: 'private',
                senderId: mira.id,
                text: 'Шепчу про тайник',
                channel: 'whisper',
                at: 1,
                locationId: mira.locationId,
                position: mira.position,
            },
            kaplya.id
        )
        expect(memoryForCharacter(mira).deep(kaplya.id).status).toBe('found')
        expect(
            memoryForCharacter(kaplya).deep(mira.id).messages?.[0]?.text
        ).toContain('тайник')
        expect(memoryForCharacter(vera).deep(mira.id).status).toBe('not_known')
        rememberPublishedSpeech(
            room,
            [
                {
                    kind: 'chat',
                    actorId: mira.id,
                    speechId: 101,
                    text: 'Капля спросил меня о тайнике.',
                },
            ],
            [mira, kaplya, vera],
            2
        )
        expect(
            memoryForCharacter(vera).deep(mira.id).messages?.[0]
        ).toMatchObject({ source: 'heard', channel: 'say', senderId: mira.id })
        expect(state.inbox).toHaveLength(0)
        expect(memoryForCharacter(vera).conversationId).not.toBe(
            memoryForCharacter(mira).conversationId
        )
    } finally {
        room.stop()
    }
})

it('keeps scripted NPC hearing even when the model integration is disabled', () => {
    const room = new GameRoom()
    try {
        const mira = room.getCharacter('npc_friendly_girl_1')
        const kaplya = room.getCharacter('npc_magic_slime_1')
        const vera = room.getCharacter('npc_cleric_1')
        if (mira === undefined || kaplya === undefined || vera === undefined) {
            throw new Error('Missing NPCs')
        }
        mira.position = { x: 360, y: 1000 }
        kaplya.position = { x: 360, y: 1000 }
        vera.position = { x: 376, y: 1000 }
        expect(
            room.social.whispers.send(
                mira,
                kaplya,
                'Секрет без модельного контроллера.',
                Date.now()
            )
        ).toBe(true)
        expect(
            memoryForCharacter(kaplya).deep(mira.id).messages?.[0]?.text
        ).toContain('Секрет')
        expect(memoryForCharacter(mira).deep(kaplya.id).status).toBe('found')
        expect(memoryForCharacter(vera).deep(mira.id).status).toBe('not_known')
        room.publishEvents([
            {
                kind: 'chat',
                actorId: mira.id,
                text: 'Расскажу вслух то, что решила рассказать.',
            },
        ])
        expect(
            memoryForCharacter(vera).deep(mira.id).messages?.[0]?.channel
        ).toBe('say')
        expect(memoryForCharacter(vera).deep(kaplya.id).status).toBe(
            'not_known'
        )
    } finally {
        room.stop()
    }
})
