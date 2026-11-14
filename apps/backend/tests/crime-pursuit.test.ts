import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { companionProfiles } from '../src/game/companionProfiles'
import { CrimeService } from '../src/game/crime'
import { revokeRetaliation } from '../src/game/crimeRelations'
import { canTargetByFaction } from '../src/game/factions'
import { pursuits } from '../src/game/pursuitState'
import { pursuitFixture } from './pursuitTestHelpers'

function guardFixture() {
    const f = pursuitFixture({
        archetype: 'human',
        locationId: CENTER_LOCATION_ID,
    })
    const victim = new GameCharacter({
        id: 'witness',
        nickname: 'Witness',
        archetype: 'human',
        controllerKind: 'network_player',
        locationId: CENTER_LOCATION_ID,
        spawnPosition: { x: 456, y: 248 },
    })
    f.characters.push(victim)
    const crime = new CrimeService()
    crime.record(f.target, victim, f.characters, f.now())
    const call = () =>
        crime.callGuards(victim, f.target.id, f.characters, f.now())
    const tick = () => {
        crime.update(f.room, f.characters, f.now())
    }
    return { ...f, victim, crime, call, tick }
}

it('lets the stationary guard follow a witnessed criminal into one neighboring wilderness and return to her post', () => {
    const f = guardFixture()
    expect(companionProfiles['npc_guard_1']?.stationary).toBe(true)
    expect(companionProfiles['npc_guard_1']?.canFollow).toBe(false)
    expect(f.call()).toHaveLength(1)
    f.target.setMoveInput(f.direction)
    for (
        let step = 0;
        step < 100 && f.actor.locationId === CENTER_LOCATION_ID;
        step++
    ) {
        f.step(f.tick)
    }
    expect(f.actor.locationId).toBe('map-3-2')
    expect(pursuits.get(f.actor)?.foreign).toBeDefined()
    revokeRetaliation(f.target, f.actor)
    f.target.setMoveInput({ x: 0, y: 0 })
    const hits = f.events.length
    for (let step = 0; step < 150 && pursuits.has(f.actor); step++) {
        f.step(f.tick)
    }
    expect(f.actor.locationId).toBe(CENTER_LOCATION_ID)
    expect(
        Math.hypot(
            f.actor.position.x - f.actor.spawnPosition.x,
            f.actor.position.y - f.actor.spawnPosition.y
        )
    ).toBeLessThanOrEqual(24)
    expect(
        f.events
            .slice(hits)
            .some(
                (event) =>
                    event.kind === 'damage' && event.targetId === f.target.id
            )
    ).toBe(false)
})

it('does not turn an unproven call or a human-controlled witness into a cross-map pursuer', () => {
    const f = guardFixture()
    const noProof = new CrimeService()
    expect(
        noProof.callGuards(f.victim, f.target.id, f.characters, f.now())[0]
            ?.kind
    ).toBe('notice')
    f.target.setMoveInput(f.direction)
    for (let step = 0; step < 30; step++) {
        f.step(() => {
            noProof.update(f.room, f.characters, f.now())
        })
    }
    expect(f.actor.locationId).toBe(CENTER_LOCATION_ID)
    expect(pursuits.has(f.actor)).toBe(false)
    expect(pursuits.has(f.victim)).toBe(false)
    expect(f.victim.hasPath()).toBe(false)
})

it('absolution after a real lawful guard hit revokes pursuit and contact attacks while the guard returns normally', () => {
    const f = guardFixture()
    const adventure = new AdventureService({
        resourceNodes: [],
        worldObjects: [],
    })
    f.call()
    f.crime.report(f.victim, f.target.id, {
        characters: f.characters,
        navigation: f.room.navigationFor(f.target),
        now: f.now(),
        adventure,
    })
    for (let step = 0; step < 30 && f.target.hp === f.target.maxHp; step++) {
        f.step(f.tick)
    }
    expect(f.target.hp).toBeLessThan(f.target.maxHp)
    expect(canTargetByFaction(f.actor, f.target, f.now())).toBe(true)
    adventure.grantGoldOnce(f.target.id, 30, 'test-payment')
    const cleric = new GameCharacter({
        id: 'npc_cleric_1',
        nickname: 'Cleric',
        archetype: 'human',
        controllerKind: 'scripted',
        locationId: CENTER_LOCATION_ID,
        spawnPosition: { x: 488, y: 264 },
    })
    f.characters.push(cleric)
    const result = f.crime.absolve(f.target, cleric.id, {
        characters: f.characters,
        navigation: f.room.navigationFor(f.target),
        now: f.now(),
        adventure,
    })
    expect(result[0]?.text).toContain('Грехи отпущены')
    expect(canTargetByFaction(f.actor, f.target, f.now())).toBe(false)
    expect(canTargetByFaction(f.target, f.actor, f.now())).toBe(false)
    const hp = f.target.hp
    const eventCount = f.events.length
    for (let step = 0; step < 100 && pursuits.has(f.actor); step++) {
        f.step(f.tick)
    }
    expect(pursuits.has(f.actor)).toBe(false)
    expect(f.target.hp).toBeGreaterThanOrEqual(hp)
    expect(
        f.events
            .slice(eventCount)
            .some(
                (event) =>
                    event.kind === 'damage' && event.targetId === f.target.id
            )
    ).toBe(false)
    expect(
        Math.hypot(
            f.actor.position.x - f.actor.spawnPosition.x,
            f.actor.position.y - f.actor.spawnPosition.y
        )
    ).toBeLessThanOrEqual(24)
})
