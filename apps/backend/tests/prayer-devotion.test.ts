import { previewPrayerFromSnapshots } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import {
    handleAbilityCommand,
    parseAbilityCommand,
} from '../src/game/abilityCommands'
import { supportPrayerDecision } from '../src/game/clericPolicy'
import { observeCharacterCombat } from '../src/game/combatObservation'
import { pray } from '../src/game/prayer'
import { previewPrayer } from '../src/game/prayerContext'
import { completePrayer } from '../src/game/prayerEffects'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function ownerSnapshot(actor: ReturnType<typeof abilityHero>) {
    return observeCharacterCombat(actor.snapshot(1000), actor, {
        observer: actor,
        getCharacter: () => undefined,
        navigation: undefined,
        now: 1000,
    })
}

const devotion = {
    type: 'use_ability',
    abilityId: 'pray',
    intent: { mode: 'devotion' },
} as const

it.each(['hearth', 'road', 'lantern', 'grave'] as const)(
    'keeps a pinned %s devotion cosmetic when targets appear, without rolling or training',
    (patron) => {
        const actor = abilityHero('cleric', 'construct')
        actor.progression.patron = patron
        actor.progression.skills.miracles.level = 3
        const random = vi.fn(() => 0)
        const context = abilityContext([actor], 1000, random)
        const preview = previewPrayer(actor, context)
        expect(preview).toMatchObject({
            intent: devotion.intent,
            manaCost: 0,
            harmfulTargets: 0,
            includesAllies: false,
            includesSelf: false,
            unavailableReason: null,
        })
        expect(previewPrayerFromSnapshots(ownerSnapshot(actor), [])).toEqual(
            preview
        )
        const living = abilityHero()
        const undead = abilityHero('vanguard', 'undead')
        const corpse = abilityHero()
        living.hp -= 10
        undead.hp -= 10
        corpse.applyDamage(corpse.hp, 100)
        const populated = {
            ...context,
            characters: [actor, living, undead, corpse],
        }
        const health = populated.characters.map((target) => target.hp)
        const progression = structuredClone(actor.progression)
        const events = handleAbilityCommand(actor, devotion, populated)
        expect(events).toEqual([
            {
                kind: 'cast',
                actorId: actor.id,
                abilityId: 'pray',
                phase: 'completed',
            },
        ])
        expect(populated.characters.map((target) => target.hp)).toEqual(health)
        expect(corpse.alive).toBe(false)
        expect(actor.mana).toBe(120)
        expect(actor.energy).toBe(actor.config.resources.maxEnergy)
        expect(actor.animationAction).toBe('idle')
        expect(actor.animationUntil).toBe(1400)
        expect(actor.actionLockUntil).toBe(1400)
        expect(actor.abilities.availableAt.pray).toBe(4000)
        expect(actor.progression).toEqual({
            ...progression,
            prayerAvailableAt: 4000,
        })
        expect(random).not.toHaveBeenCalled()
        expect(
            completePrayer(actor, devotion.intent, populated, 0, 1.3)
        ).toEqual([])
        expect(populated.characters.map((target) => target.hp)).toEqual(health)
    }
)

it('pins devotion for an unsuitable selected ally rather than healing or burning neighbors', () => {
    const actor = abilityHero()
    actor.progression.skills.miracles.level = 3
    const selected = abilityHero()
    const wounded = abilityHero()
    const undead = abilityHero('vanguard', 'undead')
    wounded.hp -= 10
    const context = abilityContext([actor, selected, wounded, undead])
    for (const targetId of [selected.id, 'missing']) {
        const preview = previewPrayer(actor, context, targetId)
        expect(preview.intent).toEqual(devotion.intent)
        expect(preview.harmfulTargets).toBe(0)
        expect(preview.includesAllies).toBe(false)
        expect(preview.unavailableReason).toBe(null)
        expect(
            previewPrayerFromSnapshots(
                ownerSnapshot(actor),
                context.characters.map((target) => target.snapshot(1000)),
                targetId
            )
        ).toEqual(preview)
    }
})

it('uses the same devotion through legacy prayers and keeps the three-second cooldown boundary', () => {
    const actor = abilityHero()
    const context = abilityContext([actor])
    expect(pray(actor, 1000, context.random, context)[0]?.kind).toBe('cast')
    expect(actor.mana).toBe(120)
    expect(
        handleAbilityCommand(actor, devotion, { ...context, now: 3999 })[0]
            ?.kind
    ).toBe('notice')
    expect(actor.mana).toBe(120)
    expect(
        handleAbilityCommand(actor, devotion, { ...context, now: 4000 })[0]
            ?.kind
    ).toBe('cast')
    expect(actor.mana).toBe(120)
    expect(actor.progression.skills.faith.practice).toBe(0)
    expect(actor.progression.skills.miracles.practice).toBe(0)
})

it.each(['unknown', 'dead', 'offline', 'retired', 'stun', 'busy'] as const)(
    'rejects %s devotion without mana, cooldown or practice changes',
    (reason) => {
        const actor = abilityHero()
        if (reason === 'unknown') {
            actor.abilities.known.delete('pray')
        }
        if (reason === 'dead') {
            actor.applyDamage(actor.hp, 0)
        }
        if (reason === 'offline') {
            actor.tags.add('offline')
        }
        if (reason === 'retired') {
            actor.tags.add('state.retired')
        }
        if (reason === 'stun') {
            actor.stunUntil = 2000
        }
        if (reason === 'busy') {
            actor.actionLockUntil = 2000
        }
        const mana = actor.mana
        const progression = structuredClone(actor.progression)
        const events = handleAbilityCommand(
            actor,
            devotion,
            abilityContext([actor])
        )
        expect(events.every((event) => event.kind === 'notice')).toBe(true)
        expect(actor.mana).toBe(mana)
        expect(actor.progression).toEqual(progression)
        expect(actor.abilities.availableAt.pray).toBeUndefined()
    }
)

it('permits devotion at zero mana while ordinary help still requires five mana', () => {
    const actor = abilityHero()
    actor.mana = 0
    const context = abilityContext([actor])
    expect(previewPrayer(actor, context).unavailableReason).toBe(null)
    expect(handleAbilityCommand(actor, devotion, context)[0]?.kind).toBe('cast')
    expect(actor.mana).toBe(0)
    actor.mana = 4
    actor.hp -= 10
    const events = handleAbilityCommand(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'restore', targetId: actor.id },
        },
        { ...context, now: 4000 }
    )
    expect(events.every((event) => event.kind === 'notice')).toBe(true)
    expect(actor.mana).toBe(4)
})

it('cannot turn empty Lantern prayers into practice by manufacturing a mana deficit', () => {
    const actor = abilityHero()
    actor.progression.patron = 'lantern'
    for (const now of [1000, 4000, 7000]) {
        const context = abilityContext([actor], now)
        expect(previewPrayer(actor, context).intent).toEqual(devotion.intent)
        expect(handleAbilityCommand(actor, devotion, context)[0]?.kind).toBe(
            'cast'
        )
        expect(actor.mana).toBe(actor.config.resources.maxMana)
    }
    expect(actor.progression.skills.faith.practice).toBe(0)
    expect(actor.progression.skills.miracles.practice).toBe(0)
})

it('distinguishes a projected zero-capacity mana pool from an empty pool when previewing Lantern aid', () => {
    const actor = abilityHero()
    actor.progression.patron = 'lantern'
    const target = abilityHero('vanguard', 'undead')
    expect(target.config.resources.maxMana).toBe(0)
    const projected = observeCharacterCombat(target.snapshot(1000), target, {
        observer: actor,
        getCharacter: () => undefined,
        navigation: undefined,
        now: 1000,
    })
    expect(projected.resources.mana).toEqual({
        kind: 'percent',
        percent: 0,
        hasCapacity: false,
    })
    expect(
        previewPrayerFromSnapshots(ownerSnapshot(actor), [projected], target.id)
            .intent
    ).toEqual(devotion.intent)
    const empty = abilityHero()
    empty.mana = 0
    const emptyView = observeCharacterCombat(empty.snapshot(1000), empty, {
        observer: actor,
        getCharacter: () => undefined,
        navigation: undefined,
        now: 1000,
    })
    expect(
        previewPrayerFromSnapshots(ownerSnapshot(actor), [emptyView], empty.id)
            .intent
    ).toEqual({ mode: 'restore', targetId: empty.id })
})

it('accepts only an explicit targetless devotion at the command boundary', () => {
    expect(parseAbilityCommand(devotion)).toEqual(devotion)
    for (const intent of [
        { mode: 'devotion', targetId: 'someone' },
        { mode: 'devotion', targetId: null },
        { mode: 'unknown' },
        { mode: 1 },
        [],
        null,
    ]) {
        expect(parseAbilityCommand({ ...devotion, intent })).toBeUndefined()
    }
})

it('does not make autonomous support priests spend mana on empty prayers', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    const request = vi.fn(() => [])
    expect(
        supportPrayerDecision(actor, abilityContext([actor]), request)
    ).toEqual([])
    expect(request).not.toHaveBeenCalled()
    expect(actor.mana).toBe(120)
})
