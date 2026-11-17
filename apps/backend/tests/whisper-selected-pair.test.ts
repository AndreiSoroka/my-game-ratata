import { expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
import { WhisperService } from '../src/game/whispers'

function fixture() {
    const actors = ['alice', 'bob', 'charlie'].map(
        (id) =>
            new GameCharacter({
                id,
                nickname: id,
                archetype: 'human',
                controllerKind: 'network_player',
                spawnPosition: { x: 80, y: 80 },
            })
    )
    const alice = actors[0],
        bob = actors[1],
        charlie = actors[2]
    if (alice === undefined || bob === undefined || charlie === undefined) {
        throw new Error('Missing whisper fixture actors')
    }
    const navigation = new NavigationService({
        id: 'whisper-selection',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const heard = vi.fn()
    const service = new WhisperService({
        getCharacter: (id) => actors.find((actor) => actor.id === id),
        navigationFor: () => navigation,
        heard,
    })
    return { alice, bob, charlie, service, heard }
}

it('keeps an explicitly opened pair stable when another person whispers, retaining the unseen pair history', () => {
    const f = fixture()
    expect(
        f.service.handle(
            f.alice,
            { type: 'whisper_open', targetId: f.bob.id },
            1000
        )
    ).toBe(true)
    expect(f.service.send(f.bob, f.alice, 'Сообщение Боба', 1001)).toBe(true)
    const displayed = f.service.snapshot(f.alice, 1001)
    expect(displayed?.partnerId).toBe(f.bob.id)
    expect(f.service.send(f.charlie, f.alice, 'Сообщение Чарли', 1002)).toBe(
        true
    )
    expect(f.service.snapshot(f.alice, 1002)).toEqual(displayed)
    expect(
        f.service.handle(
            f.alice,
            { type: 'whisper_open', targetId: f.charlie.id },
            1003
        )
    ).toBe(true)
    expect(f.service.snapshot(f.alice, 1003)).toMatchObject({
        partnerId: f.charlie.id,
        messages: [{ text: 'Сообщение Чарли' }],
    })
    expect(
        f.service.snapshot(f.bob, 1003)?.messages.map((message) => message.text)
    ).toEqual(['Сообщение Боба'])
    expect(f.heard).toHaveBeenCalledTimes(2)
})

it('pins the first incoming pair before a recipient opens its indicator or sends a first reply', () => {
    const f = fixture()
    expect(f.service.send(f.bob, f.alice, 'Первое входящее', 1000)).toBe(true)
    const displayed = f.service.snapshot(f.alice, 1000)
    expect(f.service.send(f.charlie, f.alice, 'Другое входящее', 1001)).toBe(
        true
    )
    expect(f.service.snapshot(f.alice, 1001)).toEqual(displayed)
    expect(f.service.handle(f.alice, { type: 'whisper_close' }, 1002)).toBe(
        true
    )
    expect(f.service.snapshot(f.alice, 1002)).toBeNull()
    expect(
        f.service.handle(
            f.alice,
            { type: 'whisper_open', targetId: f.charlie.id },
            1003
        )
    ).toBe(true)
    expect(f.service.snapshot(f.alice, 1003)).toMatchObject({
        partnerId: f.charlie.id,
        messages: [{ text: 'Другое входящее' }],
    })
    expect(
        f.service.handle(
            f.alice,
            { type: 'whisper', targetId: f.charlie.id, text: 'Ответ Чарли' },
            1004
        )
    ).toBe(true)
    expect(
        f.service
            .snapshot(f.charlie, 1004)
            ?.messages.map((message) => message.text)
    ).toEqual(['Другое входящее', 'Ответ Чарли'])
})

it('keeps a trade view pinned without changing the separately selected whisper pair', () => {
    const f = fixture()
    f.service.handle(
        f.alice,
        { type: 'whisper_open', targetId: f.bob.id },
        1000
    )
    f.service.send(f.charlie, f.alice, 'Личное Чарли', 1001)
    expect(f.service.snapshot(f.alice, 1002, f.charlie.id)?.partnerId).toBe(
        f.charlie.id
    )
    expect(f.service.snapshot(f.alice, 1002)?.partnerId).toBe(f.bob.id)
    f.service.handle(f.alice, { type: 'whisper_close' }, 1003)
    expect(f.service.snapshot(f.alice, 1003)).toBeNull()
})
