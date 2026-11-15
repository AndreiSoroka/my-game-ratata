import { expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { advanceRevive } from '../src/game/characterLife'
import { abilityContext, abilityHero } from './abilityTestHelpers'

it.each([
    'dead',
    'offline',
    'stunned',
    'locked',
    'retired',
    'mana',
    'far',
    'other-map',
    'target-offline',
    'wall',
] as const)('rejects %s prayer without spending or training', (reason) => {
    const actor = abilityHero()
    const target = abilityHero()
    target.hp -= 12
    const context = abilityContext([actor, target])
    if (reason === 'dead') {
        actor.applyDamage(actor.hp, 0)
    }
    if (reason === 'offline') {
        actor.tags.add('offline')
    }
    if (reason === 'retired') {
        actor.tags.add('state.retired')
    }
    if (reason === 'stunned') {
        actor.stunUntil = 2000
    }
    if (reason === 'locked') {
        actor.actionLockUntil = 2000
    }
    if (reason === 'mana') {
        actor.mana = 4
    }
    if (reason === 'far') {
        target.position.x += 49
    }
    if (reason === 'other-map') {
        target.locationId = 'map-0-0'
    }
    if (reason === 'target-offline') {
        target.tags.add('offline')
    }
    if (reason === 'wall') {
        target.position.x = 132
        context.navigation.grid.solid[6 * 32 + 7] = true
    }
    const mana = actor.mana
    const hp = target.hp
    handleAbilityCommand(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'restore', targetId: target.id },
        },
        context
    )
    expect(actor.mana).toBe(mana)
    expect(target.hp).toBe(hp)
    expect(actor.progression.skills.faith.practice).toBe(0)
    expect(actor.progression.skills.miracles.practice).toBe(0)
})
it('counts a successful area prayer once and respects exact range and walls for each victim', () => {
    const actor = abilityHero()
    actor.progression.skills.miracles.level = 3
    actor.progression.constellations.opened.add('prayer.harm')
    const enemies = Array.from({ length: 3 }, () =>
        abilityHero('vanguard', 'undead')
    )
    for (const target of enemies) {
        Object.assign(target, { faction: 'monsters' })
    }
    const edge = abilityHero('vanguard', 'undead')
    const far = abilityHero('vanguard', 'undead')
    const hidden = abilityHero('vanguard', 'undead')
    edge.position.y += 48
    far.position.y += 48.01
    hidden.position.x = 132
    const context = abilityContext([actor, ...enemies, edge, far, hidden])
    context.navigation.grid.solid[6 * 32 + 7] = true
    handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId: 'pray', intent: { mode: 'harm' } },
        context
    )
    const events = advanceRevive(actor, () => undefined, 4000, context.random, {
        ...context,
        now: 4000,
    })
    expect(events.filter((event) => event.kind === 'damage')).toHaveLength(4)
    expect(actor.progression.skills.faith.practice).toBe(1)
    expect(actor.progression.skills.miracles.practice).toBe(1)
    expect(far.hp).toBe(far.maxHp)
    expect(hidden.hp).toBe(hidden.maxHp)
})
it('never changes a pinned resurrection recipient or spends completion mana after the deadline', () => {
    const actor = abilityHero()
    const target = abilityHero()
    target.applyDamage(target.hp, 0)
    const context = abilityContext([actor, target], 58000)
    const command = {
        type: 'use_ability',
        abilityId: 'pray',
        intent: { mode: 'revive', targetId: target.id },
    } as const
    handleAbilityCommand(actor, command, context)
    expect(actor.abilities.casting?.targetId).toBe(target.id)
    const events = advanceRevive(
        actor,
        () => target,
        61000,
        () => 0,
        { ...context, now: 61000 }
    )
    expect(events).toContainEqual(
        expect.objectContaining({ kind: 'cast', phase: 'interrupted' })
    )
    expect(actor.mana).toBe(120)
    expect(target.alive).toBe(false)
})
