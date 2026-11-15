import { expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { advanceRevive } from '../src/game/characterLife'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function rescue(friendlyDamage: number) {
    const caster = abilityHero()
    const ally = abilityHero()
    const victim = abilityHero()
    const enemy = abilityHero('vanguard', 'undead', 'mob1')
    Object.assign(enemy, { faction: 'monsters' })
    const damage = (actor: typeof ally, amount: number) =>
        resolveCharacterDamage({
            actor,
            target: victim,
            amount,
            now: 500,
            damageKind: 'holy',
            respawnDelayMs: 15000,
        })
    damage(ally, friendlyDamage)
    damage(enemy, victim.hp)
    const context = abilityContext([caster, ally, victim, enemy])
    handleAbilityCommand(
        caster,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'revive', targetId: victim.id },
        },
        context
    )
    advanceRevive(
        caster,
        () => victim,
        4000,
        () => 0,
        { ...context, now: 4000 }
    )
    const heal = (now: number) => {
        const events = handleAbilityCommand(
            caster,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'restore', targetId: victim.id },
            },
            { ...context, now }
        )
        return [
            ...events,
            ...advanceRevive(
                caster,
                () => victim,
                now + 3000,
                () => 0,
                { ...context, now: now + 3000 }
            ),
        ]
    }
    return { caster, victim, heal }
}

it('healing after a friendly-caused death and revival cannot grant faith or miracles practice', () => {
    const { caster, victim, heal } = rescue(1000)
    expect(victim.alive).toBe(true)
    expect(victim.abilities.untrainableHpDamage).toBe(victim.maxHp - victim.hp)
    expect(caster.progression.skills.faith.practice).toBe(0)
    expect(caster.progression.skills.miracles.practice).toBe(0)
    for (const now of [4001, 7001, 10001, 13001]) {
        heal(now)
    }
    expect(victim.hp).toBe(victim.maxHp)
    expect(victim.abilities.untrainableHpDamage).toBe(0)
    expect(caster.progression.skills.faith.practice).toBe(0)
    expect(caster.progression.skills.miracles.practice).toBe(0)
})

it('ordinary combat resurrection and healing remain meaningful practice', () => {
    const { caster, victim, heal } = rescue(0)
    expect(victim.alive).toBe(true)
    expect(victim.abilities.untrainableHpDamage).toBe(0)
    expect(caster.progression.skills.faith.practice).toBe(1)
    expect(caster.progression.skills.miracles.practice).toBe(1)
    heal(4001)
    expect(caster.progression.skills.faith.practice).toBe(2)
    expect(caster.progression.skills.miracles.practice).toBe(2)
})

it('resurrection consumes the healed portion of mixed damage provenance and retains only unhealed friendly wounds', () => {
    const { caster, victim } = rescue(20)
    expect(victim.hp).toBe(13)
    expect(victim.abilities.untrainableHpDamage).toBe(7)
    expect(caster.progression.skills.faith.practice).toBe(1)
    expect(caster.progression.skills.miracles.practice).toBe(1)
})
