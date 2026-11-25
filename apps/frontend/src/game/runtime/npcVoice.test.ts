import {
    CENTER_LOCATION_ID,
    type GameEventPayload,
    PUBLIC_SPEECH_RADIUS,
    type WorldLocation,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { NpcVoice, type NpcVoiceContext } from './npcVoice'

class FakeUtterance {
    public onend: (() => void) | null = null
    public onerror: (() => void) | null = null
    public volume = 1

    public constructor(public readonly text: string) {}
}

class FakeSynthesis extends EventTarget {
    public readonly speak = vi.fn<(utterance: FakeUtterance) => void>()
    public readonly cancel = vi.fn<() => void>()
    public voices: SpeechSynthesisVoice[] = []

    public getVoices() {
        return this.voices
    }

    public setVoices(voices: SpeechSynthesisVoice[]) {
        this.voices = voices
        this.dispatchEvent(new Event('voiceschanged'))
    }
}

function voice(voiceURI: string, lang = 'ru-RU', localService = true): SpeechSynthesisVoice {
    return { voiceURI, lang, localService, default: false, name: voiceURI }
}

function snapshot(distance = 20) {
    return {
        ...worldFixture([
            characterFixture('hero'),
            characterFixture('npc', {
                controllerKind: 'scripted',
                position: { x: distance, y: 0 },
            }),
        ]),
        location: { id: CENTER_LOCATION_ID } as WorldLocation,
        serverEpoch: 'world',
    }
}

function speech(speechId = 1, overrides: Partial<GameEventPayload> = {}): GameEventPayload {
    return {
        kind: 'chat',
        actorId: 'npc',
        locationId: CENTER_LOCATION_ID,
        voice: 'ambient',
        speechId,
        text: 'Привет!',
        ...overrides,
    }
}

const players: NpcVoice[] = []

function createPlayer(context: NpcVoiceContext): NpcVoice {
    const player = new NpcVoice(() => context)
    players.push(player)
    return player
}

function setup(voices = [voice('Pavel')]) {
    const synthesis = new FakeSynthesis()
    synthesis.voices = voices
    vi.stubGlobal('speechSynthesis', synthesis)
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    const context: NpcVoiceContext = {
        enabled: true,
        snapshot: snapshot(),
        playerId: 'hero',
        mapId: CENTER_LOCATION_ID,
    }
    return { player: createPlayer(context), context, synthesis }
}

function completeLatest(synthesis: FakeSynthesis): void {
    synthesis.speak.mock.lastCall?.[0].onend?.()
}

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
    for (const player of players.splice(0)) player.dispose()
    window.localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

it('keeps the original local Russian voice and sound across games with a temporary fallback', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const irina = voice('Irina', 'ru_RU')
    const pavel = voice('Pavel')
    const { context, player, synthesis } = setup([
        voice('ZZ online Russian', 'ru-RU', false),
        voice('ZZ English', 'en-GB'),
        pavel,
        irina,
    ])
    player.receive(speech())
    expect(synthesis.speak).toHaveBeenLastCalledWith(
        expect.objectContaining({ voice: pavel, rate: 1.28, pitch: 1.2, lang: 'ru-RU' })
    )
    player.dispose()
    random.mockReturnValue(0)

    synthesis.setVoices([irina])
    const rejoined = createPlayer(context)
    rejoined.receive(speech(2))
    expect(synthesis.speak).toHaveBeenLastCalledWith(
        expect.objectContaining({ voice: irina, rate: 1.28, pitch: 1.2 })
    )

    completeLatest(synthesis)
    synthesis.setVoices([irina, pavel])
    rejoined.receive(speech(3))
    expect(synthesis.speak).toHaveBeenLastCalledWith(
        expect.objectContaining({ voice: pavel, rate: 1.28, pitch: 1.2 })
    )
})

it('waits for a local Russian voice and declines an expired line', () => {
    const { player, synthesis } = setup([voice('Remote', 'ru', false), voice('English', 'en')])
    player.receive(speech())
    expect(synthesis.speak).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3_000)
    synthesis.setVoices([voice('Irina')])
    expect(synthesis.speak).not.toHaveBeenCalled()

    synthesis.setVoices([])
    player.receive(speech(2))
    vi.advanceTimersByTime(2_999)
    synthesis.setVoices([voice('Irina')])
    expect(synthesis.speak).toHaveBeenCalledOnce()
})

it('voices English NPC speech with an installed local English voice', () => {
    const russian = voice('Pavel')
    const english = voice('Kate', 'en-GB')
    const { player, synthesis } = setup([russian, voice('Remote English', 'en-US', false)])
    player.receive(speech(1, { language: 'en', text: 'Welcome to Novogorod.' }))
    expect(synthesis.speak).not.toHaveBeenCalled()

    synthesis.setVoices([russian, english])
    expect(synthesis.speak).toHaveBeenLastCalledWith(
        expect.objectContaining({ voice: english, lang: 'en-GB', text: 'Welcome to Novogorod.' })
    )
    completeLatest(synthesis)
    player.receive(speech(2))
    expect(synthesis.speak).toHaveBeenLastCalledWith(
        expect.objectContaining({ voice: russian, lang: 'ru-RU' })
    )
})

it.each([
    {
        language: 'ru',
        voice: 'dialogue',
        text: String.raw`**Привет**, Саэла!\\n<break time="1s"/>«[Зачистка троп](https://example.test/quest)»&#x20;— 30 золотых.\\`,
        expected: 'Привет, Саэла! «Зачистка троп» — 30 золотых.',
    },
    {
        language: 'en',
        voice: 'ambient',
        text: String.raw`&lt;speak&gt;Go \\north / east.\\tDon't forget the _way-stone_!&lt;/speak&gt;`,
        expected: "Go north east. Don't forget the way-stone!",
    },
] as const)('speaks plain $language text and preserves the original line', (entry) => {
    const { player, synthesis } = setup([voice('Pavel'), voice('Kate', 'en-GB')])
    const event = speech(1, { language: entry.language, voice: entry.voice, text: entry.text })
    player.receive(event)
    expect(synthesis.speak).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: entry.expected })
    )
    expect(event.text).toBe(entry.text)
})

it('skips an empty cleaned dialogue without interrupting an ambient line', () => {
    const { player, synthesis } = setup()
    player.receive(speech())
    player.receive(speech(2, { voice: 'dialogue', text: '<break/> ** … / \\\\' }))
    expect(synthesis.speak).toHaveBeenCalledTimes(1)
    expect(synthesis.cancel).not.toHaveBeenCalled()
})

it('assigns pitch and rate separately when NPCs share the only installed voice', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const local = voice('Irina')
    const { context, player, synthesis } = setup([local])
    const world = snapshot()
    world.characters.push(characterFixture('another', { controllerKind: 'scripted' }))
    context.snapshot = world
    player.receive(speech())
    expect(synthesis.speak).toHaveBeenLastCalledWith(
        expect.objectContaining({ voice: local, rate: 0.76, pitch: 0.8 })
    )
    completeLatest(synthesis)

    random.mockReturnValue(0.99)
    player.receive(speech(1, { actorId: 'another' }))
    expect(synthesis.speak).toHaveBeenLastCalledWith(
        expect.objectContaining({ voice: local, rate: 1.28, pitch: 1.2 })
    )
})

it('uses the latest positions at playback and fades to 3 percent at the edge', () => {
    const { context, player, synthesis } = setup()
    player.receive(speech())
    expect(synthesis.speak.mock.lastCall?.[0].volume).toBe(1)
    player.receive(speech(2))
    context.snapshot = snapshot(48)
    player.refresh()
    expect(synthesis.speak.mock.lastCall?.[0].volume).toBe(1)
    completeLatest(synthesis)
    expect(synthesis.speak.mock.lastCall?.[0].volume).toBeCloseTo(0.3467)
    completeLatest(synthesis)

    context.snapshot = snapshot(PUBLIC_SPEECH_RADIUS)
    player.receive(speech(3))
    expect(synthesis.speak.mock.lastCall?.[0].volume).toBe(0.03)
    completeLatest(synthesis)
    context.snapshot = snapshot(PUBLIC_SPEECH_RADIUS + 1)
    player.receive(speech(4))
    context.snapshot.characters = [characterFixture('hero')]
    player.receive(speech(5))
    expect(synthesis.speak).toHaveBeenCalledTimes(3)
})

it('voices an authorized nearby speaker outside the viewport using only the audio source position', () => {
    const { context, player, synthesis } = setup()
    const world = snapshot(48)
    const speaker = world.characters[1]!
    world.characters = [world.characters[0]!]
    context.snapshot = {
        ...world,
        footstepSources: [
            {
                id: speaker.id,
                alive: speaker.alive,
                position: speaker.position,
                velocity: speaker.velocity,
                archetype: speaker.archetype,
            },
        ],
    }
    player.receive(speech())
    expect(synthesis.speak.mock.lastCall?.[0].volume).toBeCloseTo(0.3467)
    expect(context.snapshot.characters).toHaveLength(1)
    completeLatest(synthesis)

    context.snapshot.footstepSources![0]!.alive = false
    player.receive(speech(2))
    expect(synthesis.speak).toHaveBeenCalledTimes(1)
})

it('preempts ambient speech with a dialogue and keeps the newest pending dialogue', () => {
    const { player, synthesis } = setup()
    player.receive(speech(1, { text: 'Фон' }))
    const interrupted = synthesis.speak.mock.lastCall?.[0]
    player.receive(speech(2, { voice: 'dialogue', text: 'Начало диалога' }))
    expect(synthesis.cancel).toHaveBeenCalledOnce()
    interrupted?.onerror?.()
    player.receive(speech(3, { voice: 'dialogue', text: 'Старая реплика' }))
    player.receive(speech(4, { voice: 'dialogue', text: 'Новая реплика' }))
    player.receive(speech(5, { text: 'Другой фон' }))
    expect(synthesis.speak).toHaveBeenCalledTimes(2)

    completeLatest(synthesis)
    expect(synthesis.speak).toHaveBeenCalledTimes(3)
    expect(synthesis.speak).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: 'Новая реплика' })
    )
    completeLatest(synthesis)
    expect(synthesis.speak).toHaveBeenCalledTimes(3)
})

it('accepts only live voice events on the active map and deduplicates per identity and epoch', () => {
    const { context, player, synthesis } = setup()
    player.receive({ kind: 'chat', actorId: 'npc', text: 'Нет разрешения', speechId: 20 })
    player.receive(speech(20, { locationId: 'other-map' }))
    player.receive(speech(1))
    completeLatest(synthesis)
    player.receive(speech(1))
    player.receive(speech(2))
    completeLatest(synthesis)
    expect(synthesis.speak).toHaveBeenCalledTimes(2)

    context.snapshot = { ...snapshot(), serverEpoch: 'another-world' }
    player.receive(speech(1))
    expect(synthesis.speak).toHaveBeenCalledTimes(3)
})

it('does not replay speech received while sound was disabled', () => {
    const { context, player, synthesis } = setup()
    context.enabled = false
    player.receive(speech())
    context.enabled = true
    player.receive(speech())
    expect(synthesis.speak).not.toHaveBeenCalled()
    player.receive(speech(2))
    expect(synthesis.speak).toHaveBeenCalledOnce()
})

it.each(['disabled', 'dead', 'travel'] as const)(
    'cancels playback and drops pending speech when %s',
    (reason) => {
        const { context, player, synthesis } = setup()
        player.receive(speech())
        const old = synthesis.speak.mock.lastCall?.[0]
        player.receive(speech(2))
        if (reason === 'disabled') context.enabled = false
        if (reason === 'dead') {
            context.snapshot = {
                ...snapshot(),
                characters: [characterFixture('hero', { alive: false })],
            }
        }
        if (reason === 'travel') context.mapId = 'other-map'
        player.refresh()
        expect(synthesis.cancel).toHaveBeenCalledOnce()

        context.enabled = true
        context.mapId = CENTER_LOCATION_ID
        context.snapshot = snapshot()
        old?.onend?.()
        player.refresh()
        player.receive(speech(2))
        expect(synthesis.speak).toHaveBeenCalledOnce()
    }
)

it('recovers after a speech engine fails to finish', () => {
    const { player, synthesis } = setup()
    player.receive(speech())
    vi.advanceTimersByTime(59_000)
    player.receive(speech(2))
    vi.advanceTimersByTime(1_000)
    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
})
