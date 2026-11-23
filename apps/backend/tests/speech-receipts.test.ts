import {
    type GameEventPayload,
    PUBLIC_SPEECH_RADIUS,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { CompanionService } from '../src/game/companions'
import { NavigationService } from '../src/game/navigation'
import { PartyService } from '../src/game/parties'
import { publishRoomEvents } from '../src/game/roomEvents'
import { broadcastChat, type RoomSocket } from '../src/game/roomMessaging'
import { createSpeechEvent } from '../src/game/speechReceipts'
import { WorldLocations } from '../src/game/worldLocations'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function socket() {
    const sent: ServerMessage[] = []
    const ws = {
        send: (text: string) => sent.push(JSON.parse(text) as ServerMessage),
    } as RoomSocket
    return { ws, sent }
}
function speaker() {
    return new GameCharacter({
        id: 'npc_friendly_girl_1',
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        nickname: 'Мира',
        spawnPosition: { x: 100, y: 100 },
    })
}

function speechRoom(npc: GameCharacter, observers: GameCharacter[]) {
    const actors = [npc, ...observers]
    const characters = new Map(actors.map((actor) => [actor.id, actor]))
    const receivers = new Map(
        observers.map((observer) => [observer.id, socket()])
    )
    const connections = new Map(
        [...receivers].map(([id, receiver]) => [receiver.ws, id])
    )
    const navigation = new NavigationService({
        ...abilityContext(actors).navigation.grid,
        id: 'npc-speech-test',
    })
    const world = new WorldLocations(navigation)
    const adventure = new AdventureService()
    const parties = new PartyService()
    return {
        adventure,
        navigation,
        publish(events: GameEventPayload[]) {
            publishRoomEvents(
                events,
                characters,
                adventure,
                parties,
                () => connections.keys(),
                connections,
                world
            )
        },
        heard(observer: GameCharacter) {
            return receivers
                .get(observer.id)
                ?.sent.flatMap((message) =>
                    message.type === 'event' ? [message.event] : []
                )
        },
    }
}

it('repeated equal dialogue choices get fresh receipts while snapshots remain stable', () => {
    const service = new AdventureService({ now: () => 1000 })
    const actor = abilityHero()
    const npc = speaker()
    const initial = service.interact(actor, npc.id, [npc])[0]
    const first = service.choose(actor, 'ask_dragon', [npc])[0]
    const firstSnapshot = service.snapshot(
        actor.id,
        actor.locationId,
        actor
    ).dialogue
    const secondSnapshot = service.snapshot(
        actor.id,
        actor.locationId,
        actor
    ).dialogue
    expect(initial?.speechId).toBe(1)
    expect(first?.speechId).toBe(2)
    expect(firstSnapshot?.speechId).toBe(first?.speechId)
    expect(secondSnapshot).toEqual(firstSnapshot)
    const second = service.choose(actor, 'ask_dragon', [npc])[0]
    expect(second?.text).toBe(first?.text)
    expect(second?.speechId).toBe(3)
    expect(service.snapshot(actor.id).dialogue?.speechId).toBe(second?.speechId)
    expect(second?.audienceIds).toEqual([actor.id])
})

it('publication stamps an utterance once and preserves its private audience and repeated-text identity', () => {
    const actor = abilityHero()
    const other = abilityHero()
    const npc = speaker()
    const receiver = socket()
    const outsider = socket()
    const characters = new Map(
        [actor, other, npc].map((character) => [character.id, character])
    )
    const connections = new Map([
        [receiver.ws, actor.id],
        [outsider.ws, other.id],
    ])
    const service = new AdventureService({ now: () => 1000 })
    const parties = new PartyService()
    const publish = (event: GameEventPayload) =>
        publishRoomEvents(
            [event],
            characters,
            service,
            parties,
            () => connections.keys(),
            connections
        )
    const first: GameEventPayload = {
        kind: 'chat',
        actorId: npc.id,
        text: 'Тот же ответ.',
        audienceIds: [actor.id],
    }
    publish(first)
    publish(first)
    const next: GameEventPayload = {
        kind: 'chat',
        actorId: npc.id,
        text: 'Тот же ответ.',
        audienceIds: [actor.id],
    }
    publish(next)
    expect(first.speechId).toBe(1)
    expect(next.speechId).toBe(2)
    expect(first.audienceIds).toEqual([actor.id])
    expect(outsider.sent).toHaveLength(0)
    const delivered = receiver.sent
        .filter((message) => message.type === 'event')
        .map((message) => message.event)
    expect(delivered.map((event) => event.speechId)).toEqual([1, 1, 2])
    expect(delivered.every((event) => event.audienceIds === undefined)).toBe(
        true
    )
})

it('player chat shares one receipt across observers and increments on repeated equal text', () => {
    const actor = abilityHero()
    const observer = abilityHero()
    observer.position.x += 200
    const nearby = socket()
    const far = socket()
    const characters = new Map(
        [actor, observer].map((character) => [character.id, character])
    )
    const connections = new Map([
        [nearby.ws, actor.id],
        [far.ws, observer.id],
    ])
    broadcastChat(connections, characters, actor, 'Привет')
    broadcastChat(connections, characters, actor, 'Привет')
    const ids = (messages: ServerMessage[]) =>
        messages
            .filter((message) => message.type === 'event')
            .map((message) => message.event.speechId)
    expect(ids(nearby.sent)).toEqual([1, 2])
    expect(ids(far.sent)).toEqual([1, 2])
})

it('companion answers remain private to the requester when published', () => {
    const actor = abilityHero()
    const other = abilityHero()
    const npc = speaker()
    const service = new CompanionService()
    const events = service.handle(
        actor,
        { type: 'companion_request', request: 'talk', targetId: npc.id },
        [actor, npc],
        1000
    )
    expect(events[0]).toMatchObject({
        kind: 'chat',
        speechId: 1,
        targetId: actor.id,
        audienceIds: [actor.id],
    })
    const receiver = socket()
    const outsider = socket()
    const characters = new Map(
        [actor, other, npc].map((character) => [character.id, character])
    )
    const connections = new Map([
        [receiver.ws, actor.id],
        [outsider.ws, other.id],
    ])
    publishRoomEvents(
        events,
        characters,
        new AdventureService(),
        new PartyService(),
        () => connections.keys(),
        connections
    )
    expect(receiver.sent).toHaveLength(1)
    expect(outsider.sent).toHaveLength(0)
    expect(events[0]?.speechId).toBe(1)
})

it('re-reading a sign gets a new receipt while ordinary snapshot reads preserve it', () => {
    const actor = abilityHero()
    const service = new AdventureService({
        now: () => 1000,
        worldObjects: [
            {
                id: 'notice',
                kind: 'sign',
                name: 'Знак',
                text: 'Одинаковая надпись',
                locationId: actor.locationId,
                bounds: { x: 100, y: 100, width: 16, height: 16 },
            },
        ],
    })
    const command = { type: 'world_interact', objectId: 'notice' } as const
    service.handle(actor, command, [], abilityContext([actor]).navigation)
    expect(service.snapshot(actor.id).dialogue?.speechId).toBe(1)
    expect(service.snapshot(actor.id).dialogue?.speechId).toBe(1)
    service.handle(actor, command, [], abilityContext([actor]).navigation)
    expect(service.snapshot(actor.id).dialogue?.speechId).toBe(2)
})

it('projects one speaking mob utterance separately at the hearing edge, beyond it, and behind a wall', () => {
    const npc = new GameCharacter({
        id: 'voice-slime',
        nickname: 'Капля',
        archetype: 'slime',
        controllerKind: 'mob1',
        soul: { canSpeak: true },
        spawnPosition: { x: 100, y: 100 },
    })
    const near = abilityHero()
    const edge = abilityHero()
    const far = abilityHero()
    const behindWall = abilityHero()
    near.position = { x: 124, y: 100 }
    edge.position = { x: 100 + PUBLIC_SPEECH_RADIUS, y: 100 }
    far.position = { x: edge.position.x + 1, y: 100 }
    behindWall.position = { x: 100, y: 132 }
    const room = speechRoom(npc, [near, edge, far, behindWall])
    room.navigation.setResourceObstacles([
        { x: 96, y: 112, width: 16, height: 16 },
    ])
    const event = createSpeechEvent(npc, 'Я рядом.')

    room.publish([event])

    for (const observer of [near, edge]) {
        expect(room.heard(observer)).toEqual([
            expect.objectContaining({
                actorId: npc.id,
                locationId: npc.locationId,
                speechId: event.speechId,
                text: event.text,
                voice: 'ambient',
            }),
        ])
    }
    for (const observer of [far, behindWall]) {
        const messages = room.heard(observer)
        expect(messages).toHaveLength(1)
        expect(messages?.[0]?.text).not.toBe(event.text)
        expect(messages?.[0]).not.toHaveProperty('voice')
    }
    expect(event).not.toHaveProperty('voice')
})

it('marks a live Adventure dialogue for its recipient only and removes the voice if reach is lost', () => {
    const npc = speaker()
    const recipient = abilityHero()
    const other = abilityHero()
    const room = speechRoom(npc, [recipient, other])
    const dialogue = room.adventure.interact(
        recipient,
        npc.id,
        [npc],
        room.navigation
    )

    room.publish(dialogue)
    recipient.position.x += 60
    room.publish(dialogue)

    const messages = room.heard(recipient)
    expect(messages).toHaveLength(2)
    expect(messages?.[0]).toMatchObject({
        actorId: npc.id,
        locationId: npc.locationId,
        targetId: recipient.id,
        voice: 'dialogue',
    })
    expect(messages?.[0]).not.toHaveProperty('audienceIds')
    expect(messages?.[1]).toMatchObject({ text: messages?.[0]?.text })
    expect(messages?.[1]).not.toHaveProperty('voice')
    expect(room.heard(other)).toHaveLength(0)
})

it('omits voice for player chat, whispers, and an event with a hidden speaker', () => {
    const npc = speaker()
    const player = abilityHero()
    const observer = abilityHero()
    const room = speechRoom(npc, [player, observer])
    room.publish([
        createSpeechEvent(player, 'Игрок говорит.'),
        { ...createSpeechEvent(npc, 'Шёпот.'), channel: 'whisper' },
        { ...createSpeechEvent(npc, 'С другой карты.'), locationId: 'map-2-1' },
    ])

    const messages = room.heard(observer)
    expect(messages).toHaveLength(3)
    expect(messages?.map((event) => event.voice)).toEqual([
        undefined,
        undefined,
        undefined,
    ])
    expect(messages?.[2]).not.toHaveProperty('actorId')
})
