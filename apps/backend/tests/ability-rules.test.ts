import { expect, it } from 'vitest'

import {
    handleAbilityCommand,
    parseAbilityCommand,
} from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { knowsAbility } from '../src/game/abilityState'
import { restoreCharacter } from '../src/game/characterRecovery'
import { effectiveAbility } from '../src/game/effectiveParameters'
import {
    learnFireball,
    studyMagic,
    teachMagic,
} from '../src/game/magicLearning'
import { resourceChecks } from '../src/game/resourceObservation'
import { awardMasteries } from '../src/game/skillProgression'
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
    expect([...abilityHero('ranger').abilities.known]).toEqual([
        'shot',
        'sniper_shot',
    ])
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
    expect(actor.mana).toBe(66)
    expect(actor.actionLockUntil).toBe(0)
    expect(actor.animationAction).toBe('idle')
    actor.applyRegen(500, false, true, 1500)
    expect(actor.mana).toBe(66)
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
    expect(actor.mana).toBe(63)
    actor.mana = 5
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
    expect(actor.mana).toBe(0)
    expect(actor.abilities.barrier).toBe(null)
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
    expect(actor.mana).toBe(66)
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
    expect(actor.mana).toBe(66)
})
it('allows neutral characters to choose a school, and applies the same lock to every lesson', () => {
    const actor = abilityHero('vanguard')
    const mageStudent = abilityHero('ranger')
    const cleric = abilityHero('cleric')
    const scholar = abilityHero('arcanist')
    scholar.tags.add('scholar')
    cleric.abilities.known.add('pray_road')
    scholar.abilities.known.add('fireball')
    const context = abilityContext([actor, mageStudent, cleric, scholar])
    expect(studyMagic(actor, scholar, 1000)).not.toEqual([])
    handleAbilityCommand(
        actor,
        { type: 'learn_ability', abilityId: 'pray', targetId: cleric.id },
        context
    )
    expect(knowsAbility(actor, 'pray')).toBe(true)
    const barrierLesson = {
        type: 'learn_ability',
        abilityId: 'barrier',
        targetId: scholar.id,
    } as const
    handleAbilityCommand(actor, barrierLesson, context)
    expect(knowsAbility(actor, 'barrier')).toBe(false)
    actor.progression.masteries.magic.level = 3
    expect(learnFireball(actor, scholar, 1000)).toMatchObject([
        { kind: 'notice' },
    ])
    expect(teachMagic(scholar, actor, 1000)).toMatchObject([{ kind: 'notice' }])
    expect(studyMagic(actor, scholar, 1000)).toMatchObject([{ kind: 'notice' }])
    expect(actor.progression.magicChaptersRead).toBe(1)
    expect(knowsAbility(actor, 'fireball')).toBe(false)
    handleAbilityCommand(mageStudent, barrierLesson, context)
    expect(knowsAbility(mageStudent, 'barrier')).toBe(true)
    handleAbilityCommand(
        mageStudent,
        { type: 'learn_ability', abilityId: 'pray_road', targetId: cleric.id },
        context
    )
    expect(knowsAbility(mageStudent, 'pray_road')).toBe(false)
    expect(learnFireball(mageStudent, scholar, 1000)).toEqual([])
    mageStudent.progression.masteries.magic.level = 3
    expect(learnFireball(mageStudent, scholar, 1000)).not.toEqual([])
    expect(knowsAbility(mageStudent, 'fireball')).toBe(true)
})

it('grants new spells by Magic level and applies the highest mana ranks at ordinary action boundaries', () => {
    const actor = abilityHero('arcanist')
    awardMasteries(actor, [{ constellationId: 'magic', experience: 2_000 }], {
        now: 1000,
        random: () => 0,
    })
    expect(actor.progression.masteries.magic.level).toBe(6)
    for (const id of [
        'chains',
        'blink',
        'dispel_magic',
        'city_portal',
    ] as const) {
        expect(knowsAbility(actor, id)).toBe(true)
        expect(actor.progression.constellations.opened.has(`magic.${id}`)).toBe(
            true
        )
    }
    for (const id of [
        'magic.spark_economy',
        'magic.spell_economy1',
        'magic.spell_economy2',
        'magic.spell_economy3',
        'magic.mana_rest1',
        'magic.mana_rest2',
        'magic.mana_rest3',
    ]) {
        actor.progression.constellations.opened.add(id)
    }
    expect(effectiveAbility(actor, 'spark').mana).toBe(2)
    expect(effectiveAbility(actor, 'fireball').mana).toBe(6)
    expect(effectiveAbility(actor, 'city_portal').mana).toBe(20)
    expect(effectiveAbility(actor, 'pray').mana).toBe(5)
    actor.mana = 10
    actor.applyRegen(1000, false, true, 1000)
    expect(actor.mana).toBe(16)
    actor.applyRegen(1000, true, true, 2000)
    expect(actor.mana).toBe(18)
    actor.combat.readyAt = 4000
    actor.applyRegen(1000, false, true, 3000)
    expect(actor.mana).toBe(22)
    actor.mana = 2
    expect(resourceChecks(actor).abilities.barrier).toBe('mana')
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
