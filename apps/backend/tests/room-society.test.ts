import {
    CENTER_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { defaultNpcAiSettings } from '../src/ai/config'
import { createNpcAiState } from '../src/ai/runtimeState'
import { npcTemperamentContext } from '../src/ai/socialContext'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import type { ReactionAction } from '../src/game/characterReactions'
import { setCharacterControlSource } from '../src/game/characterSoul'
import { distance } from '../src/game/math'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { socialSpeechTrigger } from '../src/game/societyDialogue'
import { joinScenarioRoom, waitForScenario } from './scenarioRoomHelpers'

let room: GameRoom

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    vi.stubGlobal('Bun', { env: {} })
    room = new GameRoom(
        new NavigationService({
            id: 'society-room',
            width: 80,
            height: 80,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(80 * 80).fill(false),
            solidLayerNames: [],
        }),
        { emptyWorldMode: 'paused_when_empty' }
    )
    room.start()
})

afterEach(() => {
    room.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function citizen(id: string): GameCharacter {
    const actor = room.getCharacter(id)
    if (actor === undefined) {
        throw new Error(`Missing citizen ${id}`)
    }
    return actor
}

function permit(actor: GameCharacter, allowed: ReactionAction) {
    const react = actor.temperament.react.bind(actor.temperament)
    return vi
        .spyOn(actor.temperament, 'react')
        .mockImplementation((request, now) => ({
            ...react(request, now),
            ...(request.available.includes(allowed) ? { action: allowed } : {}),
        }))
}

function incident(suspectId: string, merchant: GameCharacter): void {
    expect(
        room.social.society.history.record(
            {
                id: 'caught-at-market',
                kind: 'theft',
                actorId: suspectId,
                targetId: merchant.id,
                locationId: CENTER_LOCATION_ID,
                at: room.gameplayNow(),
                severity: 3,
            },
            [merchant.id]
        )
    ).toBe(true)
}

it('takes an ordinary walk before copying a report to Mira while a player is present', () => {
    const { actor } = joinScenarioRoom(room, 'Visitor')
    const mira = citizen('npc_friendly_girl_1')
    const merchant = citizen('npc_merchant_1')
    const navigation = room.navigationFor(mira)
    const stand = navigation
        .findPathWorld(mira.position, merchant.spawnPosition)
        .findLast((point) => distance(point, merchant.spawnPosition) >= 96)
    if (stand === undefined) {
        throw new Error('No walking approach to the merchant')
    }
    mira.position = { ...stand }
    const before = { ...mira.position }
    permit(merchant, 'report')
    permit(mira, 'believe')
    incident(actor.id, merchant)
    const history = room.social.society.history
    vi.advanceTimersByTime(50)
    expect(mira.hasPath()).toBe(true)
    expect(history.knownIncidents(mira.id, CENTER_LOCATION_ID)).toHaveLength(0)
    waitForScenario(
        () => history.knownIncidents(mira.id, CENTER_LOCATION_ID).length > 0
    )
    expect(distance(mira.position, before)).toBeGreaterThan(32)
    expect(history.knownIncidents(mira.id, CENTER_LOCATION_ID)).toContainEqual(
        expect.objectContaining({
            heardFromId: merchant.id,
            firsthand: false,
            believed: true,
        })
    )
    const mind = createNpcAiState(
        {
            actorId: mira.id,
            role: 'city_coordinator',
            settings: defaultNpcAiSettings,
        },
        mira
    )
    expect(
        npcTemperamentContext(room, mind, mira, room.gameplayNow())
            .knownIncidents
    ).toContainEqual(
        expect.objectContaining({
            actorId: actor.id,
            sourceName: merchant.nickname,
            firsthand: false,
        })
    )
})

it('shares one delayed round without moving residents even with the world clock paused', () => {
    const player = joinScenarioRoom(room, 'Visitor')
    const mira = citizen('npc_friendly_girl_1')
    const merchant = citizen('npc_merchant_1')
    permit(merchant, 'report')
    permit(mira, 'believe')
    incident(player.actor.id, merchant)
    const before = { ...mira.position }
    const gameAt = room.gameplayNow()
    room.handleClose(player.socket)
    vi.advanceTimersByTime(179_000)
    const history = room.social.society.history
    expect(history.knownIncidents(mira.id, CENTER_LOCATION_ID)).toHaveLength(0)
    const rejoined = joinScenarioRoom(room, 'Visitor')
    expect(rejoined.actor).toBe(player.actor)
    room.handleClose(rejoined.socket)
    vi.advanceTimersByTime(179_000)
    expect(history.knownIncidents(mira.id, CENTER_LOCATION_ID)).toHaveLength(0)
    vi.advanceTimersByTime(121_000)
    expect(history.knownIncidents(mira.id, CENTER_LOCATION_ID)).toHaveLength(1)
    expect(mira.position).toEqual(before)
    expect(room.gameplayNow()).toBe(gameAt)
})

it('keeps an incident attached to the retired identity after the same name joins again', () => {
    const first = joinScenarioRoom(room, 'Visitor')
    const merchant = citizen('npc_merchant_1')
    const history = room.social.society.history
    incident(first.actor.id, merchant)
    first.actor.applyDamage(first.actor.hp, room.gameplayNow())
    first.send({ type: 'abandon_life' })
    expect(room.getCharacter(first.actor.id)).toBeUndefined()

    const next = joinScenarioRoom(room, 'Visitor')
    expect(next.actor.id).not.toBe(first.actor.id)
    expect(
        history.knownIncidents(merchant.id, CENTER_LOCATION_ID, first.actor.id)
    ).toHaveLength(1)
    expect(
        history.knownIncidents(merchant.id, CENTER_LOCATION_ID, next.actor.id)
    ).toHaveLength(0)
    expect(
        history.communityReputation(CENTER_LOCATION_ID, next.actor.id).honesty
    ).toBe(0)
})

it('does not treat an ordinary monster attack as civic misconduct', () => {
    const { actor } = joinScenarioRoom(room, 'Visitor')
    const location = WORLD_LOCATION_DEFINITIONS.find(
        ({ dangerLevel }) => dangerLevel > 0
    )
    actor.locationId = location?.id ?? CENTER_LOCATION_ID
    const monster = room
        .charactersFor(actor)
        .find(({ faction }) => faction === 'monsters')
    if (monster === undefined) {
        throw new Error('Missing wilderness enemy')
    }
    actor.position = { ...monster.position }
    const hit = resolveCharacterDamage({
        actor: monster,
        target: actor,
        amount: 5,
        now: room.gameplayNow(),
        damageKind: 'physical',
        respawnDelayMs: 1000,
        random: () => 0.5,
    })
    expect(hit.hpDamage).toBeGreaterThan(0)
    room.publishEvents(hit.events)
    expect(
        room.social.society.history.knownIncidents(actor.id, actor.locationId)
    ).toEqual([])
})

it('distinguishes an addressed threat from quoted words or an ordinary request', () => {
    expect(socialSpeechTrigger('Я тебя ударю.')).toBe('threat')
    expect(socialSpeechTrigger('Он сказал: «Я тебя ударю».')).toBeUndefined()
    expect(socialSpeechTrigger('Пожалуйста, помоги мне найти дорогу.')).toBe(
        'request'
    )
    expect(socialSpeechTrigger('Иди в таверну «Три дороги».')).toBe('request')
    expect(socialSpeechTrigger('Сама иди.')).toBe('request')
    expect(socialSpeechTrigger('Ты дурак.')).toBe('insult')
    expect(socialSpeechTrigger('Привет!')).toBe('meeting')
})

it('keeps talk and ignoring available when a resident hears a direct insult', () => {
    const player = joinScenarioRoom(room, 'Visitor')
    const mira = citizen('npc_friendly_girl_1')
    player.actor.position = { ...mira.position }
    const choices = vi.spyOn(mira.temperament, 'react')
    player.send({ type: 'chat', targetId: mira.id, text: 'Ты дура.' })
    const request = choices.mock.calls[0]?.[0]
    expect(request?.trigger).toBe('insult')
    expect(request?.available).toContain('talk')
    expect(request?.available).toContain('ignore')
})

it('keeps one reaction to a first meeting and recognizes a named request', () => {
    const player = joinScenarioRoom(room, 'Visitor')
    const mira = citizen('npc_friendly_girl_1')
    player.actor.position = { ...mira.position }
    const choices = vi.spyOn(mira.temperament, 'react')
    for (const text of ['Привет.', 'Привет!', 'Мира! Покажи путь домой.']) {
        player.send({ type: 'chat', targetId: mira.id, text })
    }
    expect(choices.mock.calls.map(([request]) => request.trigger)).toEqual([
        'meeting',
        'meeting',
        'request',
    ])
    expect(choices.mock.results[0]?.value).toBe(choices.mock.results[1]?.value)
    expect(
        room.social.society.history.knownIncidents(mira.id, CENTER_LOCATION_ID)
    ).toHaveLength(1)
})

it('reuses the same draw for a repeated request and permits a different request', () => {
    const { actor, send } = joinScenarioRoom(room, 'Visitor')
    const mira = citizen('npc_friendly_girl_1')
    actor.position = { ...mira.position }
    const choices = vi.spyOn(mira.temperament, 'react')
    for (const text of [
        'Покажи дорогу домой.',
        'Мира! ПОКАЖИ ДОРОГУ ДОМОЙ!',
        'Покажи дорогу в таверну.',
    ]) {
        send({ type: 'chat', targetId: mira.id, text })
    }
    const [first, repeat, changed] = choices.mock.results
    expect(first?.value).toBe(repeat?.value)
    expect(first?.value).not.toBe(changed?.value)
    expect(choices).toHaveBeenCalledTimes(3)
})

it('only records bystander knowledge for threats delivered through public Nearby speech', () => {
    const privateSpeaker = joinScenarioRoom(room, 'Private speaker')
    const publicSpeaker = joinScenarioRoom(room, 'Public speaker')
    const mira = citizen('npc_friendly_girl_1')
    const merchant = citizen('npc_merchant_1')
    for (const actor of [privateSpeaker.actor, publicSpeaker.actor, merchant]) {
        actor.position = { ...mira.position }
    }
    permit(mira, 'ignore')
    const history = room.social.society.history
    privateSpeaker.send({
        type: 'companion_request',
        request: 'talk',
        targetId: mira.id,
        text: 'Я тебя ударю.',
    })
    expect(history.knownIncidents(mira.id, CENTER_LOCATION_ID)).toHaveLength(1)
    expect(
        history.knownIncidents(merchant.id, CENTER_LOCATION_ID)
    ).toHaveLength(0)
    expect(
        history.communityReputation(CENTER_LOCATION_ID, privateSpeaker.actor.id)
            .danger
    ).toBe(0)

    publicSpeaker.send({
        type: 'chat',
        targetId: mira.id,
        text: 'Я тебя ударю.',
    })
    expect(
        history.knownIncidents(merchant.id, CENTER_LOCATION_ID).at(0)
    ).toMatchObject({ actorId: publicSpeaker.actor.id, firsthand: true })
})

it('lets public witnesses hear a repeated private threat without another reaction roll', () => {
    const { actor, send } = joinScenarioRoom(room, 'Visitor')
    const mira = citizen('npc_friendly_girl_1')
    const merchant = citizen('npc_merchant_1')
    actor.position = { ...mira.position }
    merchant.position = { ...mira.position }
    const choices = permit(mira, 'ignore')
    const history = room.social.society.history
    send({
        type: 'companion_request',
        request: 'talk',
        targetId: mira.id,
        text: 'Я тебя ударю.',
    })
    const [privateIncident] = history.knownIncidents(
        mira.id,
        CENTER_LOCATION_ID
    )
    const before = history.relationship(mira.id, actor.id)
    expect(history.knownIncidents(merchant.id, CENTER_LOCATION_ID)).toEqual([])

    send({ type: 'chat', targetId: mira.id, text: 'Я тебя ударю!' })
    const reputation = history.communityReputation(CENTER_LOCATION_ID, actor.id)
    expect(reputation.danger).toBeGreaterThan(0)
    expect(
        history.knownIncidents(merchant.id, CENTER_LOCATION_ID)
    ).toMatchObject([
        { incidentId: privateIncident?.incidentId, firsthand: true },
    ])
    send({ type: 'chat', targetId: mira.id, text: 'Я тебя изобью.' })
    expect(choices).toHaveBeenCalledTimes(1)
    expect(history.knownIncidents(mira.id, CENTER_LOCATION_ID)).toHaveLength(1)
    expect(history.relationship(mira.id, actor.id)).toEqual(before)
    expect(history.communityReputation(CENTER_LOCATION_ID, actor.id)).toEqual(
        reputation
    )
})

it('treats rapid repeated verbal threats as one incident and one physical choice', () => {
    const player = joinScenarioRoom(room, 'Visitor')
    const mira = citizen('npc_friendly_girl_1')
    player.actor.position = { ...mira.position }
    const initialRoll = permit(mira, 'ignore')
    for (const text of ['Я тебя ударю.', 'Я тебя ударю!', 'Я тебя изобью.']) {
        player.send({ type: 'chat', targetId: mira.id, text })
    }
    expect(initialRoll).toHaveBeenCalledTimes(1)
    const history = room.social.society.history
    expect(
        history.knownIncidents(mira.id, CENTER_LOCATION_ID, player.actor.id)
    ).toHaveLength(1)
    expect(
        history.communityReputation(CENTER_LOCATION_ID, player.actor.id).danger
    ).toBe(15)
})

it('does not give a human-controlled resident a scripted rumor speech nearby', () => {
    const player = joinScenarioRoom(room, 'Visitor')
    const mira = citizen('npc_friendly_girl_1')
    const merchant = citizen('npc_merchant_1')
    mira.position = { ...merchant.position }
    setCharacterControlSource(merchant, 'human')
    permit(merchant, 'report')
    permit(mira, 'believe')
    incident(player.actor.id, merchant)
    vi.advanceTimersByTime(50)
    expect(
        room.social.society.history.knownIncidents(mira.id, CENTER_LOCATION_ID)
    ).toHaveLength(0)
})
