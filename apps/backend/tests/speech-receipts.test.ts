import type { GameEventPayload, ServerMessage } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { CompanionService } from '../src/game/companions'
import { PartyService } from '../src/game/parties'
import { publishRoomEvents } from '../src/game/roomEvents'
import { broadcastChat, type RoomSocket } from '../src/game/roomMessaging'
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
