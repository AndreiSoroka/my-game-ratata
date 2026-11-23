import type {
    ClientMessage,
    GameLocale,
    ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import {
    attributeNpcSpeech,
    createSpeechEvent,
} from '../src/game/speechReceipts'
import type { SpeechTranslator } from '../src/game/speechTranslation'

function fixture() {
    const requested: Array<(translation: string | undefined) => void> = []
    const translate = vi.fn<SpeechTranslator['translate']>(
        () => new Promise((resolve) => requested.push(resolve))
    )
    const stop = vi.fn()
    const navigation = new NavigationService({
        id: 'speech-fixture',
        solidLayerNames: [],
        width: 100,
        height: 100,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(10000).fill(false),
    })
    const room = new GameRoom(navigation, {
        speechTranslator: { translate, stop },
    })
    rooms.push(room)
    const visible = vi
        .spyOn(room.navigation, 'hasLineOfSight')
        .mockReturnValue(true)
    function connect(nickname: string, locale?: GameLocale) {
        const received: ServerMessage[] = []
        const socket = {
            send: (json: string) =>
                received.push(JSON.parse(json) as ServerMessage),
        } as RoomSocket
        const send = (message: ClientMessage) =>
            room.handleMessage(socket, JSON.stringify(message))
        room.handleOpen(socket)
        send({
            type: 'join',
            nickname,
            ...(locale === undefined ? {} : { locale }),
        })
        const init = received.find((message) => message.type === 'world_init')
        const actor = room.getCharacter(init?.playerId ?? '')
        if (actor === undefined) {
            throw new Error('Missing joined actor')
        }
        actor.position = { x: 360, y: 1000 }
        return {
            actor,
            socket,
            send,
            received,
            original: () =>
                received.flatMap((message) =>
                    message.type === 'event' && message.event.kind === 'chat'
                        ? [message.event]
                        : []
                ),
            translations: () =>
                received.filter(
                    (message) => message.type === 'speech_translation'
                ),
            snapshot: () =>
                room.snapshot(Date.now(), actor.locationId, actor.id).social,
        }
    }
    async function finish(index: number, text: string | undefined) {
        await Promise.resolve()
        requested[index]?.(text)
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    return { room, visible, translate, stop, connect, finish }
}

const rooms: GameRoom[] = []
beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => {
    rooms.splice(0).forEach((room) => room.stop())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

it(
    'sends the original immediately and translates once for eligible recipients in each direction',
    { timeout: 30_000 },
    async () => {
        const f = fixture()
        const russian = f.connect('Russian')
        const first = f.connect('First', 'en')
        const second = f.connect('Second', 'en')
        const far = f.connect('Far', 'en')
        far.actor.position.x += 100
        russian.send({ type: 'chat', text: 'Привет, друг!' })
        expect(first.original()).toMatchObject([
            { text: 'Привет, друг!', language: 'ru' },
        ])
        expect(first.translations()).toEqual([])
        expect(far.original()[0]?.text).not.toBe('Привет, друг!')
        far.actor.position.x -= 100
        await f.finish(0, 'Hello, friend!')
        expect(f.translate).toHaveBeenCalledExactlyOnceWith(
            'Привет, друг!',
            'ru',
            'en'
        )
        expect(first.translations()).toEqual([
            {
                type: 'speech_translation',
                actorId: russian.actor.id,
                speechId: first.original()[0]?.speechId,
                locale: 'en',
                text: 'Hello, friend!',
            },
        ])
        expect(second.translations()).toEqual(first.translations())
        expect(far.translations()).toEqual([])
        expect(russian.translations()).toEqual([])
        first.send({ type: 'chat', text: 'The road is clear.' })
        await f.finish(1, 'Дорога свободна.')
        expect(f.translate).toHaveBeenLastCalledWith(
            'The road is clear.',
            'en',
            'ru'
        )
        expect(russian.translations()).toMatchObject([
            { locale: 'ru', text: 'Дорога свободна.' },
        ])
    }
)

it('does not send a translation through a wall or after locale, socket and room changes', async () => {
    const f = fixture()
    const author = f.connect('Author')
    const listener = f.connect('Listener', 'en')
    f.visible.mockReturnValue(false)
    author.send({ type: 'chat', text: 'За стеной.' })
    await f.finish(0, 'Behind the wall.')
    expect(f.translate).not.toHaveBeenCalled()
    expect(listener.original()[0]?.language).toBeUndefined()
    f.visible.mockReturnValue(true)
    author.send({ type: 'chat', text: 'Старая настройка.' })
    listener.send({ type: 'set_locale', locale: 'ru' })
    listener.send({ type: 'set_locale', locale: 'en' })
    await f.finish(0, 'Old setting.')
    expect(listener.translations()).toEqual([])
    author.send({ type: 'chat', text: 'Старое соединение.' })
    f.room.handleClose(listener.socket)
    const newListener = f.connect('Listener', 'en')
    expect(newListener.actor.id).toBe(listener.actor.id)
    await f.finish(1, 'Old connection.')
    expect(listener.translations()).toEqual([])
    expect(newListener.translations()).toEqual([])
    author.send({ type: 'chat', text: 'Мир закрывается.' })
    f.room.stop()
    await f.finish(2, 'Server stopped.')
    expect(newListener.translations()).toEqual([])
    expect(f.stop).toHaveBeenCalledTimes(1)
})

it('keeps whisper translations in the exact recipient projection and preserves an addressed NPC answer', async () => {
    const f = fixture()
    const author = f.connect('Author')
    const asker = f.connect('Asker', 'en')
    const other = f.connect('Bystander', 'en')
    author.send({
        type: 'whisper',
        text: 'Тайное письмо.',
        targetId: asker.actor.id,
    })
    const receipt = asker.snapshot()?.whisper?.messages[0]?.id
    expect(receipt).toBeDefined()
    expect(asker.snapshot()?.whisper?.messages[0]?.translation).toBeUndefined()
    await f.finish(0, 'Secret letter.')
    const translation = { locale: 'en', text: 'Secret letter.' }
    expect(asker.snapshot()?.privateMessages).toMatchObject([
        { id: receipt, translation },
    ])
    expect(asker.snapshot()?.whisper?.messages).toMatchObject([
        { id: receipt, translation },
    ])
    expect(author.snapshot()?.privateMessages?.[0]?.translation).toBeUndefined()
    expect(other.snapshot()?.privateMessages).toEqual([])
    expect(asker.translations()).toEqual([])
    const npc = f.room.getCharacter('npc_friendly_girl_1')
    if (npc === undefined) {
        throw new Error('Missing dialogue NPC')
    }
    npc.position = { ...asker.actor.position }
    expect(
        f.room.social.whispers.send(
            npc,
            asker.actor,
            'Ответ шёпотом.',
            Date.now(),
            {
                language: 'ru',
                keepOriginalForRecipient: true,
            }
        )
    ).toBe(true)
    const event = attributeNpcSpeech(
        createSpeechEvent(npc, 'Ответ вслух.'),
        asker.actor.id
    )
    f.room.publishEvents([event, event])
    await f.finish(1, 'A spoken reply.')
    expect(f.translate).toHaveBeenCalledTimes(2)
    expect(other.translations()).toMatchObject([
        { text: 'A spoken reply.', speechId: event.speechId },
    ])
    expect(asker.translations()).toEqual([])
    expect(
        asker
            .snapshot()
            ?.privateMessages?.find((speech) => speech.senderId === npc.id)
            ?.translation
    ).toBeUndefined()
})

it('accepts locale only on the owning connection and defaults unmodified joins to Russian', () => {
    const f = fixture()
    const a = f.connect('Player A')
    const b = f.connect('Player B', 'en')
    f.room.handleMessage(
        a.socket,
        JSON.stringify({
            type: 'set_locale',
            locale: 'en',
            actorId: b.actor.id,
        })
    )
    f.room.handleMessage(
        a.socket,
        JSON.stringify({ type: 'set_locale', locale: 'de' })
    )
    expect(
        a.received.filter((message) => message.type === 'error')
    ).toHaveLength(2)
    expect(f.room.localeFor(a.actor.id)).toBe('ru')
    a.send({ type: 'set_locale', locale: 'en' })
    b.send({ type: 'set_locale', locale: 'ru' })
    expect(f.room.localeFor(a.actor.id)).toBe('en')
    expect(f.room.localeFor(b.actor.id)).toBe('ru')
})
