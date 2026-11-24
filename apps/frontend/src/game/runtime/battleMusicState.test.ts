import type { CharacterSnapshot, GameEventPayload, WorldLocation } from '@my-game-ratata/contracts'
import { worldLocationId } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { BattleMusicState } from './battleMusicState'

const forestId = worldLocationId(1, 1)
const otherMap = worldLocationId(1, 0)
const hero = characterFixture('hero')
const wolf = characterFixture('wolf', { relationship: 'hostile' })
const slime = characterFixture('slime', { faction: 'monsters' })
const attack = { kind: 'attack', actorId: hero.id, targetId: wolf.id } as const

function snapshot(serverTime: number, characters: CharacterSnapshot[], locationId = forestId) {
    return {
        ...worldFixture(characters, serverTime),
        location: { id: locationId, biome: 'wilds' } as WorldLocation,
    }
}

it('requires a new combat event in woodland and keeps playing after a short retreat', () => {
    let now = 0
    const battle = new BattleMusicState(() => now)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, false)
    now = 100
    battle.receive(attack, 100_100)
    expect(battle.update(() => true)).toBe(false)

    now = 200
    battle.observe(snapshot(100_200, [hero, wolf]), hero.id, true)
    expect(battle.update(() => true)).toBe(false)
    battle.receive(attack, 100_200)
    expect(battle.update()).toBe(true)

    now = 300
    battle.observe(snapshot(100_300, [hero, wolf]), hero.id, false)
    expect(battle.update()).toBe(true)

    now = 8199
    expect(battle.update()).toBe(true)
    now = 8200
    expect(battle.update()).toBe(false)
})

it('uses a visible hostile who did not fight to extend the hold outside woodland', () => {
    let now = 0
    const battle = new BattleMusicState(() => now)
    const friendly = characterFixture('friend', { faction: 'monsters', relationship: 'friendly' })
    const training = characterFixture('training', {
        relationship: 'hostile',
        trainingTarget: { areaId: 'training' },
    })
    const dead = characterFixture('dead', { alive: false, relationship: 'hostile' })
    const offline = characterFixture('offline', { tags: ['offline'], relationship: 'hostile' })
    const retired = characterFixture('retired', {
        tags: ['state.retired'],
        relationship: 'hostile',
    })
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_000)

    now = 1500
    battle.observe(
        snapshot(101_500, [hero, friendly, training, dead, offline, retired, wolf, slime]),
        hero.id,
        false
    )
    const queried: string[] = []
    expect(
        battle.update((id) => {
            queried.push(id)
            return id === slime.id
        })
    ).toBe(true)
    expect(queried).toEqual([wolf.id, slime.id])

    now = 9499
    expect(battle.update()).toBe(true)
    now = 9500
    expect(battle.update()).toBe(false)
})

it.each([
    { snapshotAge: 1000, holdEnd: 8100 },
    { snapshotAge: 1001, holdEnd: 8000 },
])('uses the snapshot timestamp for visibility at age $snapshotAge', ({ snapshotAge, holdEnd }) => {
    let now = 0
    const battle = new BattleMusicState(() => now)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_000)

    now = 100
    battle.observe(snapshot(100_100, [hero, wolf]), hero.id, true)
    now += snapshotAge
    expect(battle.update(() => true)).toBe(true)

    now = holdEnd - 1
    expect(battle.update(() => true)).toBe(true)
    now = holdEnd
    expect(battle.update(() => true)).toBe(false)
})

it('reverses for a newly visible hostile during fade and requires new combat once the track ends', () => {
    let now = 0
    const battle = new BattleMusicState(() => now)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_000)

    now = 8000
    expect(battle.update(undefined, true)).toBe(false)
    now = 8100
    battle.observe(snapshot(108_100, [hero, slime]), hero.id, false)
    expect(battle.update((id) => id === slime.id, true)).toBe(true)
    now = 16100
    expect(battle.update(undefined, true)).toBe(false)

    now = 16200
    battle.observe(snapshot(116_200, [hero, wolf, slime]), hero.id, false)
    battle.receive(attack, 116_200)
    expect(battle.update(() => true)).toBe(false)

    now = 16300
    battle.observe(snapshot(116_300, [hero, wolf, slime]), hero.id, true)
    expect(battle.update(() => true)).toBe(false)
    battle.receive(attack, 116_300)
    expect(battle.update(() => true)).toBe(true)
})

it('reverses for renewed combat outside woodland while the battle track remains available', () => {
    let now = 0
    const battle = new BattleMusicState(() => now)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_000)

    now = 8000
    battle.observe(snapshot(108_000, [hero, wolf]), hero.id, false)
    expect(battle.update(undefined, true)).toBe(false)

    now = 8100
    battle.receive(attack, 108_100, true)
    expect(battle.update(undefined, true)).toBe(true)
})

it.each<GameEventPayload['kind']>(['attack', 'damage', 'miss', 'parry', 'absorb'])(
    'accepts a confirmed local %s from a newly projected source',
    (kind) => {
        const battle = new BattleMusicState(() => 0)
        battle.observe(snapshot(100_000, [hero]), hero.id, true)
        battle.receive({ kind, actorId: wolf.id, targetId: hero.id }, 100_001)
        expect(battle.update()).toBe(true)
    }
)

it('ignores unrelated, untargeted, interrupted and training attacks and accepts redacted incoming damage', () => {
    const battle = new BattleMusicState(() => 0)
    const dummy = characterFixture('dummy', { trainingTarget: { areaId: 'training' } })
    battle.observe(snapshot(100_000, [hero, wolf, slime, dummy]), hero.id, true)
    const unrelated: GameEventPayload[] = [
        { kind: 'damage', actorId: wolf.id, targetId: slime.id },
        { kind: 'attack', actorId: hero.id },
        { kind: 'miss', actorId: hero.id },
        { kind: 'damage', actorId: hero.id, targetId: hero.id },
        { kind: 'attack', targetId: hero.id },
        { ...attack, phase: 'interrupted' },
        { ...attack, locationId: otherMap },
        { ...attack, targetId: dummy.id },
        { ...attack, kind: 'cast', phase: 'completed' },
    ]
    for (const event of unrelated) {
        battle.receive(event, 100_001)
        expect(battle.update()).toBe(false)
    }

    battle.receive({ kind: 'damage', targetId: hero.id }, 100_002)
    expect(battle.update()).toBe(true)
})

it('keeps the hold after defeat or departure and rejects stale or terminal contacts', () => {
    let now = 0
    const battle = new BattleMusicState(() => now)
    battle.observe(snapshot(100_000, [hero, wolf, slime]), hero.id, true)
    now = 1
    battle.receive(attack, 100_001)
    now = 2
    battle.receive({ kind: 'damage', actorId: slime.id, targetId: hero.id }, 100_002)
    now = 3
    battle.receive({ kind: 'death', actorId: hero.id, targetId: wolf.id }, 100_003)
    now = 4
    battle.receive({ kind: 'leave', actorId: slime.id, locationId: otherMap }, 100_004)
    battle.receive({ kind: 'leave', actorId: slime.id }, 100_004)
    expect(battle.update(() => true)).toBe(true)

    const queried: string[] = []
    battle.observe(snapshot(100_004, [hero, { ...wolf, alive: false }, slime]), hero.id, true)
    battle.update((id) => {
        queried.push(id)
        return true
    })
    expect(queried).toEqual([])
    battle.receive(attack, 100_003)
    battle.receive(attack, 100_004)

    now = 8001
    expect(battle.update()).toBe(true)
    now = 8002
    expect(battle.update()).toBe(false)
})

it('uses observed deaths and ignores a stale snapshot without treating viewport exit as death', () => {
    let now = 0
    const battle = new BattleMusicState(() => now)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_000)
    now = 1000
    battle.observe(snapshot(101_000, [hero]), hero.id, true)
    expect(battle.update()).toBe(true)

    now = 2000
    battle.observe(snapshot(102_000, [hero, { ...wolf, alive: false }]), hero.id, true)
    battle.observe(snapshot(101_999, [hero, wolf]), hero.id, true)
    battle.receive(attack, 102_001)
    expect(battle.update(() => true)).toBe(true)
    now = 8000
    expect(battle.update()).toBe(false)

    battle.observe(snapshot(108_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 108_001)
    expect(battle.update()).toBe(true)
})

it('requires a fresh living listener after death and drops combat on map, identity or world reset', () => {
    const battle = new BattleMusicState(() => 0)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_001)
    battle.receive({ kind: 'death', targetId: hero.id }, 100_002)
    battle.observe(snapshot(100_002, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_003)
    expect(battle.update(undefined, true)).toBe(false)

    battle.observe(snapshot(100_004, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_005)
    expect(battle.update()).toBe(true)
    battle.observe(snapshot(100_006, [hero, wolf], otherMap), hero.id, true)
    battle.receive(attack, 100_005)
    battle.receive({ ...attack, locationId: forestId }, 100_006)
    expect(battle.update(undefined, true)).toBe(false)

    battle.receive(attack, 100_007)
    expect(battle.update()).toBe(true)
    battle.observe(snapshot(100_008, [hero, slime, wolf], otherMap), slime.id, true)
    expect(battle.update(undefined, true)).toBe(false)
    battle.receive({ ...attack, actorId: slime.id }, 100_009)
    expect(battle.update()).toBe(true)
    battle.clear()
    battle.receive({ ...attack, actorId: slime.id }, 100_010)
    expect(battle.update(undefined, true)).toBe(false)
})
