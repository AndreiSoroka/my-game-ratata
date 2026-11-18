import { expect, it } from 'vitest'

import {
    handleAbilityCommand,
    parseAbilityCommand,
} from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { knowsAbility } from '../src/game/abilityState'
import { restoreCharacter } from '../src/game/characterRecovery'
import { learnFireball } from '../src/game/magicLearning'
import { abilityContext, abilityHero } from './abilityTestHelpers'

it('grants only the starting capabilities for each background', () => {
    expect(abilityHero('vanguard').config.resources.maxEnergy).toBe(120)
    expect(abilityHero('vanguard').abilities.known.size).toBe(0)
    expect(abilityHero('cleric').config.resources.attackManaCost).toBe(0)
    expect([...abilityHero('cleric').abilities.known]).toEqual(['pray'])
    expect([...abilityHero('arcanist').abilities.known]).toEqual([
        'spark',
        'barrier',
    ])
    expect([...abilityHero('ranger').abilities.known]).toEqual(['shot'])
    expect(
        abilityHero('vanguard', 'undead').abilities.known.has('skeleton_strike')
    ).toBe(true)
})
it('absorbs once with the common damage path, trains only real hostile absorption and emits death once', () => {
    const actor = abilityHero('arcanist')
    const enemy = abilityHero('vanguard')
    Object.assign(enemy, { faction: 'monsters' })
    handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId: 'barrier' },
        abilityContext([actor])
    )
    expect(actor.mana).toBe(58)
    const first = resolveCharacterDamage({
        actor: enemy,
        target: actor,
        amount: 3,
        now: 1500,
        damageKind: 'physical',
        respawnDelayMs: 15000,
    })
    expect(first.hpDamage).toBe(0)
    expect(first.absorbed).toBe(3)
    expect(actor.progression.masteries.magic.experience).toBe(24_000_000n)
    const next = resolveCharacterDamage({
        actor: enemy,
        target: actor,
        amount: 9,
        now: 1600,
        damageKind: 'arcane',
        respawnDelayMs: 15000,
    })
    expect(next.absorbed).toBe(5)
    expect(next.hpDamage).toBe(4)
    expect(actor.progression.masteries.magic.experience).toBe(24_000_000n)
    const kill = () =>
        resolveCharacterDamage({
            actor: enemy,
            target: actor,
            amount: 100,
            now: 1700,
            damageKind: 'holy',
            respawnDelayMs: 15000,
        })
    expect(
        kill().events.filter((event) => event.kind === 'death')
    ).toHaveLength(1)
    expect(kill().events).toEqual([])
    expect(actor.abilities.barrier).toBe(null)
    restoreCharacter(actor, 1800, false)
    expect(actor.abilities.casting).toBe(null)
})
it('keeps expired barrier and rejected attacks from spending or granting practice', () => {
    const actor = abilityHero('arcanist')
    const context = abilityContext([actor])
    handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId: 'barrier' },
        context
    )
    expect(actor.progression.masteries.magic.experience).toBe(0n)
    handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId: 'barrier' },
        { ...context, now: 6000 }
    )
    expect(actor.mana).toBe(58)
    expect(
        resolveCharacterDamage({
            actor,
            target: actor,
            amount: 3,
            now: 6000,
            damageKind: 'arcane',
            respawnDelayMs: 15000,
        }).absorbed
    ).toBe(0)
    const calls: Array<string | undefined> = []
    context.requestAbilityAttack = (_, target) => {
        calls.push(target)
        return []
    }
    handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId: 'spark', targetId: 'missing' },
        { ...context, now: 7000 }
    )
    expect(calls).toEqual(['missing'])
    expect(actor.abilities.availableAt.spark).toBeUndefined()
    expect(actor.mana).toBe(58)
})
it('allows later learning through ordinary nearby teachers and gates fireball at Magic three', () => {
    const actor = abilityHero('vanguard')
    const cleric = abilityHero('cleric')
    const scholar = abilityHero('arcanist')
    scholar.tags.add('scholar')
    const context = abilityContext([actor, cleric, scholar])
    handleAbilityCommand(
        actor,
        { type: 'learn_ability', abilityId: 'pray', targetId: cleric.id },
        context
    )
    expect(knowsAbility(actor, 'pray')).toBe(true)
    handleAbilityCommand(
        actor,
        {
            type: 'learn_ability',
            abilityId: 'barrier',
            targetId: scholar.id,
        },
        context
    )
    expect(knowsAbility(actor, 'barrier')).toBe(true)
    expect(learnFireball(actor, scholar, 1000)).toEqual([])
    actor.progression.masteries.magic.level = 3
    expect(learnFireball(actor, scholar, 1000)).not.toEqual([])
    actor.abilities.known.delete('pray')
    cleric.position.x += 65
    handleAbilityCommand(
        actor,
        { type: 'learn_ability', abilityId: 'pray', targetId: cleric.id },
        context
    )
    expect(knowsAbility(actor, 'pray')).toBe(false)
})
it('rejects malformed abilities and requires explicit pinned prayer cost context', () => {
    expect(
        parseAbilityCommand({ type: 'use_ability', abilityId: 'pray' })
    ).toBeUndefined()
    expect(
        parseAbilityCommand({
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'revive' },
        })
    ).toBeUndefined()
    expect(
        parseAbilityCommand({
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'harm', targetId: 'x' },
        })
    ).toEqual({
        type: 'use_ability',
        abilityId: 'pray',
        intent: { mode: 'harm', targetId: 'x' },
    })
    expect(
        parseAbilityCommand({ type: 'use_ability', abilityId: 'barrier' })
    ).toEqual({ type: 'use_ability', abilityId: 'barrier' })
})
