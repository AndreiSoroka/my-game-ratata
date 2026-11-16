import { expect, it } from 'vitest'

import type { EffectCue } from './combatEffectPlan'
import { combatParticleMotion } from './combatParticleMotion'

const cue: EffectCue = {
    kind: 'restore',
    fromId: 'priest',
    targetId: 'ally',
    deity: 'hearth',
    color: '#f9d37b',
    duration: 650,
}

it.each(['devotion', 'restore', 'revive', 'casting'] as const)(
    '%s rises for Hearth and descends for Grave',
    (kind) => {
        const hearth = combatParticleMotion({ ...cue, kind })
        const grave = combatParticleMotion({ ...cue, kind, deity: 'grave' })
        for (const angle of [hearth.minAngle, hearth.maxAngle])
            expect(Math.sin(angle)).toBeLessThan(0)
        for (const angle of [grave.minAngle, grave.maxAngle])
            expect(Math.sin(angle)).toBeGreaterThan(0)
        expect(hearth.acceleration.y).toBeLessThan(0)
        expect(grave.acceleration.y).toBeGreaterThan(0)
    }
)

it('gives Road a narrow horizontal streak rather than a rising plume', () => {
    const road = combatParticleMotion({ ...cue, deity: 'road' })
    expect(road.streak).toBe(true)
    expect(road.acceleration.y).toBe(0)
    expect(road.acceleration.x).toBeGreaterThan(0)
    for (const angle of [road.minAngle, road.maxAngle]) {
        expect(Math.cos(angle)).toBeGreaterThan(0.98)
        expect(Math.abs(Math.sin(angle))).toBeLessThan(0.13)
    }
})

it('starts Lantern motes around the recipient at rest and attracts them to the emitter origin', () => {
    const lantern = combatParticleMotion({ ...cue, deity: 'lantern' })
    expect(lantern.radius).toBeGreaterThan(7)
    expect(lantern.minSpeed).toBe(0)
    expect(lantern.maxSpeed).toBe(0)
    expect(lantern.focusOffset).toEqual({ x: 0, y: 0 })
    expect(lantern.focusAcceleration).toBeGreaterThan(0)
    expect(lantern.acceleration).toEqual({ x: 0, y: 0 })
})

it('keeps barrier shards radial with downward gravity regardless of the caster patron', () => {
    const shards = combatParticleMotion({ ...cue, kind: 'shards', deity: 'lantern' })
    expect(shards.maxAngle - shards.minAngle).toBeCloseTo(Math.PI * 2)
    expect(shards.acceleration.y).toBeGreaterThan(0)
    expect(shards.focusOffset).toBeUndefined()
    expect(shards.streak).toBeUndefined()
})
