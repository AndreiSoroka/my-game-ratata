import { describe, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { receiveNpcSpeech } from '../src/ai/dialogueReception'
import { createNpcAiState } from '../src/ai/runtimeState'
import type { NpcAiEvent } from '../src/ai/types'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
import { canHearSpeech } from '../src/game/socialSpeech'
import { WhisperService } from '../src/game/whispers'

function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Missing expected test actor')
    }
    return value
}

function fixture() {
    const human = new GameCharacter({
        id: 'human',
        nickname: 'Human',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 80, y: 80 },
    })
    const npcs = ['first', 'second'].map(
        (id, index) =>
            new GameCharacter({
                id,
                nickname: id,
                archetype: 'human',
                controllerKind: 'scripted',
                spawnPosition: { x: 120 + index * 16, y: 80 },
            })
    )
    const nav = new NavigationService({
        id: 'speech',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const config = parseNpcAiConfig(
        {
            npcs: npcs.map((actor) => ({
                actorId: actor.id,
                role: 'companion',
            })),
        },
        true
    )
    const states = new Map(
        config.npcs.map((npc, index) => [
            npc.actorId,
            createNpcAiState(npc, npcs[index]),
        ])
    )
    const room = { navigationFor: () => nav }
    const event = (
        id = 'source'
    ): Extract<NpcAiEvent, { kind: 'message' }> => ({
        kind: 'message',
        id,
        senderId: human.id,
        text: 'Сходишь к торговцу?',
        channel: 'say',
        locationId: human.locationId,
        position: { ...human.position },
        at: 10_000,
    })
    const heard = vi.fn()
    const actors = new Map([human, ...npcs].map((actor) => [actor.id, actor]))
    const whispers = new WhisperService({
        getCharacter: (id) => actors.get(id),
        navigationFor: () => nav,
        heard,
    })
    return {
        human,
        first: required(npcs[0]),
        second: required(npcs[1]),
        nav,
        states,
        room,
        event,
        whispers,
        heard,
    }
}

it('honours an authored Cyrillic name in undirected speech without guessing substrings', () => {
    const f = fixture()
    const mira = new GameCharacter({
        id: 'npc_friendly_girl_1',
        nickname: 'Mira',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 100, y: 80 },
    })
    const config = required(
        parseNpcAiConfig(
            { npcs: [{ actorId: mira.id, role: 'city_coordinator' }] },
            true
        ).npcs[0]
    )
    const state = createNpcAiState(config, mira)
    f.states.set(mira.id, state)
    f.first.soul.companion = {
        leaderId: f.human.id,
        canFight: false,
        lastReply: null,
        order: 'follow',
    }
    receiveNpcSpeech(
        f.room,
        f.states,
        f.human,
        { ...f.event(), text: 'Мира, расскажи о городе.' },
        undefined,
        true
    )
    expect(state.inbox).toHaveLength(1)
    expect(f.states.get(f.first.id)?.inbox).toHaveLength(0)
})

describe('earned ordinary NPC speech', () => {
    it('hears exactly 80 units and rejects beyond range, other locations, dead and disconnected speakers', () => {
        const f = fixture()
        f.first.position = { x: 160, y: 80 }
        expect(canHearSpeech(f.first, f.human, f.nav, 10_000)).toBe(true)
        f.first.position.x = 160.01
        expect(canHearSpeech(f.first, f.human, f.nav, 10_000)).toBe(false)
        f.first.position.x = 120
        f.human.locationId = 'map-1-2'
        expect(canHearSpeech(f.first, f.human, f.nav, 10_000)).toBe(false)
        f.human.locationId = f.first.locationId
        f.human.connected = false
        expect(canHearSpeech(f.first, f.human, f.nav, 10_000)).toBe(false)
        f.human.connected = true
        f.human.alive = false
        expect(canHearSpeech(f.first, f.human, f.nav, 10_000)).toBe(false)
    })

    it('applies real occlusion and earned perception before passing text to the model', () => {
        const f = fixture()
        f.first.position.x = 160
        f.nav.grid.solid[5 * 20 + 7] = true
        receiveNpcSpeech(f.room, f.states, f.human, f.event(), f.first.id, true)
        expect(f.states.get(f.first.id)?.inbox).toEqual([])
        f.nav.grid.solid[5 * 20 + 7] = false
        f.human.movement.mode = 'sneaking'
        receiveNpcSpeech(
            f.room,
            f.states,
            f.human,
            f.event('hidden'),
            f.first.id,
            true
        )
        expect(f.states.get(f.first.id)?.inbox).toEqual([])
    })

    it('uses selected NPC before own companion and never substitutes an independent nearest target', () => {
        const f = fixture()
        f.first.soul.companion = {
            leaderId: f.human.id,
            canFight: false,
            lastReply: null,
            order: 'follow',
        }
        receiveNpcSpeech(
            f.room,
            f.states,
            f.human,
            f.event(),
            f.second.id,
            true
        )
        expect(f.states.get(f.first.id)?.inbox).toEqual([])
        expect(f.states.get(f.second.id)?.inbox).toHaveLength(1)
        receiveNpcSpeech(
            f.room,
            f.states,
            f.human,
            f.event('own'),
            undefined,
            true
        )
        expect(f.states.get(f.first.id)?.inbox).toHaveLength(1)
        expect(f.states.get(f.second.id)?.inbox).toHaveLength(1)
    })

    it('lets both ambiguous listeners hear one deduplicated source and bounds the queue', () => {
        const f = fixture()
        receiveNpcSpeech(f.room, f.states, f.human, f.event(), undefined, true)
        receiveNpcSpeech(f.room, f.states, f.human, f.event(), undefined, true)
        for (const state of f.states.values()) {
            expect(state.inbox).toHaveLength(1)
            expect(state.inbox[0]).toMatchObject({
                text: 'Сходишь к торговцу?',
                ambiguous: true,
            })
        }
        for (let index = 0; index < 12; index += 1) {
            receiveNpcSpeech(
                f.room,
                f.states,
                f.human,
                f.event(`bounded-${String(index)}`),
                undefined,
                true
            )
        }
        expect(
            [...f.states.values()].map((state) => state.inbox.length)
        ).toEqual([8, 8])
        receiveNpcSpeech(
            f.room,
            f.states,
            f.first,
            f.event('npc-loop'),
            undefined,
            true
        )
        expect(
            [...f.states.values()]
                .flatMap((state) => state.inbox)
                .some((event) => event.id === 'npc-loop')
        ).toBe(false)
    })
})

describe('private speech', () => {
    it('keeps whisper histories pair-scoped, lets the recipient reply and does not open a third pair', () => {
        const f = fixture()
        expect(f.whispers.send(f.human, f.first, 'Секрет Алисы', 10_000)).toBe(
            true
        )
        expect(f.whispers.snapshot(f.first, 10_000)?.messages[0]?.text).toBe(
            'Секрет Алисы'
        )
        expect(f.whispers.snapshot(f.second, 10_000)).toBeNull()
        expect(f.whispers.send(f.first, f.human, 'Личный ответ', 10_001)).toBe(
            true
        )
        expect(
            f.whispers
                .snapshot(f.human, 10_001)
                ?.messages.map((event) => event.text)
        ).toEqual(['Секрет Алисы', 'Личный ответ'])
        f.first.position.x = 128
        expect(f.whispers.send(f.human, f.first, 'Граница', 10_002)).toBe(true)
        f.first.position.x = 128.01
        expect(
            f.whispers.send(f.human, f.first, 'Слишком далеко', 10_003)
        ).toBe(false)
        expect(f.whispers.snapshot(f.human, 10_003)?.available).toBe(false)
        expect(f.heard).toHaveBeenCalledTimes(3)
    })

    it.each(['death', 'disconnect', 'location', 'occlusion'] as const)(
        'revalidates whisper on each message after %s',
        (reason) => {
            const f = fixture()
            expect(
                f.whispers.send(f.human, f.first, 'До изменения', 10_000)
            ).toBe(true)
            if (reason === 'death') {
                f.first.alive = false
            }
            if (reason === 'disconnect') {
                f.human.connected = false
            }
            if (reason === 'location') {
                f.first.locationId = 'map-1-2'
            }
            if (reason === 'occlusion') {
                f.nav.grid.solid[5 * 20 + 6] = true
            }
            expect(
                f.whispers.send(f.human, f.first, 'После изменения', 10_001)
            ).toBe(false)
            expect(f.heard).toHaveBeenCalledTimes(1)
        }
    )
})
