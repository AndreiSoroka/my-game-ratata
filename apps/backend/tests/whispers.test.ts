import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { parseClientMessage } from '../src/game/messages'
import { canHearSpeech } from '../src/game/socialSpeech'
import { WhisperService } from '../src/game/whispers'
import { exchangeFixture } from './exchangeFixture'

function fixture() {
    const f = exchangeFixture()
    const stranger = new GameCharacter({
        id: 'stranger',
        nickname: 'stranger',
        archetype: 'human',
        controllerKind: 'network_player',
        faction: 'peaceful',
        spawnPosition: { x: 80, y: 80 },
    })
    const actors = [f.a, f.b, stranger]
    const heard: string[] = []
    const whispers = new WhisperService({
        getCharacter: (id) => actors.find((actor) => actor.id === id),
        navigationFor: () => f.navigation,
        heard: (actor, listener, message) =>
            heard.push(`${actor.id}:${listener.id}:${message.text}`),
    })
    return { ...f, stranger, whispers, heard }
}

it('stores private speech only for its exact pair and permits an ordinary reply', () => {
    const f = fixture()
    expect(
        f.whispers.handle(
            f.a,
            { type: 'whisper', targetId: f.b.id, text: 'Секрет' },
            0
        )
    ).toBe(true)
    expect(f.whispers.snapshot(f.b, 0)?.messages[0]?.text).toBe('Секрет')
    expect(f.whispers.snapshot(f.stranger, 0)).toBeNull()
    expect(
        f.whispers.handle(
            f.b,
            { type: 'whisper', targetId: f.a.id, text: 'Услышал' },
            1
        )
    ).toBe(true)
    expect(
        f.whispers.snapshot(f.a, 1)?.messages.map((message) => message.text)
    ).toEqual(['Секрет', 'Услышал'])
    expect(f.heard).toEqual(['a:b:Секрет', 'b:a:Услышал'])
})

it.each(['distance', 'location', 'death', 'disconnect', 'wall'] as const)(
    'revalidates %s on every send without adding a message',
    (reason) => {
        const f = fixture()
        f.whispers.handle(f.a, { type: 'whisper_open', targetId: f.b.id }, 0)
        if (reason === 'distance') {
            f.b.position.x += 49
        }
        if (reason === 'location') {
            f.b.locationId = 'map-0-0'
        }
        if (reason === 'death') {
            f.b.alive = false
        }
        if (reason === 'disconnect') {
            f.b.connected = false
        }
        if (reason === 'wall') {
            f.b.position.x = 128
            f.navigation.grid.solid[5 * 20 + 6] = true
        }
        expect(
            f.whispers.handle(
                f.a,
                { type: 'whisper', targetId: f.b.id, text: 'Не слышно' },
                1
            )
        ).toBe(false)
        expect(f.whispers.snapshot(f.a, 1)?.available).toBe(false)
        expect(f.whispers.snapshot(f.a, 1)?.messages).toEqual([])
        expect(f.heard).toEqual([])
    }
)

it('uses inclusive 48 and 80 unit boundaries and never hears across locations', () => {
    const f = fixture()
    f.b.position.x += 48
    expect(f.whispers.available(f.a, f.b, 0)).toBe(true)
    f.b.position.x += 32
    expect(canHearSpeech(f.b, f.a, f.navigation, 0)).toBe(true)
    f.b.position.x += 0.01
    expect(canHearSpeech(f.b, f.a, f.navigation, 0)).toBe(false)
    f.b.position.x = f.a.position.x
    f.b.locationId = 'map-0-0'
    expect(canHearSpeech(f.b, f.a, f.navigation, 0)).toBe(false)
})

it('parses bounded private speech and validates a public selection hint', () => {
    expect(
        parseClientMessage(
            JSON.stringify({
                type: 'whisper',
                targetId: 'b',
                text: 'x'.repeat(500),
            })
        ).message
    ).toMatchObject({ text: 'x'.repeat(400) })
    expect(
        parseClientMessage(
            JSON.stringify({
                type: 'chat',
                targetId: { id: 'b' },
                text: 'Привет',
            })
        ).message
    ).toBeUndefined()
    expect(
        parseClientMessage(
            JSON.stringify({ type: 'chat', targetId: 'b', text: 'Привет' })
        ).message
    ).toMatchObject({ targetId: 'b' })
})
