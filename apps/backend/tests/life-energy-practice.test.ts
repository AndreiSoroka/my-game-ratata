import { describe, expect, it } from 'vitest'

import { createAdventureState } from '../src/game/adventureState'
import {
    attemptAbilityAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { handleMovementCommand } from '../src/game/movementActions'
import { applyPrayerGift } from '../src/game/prayerGifts'
import {
    recordLifeWorkSpend,
    restoreEnergy,
} from '../src/game/resourcePractice'
import { WorldObjects } from '../src/game/worldObjects'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { trainingCombatFixture } from './trainingCombatFixture'

function encounter() {
    const actor = abilityHero('arcanist')
    const target = abilityHero('vanguard', 'undead')
    target.reputation.peaceful = -100
    Object.assign(target, { faction: 'monsters', position: { x: 100, y: 132 } })
    const { navigation } = abilityContext([actor, target])
    return {
        actor,
        target,
        attack: {
            actor,
            targets: [actor, target],
            now: 1000,
            tileSize: 16,
            navigation,
            respawnDelayMsFor: () => 15000,
            random: () => 0.5,
            targetId: target.id,
        },
    }
}

describe('Life energy practice', () => {
    it('consumes the same work receipt through water, prayer and natural recovery', () => {
        const actor = abilityHero()
        const { navigation } = abilityContext([actor])
        const state = actor.progression.constellations
        const world = new WorldObjects([
            {
                id: 'pond',
                kind: 'water',
                name: 'Пруд',
                text: 'Берег',
                locationId: actor.locationId,
                bounds: { x: 120, y: 100, width: 16, height: 16 },
            },
        ])
        recordLifeWorkSpend(actor, actor.drainEnergy(35), 1000)
        expect(state.opened.has('life.root')).toBe(false)
        expect(
            world.interact(
                actor,
                createAdventureState(),
                'pond',
                navigation,
                1100
            )
        ).toMatchObject([{ kind: 'water_drink' }])
        expect(state.opened.has('life.root')).toBe(true)
        expect(state.lifeEnergy.recovered).toBe(15)
        expect(actor.progression.masteries.life.experience).toBe(0n)

        const gift = applyPrayerGift(
            actor,
            actor,
            { mode: 'restore', targetId: actor.id },
            1200,
            1,
            'pray_road'
        )
        expect(gift.meaningful).toBe(true)
        expect(actor.progression.masteries.life.experience).toBe(10_000_000n)
        actor.applyRegen(1000, false, true, 2200)
        expect(state.lifeEnergy.recovered).toBe(35)
        expect(state.lifeEnergy.workRemainder).toBe(15)
        expect(restoreEnergy(actor, 50, 2300).restored).toBe(0)
        expect(actor.progression.masteries.life.experience).toBe(10_000_000n)
    })

    it('opens Ровное дыхание from mixed work and hostile costs recovered before the hit', () => {
        const { actor, attack } = encounter()
        const state = actor.progression.constellations
        state.opened.add('life.energy2')
        for (const [index, amount] of [100, 100, 95].entries()) {
            const now = index * 100
            recordLifeWorkSpend(actor, actor.drainEnergy(amount), now)
            restoreEnergy(actor, amount, now + 1)
        }
        expect(state.lifeEnergy.recovered).toBe(295)
        expect(state.opened.has('life.breath')).toBe(false)
        attemptAbilityAttack(attack, 'spark')
        restoreEnergy(actor, 5, 1100)
        expect(state.lifeEnergy.recovered).toBe(295)
        resolvePendingAttackHit({ ...attack, now: 1200 })
        expect(state.lifeEnergy.recovered).toBe(300)
        expect(state.opened.has('life.breath')).toBe(true)
        expect(actor.progression.masteries.life.experience).toBe(40_000_000n)
        expect(resolvePendingAttackHit({ ...attack, now: 1201 })).toEqual([])
        expect(actor.progression.masteries.life.experience).toBe(40_000_000n)
    })

    it('ignores costs from a missed hostile attack, dash and unrelated drains', () => {
        const { actor, target, attack } = encounter()
        const state = actor.progression.constellations
        state.opened.add('life.rest')
        attemptAbilityAttack(attack, 'spark')
        target.position.y = 300
        restoreEnergy(actor, 5, 1100)
        resolvePendingAttackHit({ ...attack, now: 1200 })
        handleMovementCommand(actor, { type: 'dash' }, 2000)
        actor.drainEnergy(10)
        restoreEnergy(actor, 100, 3000)
        expect(state.lifeEnergy.recovered).toBe(0)
        expect(state.lifeEnergy.recentSpends).toEqual([])
        expect(state.opened.has('life.root')).toBe(false)
    })

    it('keeps measured training impacts outside Life energy practice', () => {
        const { actor, start, hit } = trainingCombatFixture()
        const state = actor.progression.constellations
        state.opened.add('life.rest')
        start(1000)
        expect(hit(1050)).toEqual([expect.objectContaining({ kind: 'damage' })])
        restoreEnergy(actor, 100, 1100)
        expect(state.lifeEnergy.recovered).toBe(0)
        expect(state.lifeEnergy.recentSpends).toEqual([])
    })
})

describe('Life resting bonus', () => {
    it('requires both spend thresholds, clips Передышка at its deadline and starts a new window', () => {
        const actor = abilityHero()
        const state = actor.progression.constellations
        state.opened.add('life.breath')
        state.opened.add('life.rest')
        const spend = (amount: number, now: number) =>
            recordLifeWorkSpend(actor, actor.drainEnergy(amount), now)
        spend(9, 1000)
        spend(11, 2000)
        expect(state.lifeEnergy.restUntil).toBe(0)
        spend(5, 21000)
        expect(state.lifeEnergy.restUntil).toBe(0)
        spend(5, 22000)
        spend(5, 23000)
        expect(state.lifeEnergy.restUntil).toBe(0)
        spend(5, 24000)
        expect(state.lifeEnergy.restUntil).toBe(32000)
        spend(5, 25000)
        expect(state.lifeEnergy.recentSpends).toEqual([])

        const beforeWalking = actor.energy
        actor.applyRegen(1000, true, true, 30000)
        expect(actor.energy - beforeWalking).toBeCloseTo(3.6)
        const beforeRest = actor.energy
        actor.applyRegen(1000, false, true, 32500)
        expect(actor.energy - beforeRest).toBeCloseTo(9.9)
        spend(1, 32500)
        expect(state.lifeEnergy.recentSpends).toHaveLength(1)
    })

    it('keeps recent spends across the expiration of the oldest receipt', () => {
        const actor = abilityHero()
        const state = actor.progression.constellations
        state.opened.add('life.rest')
        const spend = (amount: number, now: number) =>
            recordLifeWorkSpend(actor, actor.drainEnergy(amount), now)
        spend(1, 1000)
        spend(5, 20000)
        spend(10, 21000)
        expect(state.lifeEnergy.restUntil).toBe(0)
        spend(5, 22000)
        expect(state.lifeEnergy.restUntil).toBe(30000)
    })
})
