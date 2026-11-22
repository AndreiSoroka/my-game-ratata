import { expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { advanceRevive } from '../src/game/characterLife'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function rescue() {
    const caster = abilityHero()
    const target = abilityHero()
    const enemy = abilityHero('vanguard', 'undead', 'mob1')
    Object.assign(enemy, { faction: 'monsters' })
    target.applyDamage(target.hp, 500)
    const context = abilityContext([caster, target, enemy])
    handleAbilityCommand(
        caster,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'revive', targetId: target.id },
        },
        context
    )
    const hurt = (amount: number) =>
        resolveCharacterDamage({
            actor: enemy,
            target: caster,
            amount,
            now: 1500,
            damageKind: 'physical',
            respawnDelayMs: 15000,
        })
    const finish = () =>
        advanceRevive(
            caster,
            () => target,
            4000,
            () => 0,
            { ...context, now: 4000 }
        )
    return { caster, target, hurt, finish }
}

it('positive nonlethal damage interrupts a revival once without spending completion mana', () => {
    const { caster, target, hurt, finish } = rescue()
    const result = hurt(2)
    expect(result.hpDamage).toBe(2)
    expect(result.events).toContainEqual(
        expect.objectContaining({
            kind: 'cast',
            phase: 'interrupted',
            actorId: caster.id,
        })
    )
    expect(caster.abilities.casting).toBeNull()
    expect(caster.isActionLocked(1500)).toBe(false)
    expect(hurt(2).events.some((event) => event.phase === 'interrupted')).toBe(
        false
    )
    expect(finish()).toEqual([])
    expect(caster.mana).toBe(35)
    expect(caster.progression.masteries.prayer.experience).toBe(0n)
    expect(target.alive).toBe(false)
})

it('a barrier preserves the channel while it absorbs the whole hit', () => {
    const { caster, target, hurt, finish } = rescue()
    caster.abilities.barrier = {
        expiresAt: 5000,
        practiced: false,
    }
    const result = hurt(2)
    expect(result.hpDamage).toBe(0)
    expect(result.absorbed).toBe(2)
    expect(caster.abilities.casting).not.toBeNull()
    expect(finish()).toContainEqual(
        expect.objectContaining({ kind: 'revive', targetId: target.id })
    )
    expect(caster.mana).toBe(33)
})

it('lethal damage emits one interruption and one death and never completes the abandoned rescue', () => {
    const { caster, target, hurt, finish } = rescue()
    const result = hurt(caster.maxHp)
    expect(
        result.events.filter((event) => event.phase === 'interrupted')
    ).toHaveLength(1)
    expect(
        result.events.filter((event) => event.kind === 'death')
    ).toHaveLength(1)
    expect(finish()).toEqual([])
    expect(caster.mana).toBe(35)
    expect(target.alive).toBe(false)
})
