import type { CharacterSnapshot, GameEventPayload, WorldLocation } from '@my-game-ratata/contracts'
import { worldLocationId } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { BattleMusicState } from './battleMusicState'

const forestId = worldLocationId(1, 1)
const otherMap = worldLocationId(1, 0)
const hero = characterFixture('hero')
const wolf = characterFixture('wolf')
const slime = characterFixture('slime')
const attack = { kind: 'attack', actorId: hero.id, targetId: wolf.id } as const

function snapshot(serverTime: number, characters: CharacterSnapshot[], locationId = forestId) {
    return {
        ...worldFixture(characters, serverTime),
        location: { id: locationId, biome: 'wilds' } as WorldLocation,
    }
}

it('plays only in the forest and expires without a further snapshot', () => {
    let now = 0
    const battle = new BattleMusicState(() => now)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, false)
    now = 100
    battle.receive(attack, 100_100)
    expect(battle.active).toBe(false)

    now = 200
    battle.observe(snapshot(100_200, [hero, wolf]), hero.id, true)
    expect(battle.active).toBe(true)
    now = 300
    battle.observe(snapshot(100_300, [hero, wolf]), hero.id, false)
    expect(battle.active).toBe(false)
    now = 400
    battle.observe(snapshot(100_400, [hero, wolf]), hero.id, true)
    expect(battle.active).toBe(true)

    now = 5_099
    expect(battle.active).toBe(true)
    now = 5_100
    expect(battle.active).toBe(false)
})

it.each<GameEventPayload['kind']>(['attack', 'damage', 'miss', 'parry', 'absorb'])(
    'accepts a confirmed local %s from a newly projected source',
    (kind) => {
        const battle = new BattleMusicState(() => 0)
        battle.observe(snapshot(100_000, [hero]), hero.id, true)
        battle.receive({ kind, actorId: wolf.id, targetId: hero.id }, 100_001)
        expect(battle.active).toBe(true)
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
        expect(battle.active).toBe(false)
    }

    battle.receive({ kind: 'damage', targetId: hero.id }, 100_002)
    expect(battle.active).toBe(true)
})

it('keeps playing until all active opponents leave or die and rejects late contacts', () => {
    const battle = new BattleMusicState(() => 0)
    battle.observe(snapshot(100_000, [hero, wolf, slime]), hero.id, true)
    battle.receive(attack, 100_001)
    battle.receive({ kind: 'damage', actorId: slime.id, targetId: hero.id }, 100_002)
    battle.receive({ kind: 'death', actorId: hero.id, targetId: wolf.id }, 100_003)
    expect(battle.active).toBe(true)

    battle.receive({ kind: 'leave', actorId: slime.id, locationId: otherMap }, 100_004)
    expect(battle.active).toBe(true)
    battle.receive({ kind: 'leave', actorId: slime.id }, 100_004)
    expect(battle.active).toBe(false)
    battle.receive(attack, 100_003)
    battle.receive(attack, 100_004)
    expect(battle.active).toBe(false)
})

it('uses observed deaths and ignores a stale snapshot without treating viewport exit as death', () => {
    const battle = new BattleMusicState(() => 0)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_001)
    battle.observe(snapshot(100_002, [hero]), hero.id, true)
    expect(battle.active).toBe(true)

    battle.observe(snapshot(100_003, [hero, { ...wolf, alive: false }]), hero.id, true)
    expect(battle.active).toBe(false)
    battle.observe(snapshot(100_002, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_004)
    expect(battle.active).toBe(false)

    battle.observe(snapshot(100_005, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_006)
    expect(battle.active).toBe(true)
})

it('requires a fresh living listener after death and drops combat on map, identity or world reset', () => {
    const battle = new BattleMusicState(() => 0)
    battle.observe(snapshot(100_000, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_001)
    battle.receive({ kind: 'death', targetId: hero.id }, 100_002)
    battle.observe(snapshot(100_002, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_003)
    expect(battle.active).toBe(false)

    battle.observe(snapshot(100_004, [hero, wolf]), hero.id, true)
    battle.receive(attack, 100_005)
    expect(battle.active).toBe(true)
    battle.observe(snapshot(100_006, [hero, wolf], otherMap), hero.id, true)
    battle.receive(attack, 100_005)
    battle.receive({ ...attack, locationId: forestId }, 100_006)
    expect(battle.active).toBe(false)

    battle.receive(attack, 100_007)
    expect(battle.active).toBe(true)
    battle.observe(snapshot(100_008, [hero, slime, wolf], otherMap), slime.id, true)
    expect(battle.active).toBe(false)
    battle.receive({ ...attack, actorId: slime.id }, 100_009)
    expect(battle.active).toBe(true)
    battle.clear()
    battle.receive({ ...attack, actorId: slime.id }, 100_010)
    expect(battle.active).toBe(false)
})
