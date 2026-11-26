import type {
    CharacterControllerKind,
    HeroClass,
} from '@my-game-ratata/contracts'
import {
    formatMasteryExperience,
    masteryTotalExperience,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { constellationStars } from '../src/game/constellationCatalog'
import {
    constellationWireId,
    fullConstellationCatalog,
} from '../src/game/constellationNodes'
import {
    costsConstellationOpening,
    minimumConstellationLevel,
} from '../src/game/constellationRequirements'
import {
    consumeRunicShot,
    finishConstellationAction,
    hasStar,
    recordRunicContact,
    snapshotConstellations,
    syncAbilityConstellations,
} from '../src/game/constellations'
import { prepareConstellationLayout } from '../src/game/personalConstellationSky'
import { awardMasteries } from '../src/game/skillProgression'

describe('server-owned constellation discovery', () => {
    it.each(['network_player', 'scripted', 'mob1'] as const)(
        'resolves every eligible opening and banks the rest for %s',
        (controllerKind) => {
            const actor = hero('ranger', controllerKind)
            for (const id of ['blade.root', 'life.hp2', 'life.energy2']) {
                actor.progression.constellations.opened.add(id)
            }
            const award = [
                {
                    constellationId: 'blade' as const,
                    experience: Number(
                        formatMasteryExperience(masteryTotalExperience(44))
                    ),
                },
            ]
            const options = {
                now: 1000,
                random: () => 0,
                receiptId: 'resolved-1',
            }
            awardMasteries(actor, award, options)
            expect(actor.progression.masteries.blade.level).toBe(44)
            expect(
                constellationStars
                    .filter((star) => star.constellationId === 'blade')
                    .every((star) => hasStar(actor, star.id))
            ).toBe(true)
            expect(actor.progression.constellations.credits.blade).toBe(3)
            expect(awardMasteries(actor, award, options)).toEqual([])
            snapshotConstellations(actor)
            snapshotConstellations(actor)
            expect(actor.progression.constellations.credits.blade).toBe(3)
            expect(actor.progression.masteries.blade.experience).toBe(0n)
        }
    )

    it('keeps positive base weights while relevant practice changes the draw', () => {
        const practiced = hero()
        const neutral = hero()
        for (const actor of [practiced, neutral]) {
            actor.progression.constellations.credits.blade = 1
            actor.progression.masteries.blade.level = 1
        }
        practiced.progression.constellations.evidence['swordsmanship'] = 5
        const action = {
            constellationIds: ['blade'] as const,
            now: 1000,
            random: () => 0.3,
        }
        finishConstellationAction(practiced, action)
        finishConstellationAction(neutral, action)
        expect(hasStar(practiced, 'blade.damage1')).toBe(true)
        expect(hasStar(neutral, 'blade.damage1')).toBe(false)
        expect(
            practiced.progression.constellations.evidence['swordsmanship']
        ).toBeUndefined()
    })

    it('does not spend banked credits on an unavailable spell enhancement', () => {
        const actor = hero('arcanist')
        for (const node of constellationStars.filter(
            (node) =>
                node.constellationId === 'magic' &&
                node.id !== 'magic.fire_damage'
        )) {
            actor.progression.constellations.opened.add(node.id)
        }
        actor.progression.constellations.credits.magic = 1
        actor.progression.masteries.magic.level = 3
        const action = {
            constellationIds: ['magic'] as const,
            now: 1000,
            random: () => 0,
        }
        expect(finishConstellationAction(actor, action)).toEqual([])
        expect(actor.progression.constellations.credits.magic).toBe(1)
        actor.abilities.known.add('fireball')
        expect(
            finishConstellationAction(actor, { ...action, now: 2000 })
        ).toEqual([])
        expect(hasStar(actor, 'magic.fire_damage')).toBe(true)
    })

    it('sends only roots and opaque neighboring unknown stars, with pure snapshots', () => {
        const actor = hero()
        const snapshot = snapshotConstellations(actor)
        expect(snapshot.paths).toHaveLength(12)
        const hidden = snapshot.nodes.filter(
            (node) =>
                node.constellationId === 'blade' &&
                node.parents.length > 0 &&
                !node.unlocked
        )
        expect(hidden.length).toBeGreaterThan(0)
        for (const node of hidden) {
            expect(node.name).toBeUndefined()
            expect(node.description).toBeUndefined()
            expect(node.kind).toBeUndefined()
            expect(node.effectType).toBeUndefined()
            expect(node.id).toMatch(/^node-\d+$/)
            expect(node.parents).toEqual([constellationWireId('blade.root')])
        }
        expect(JSON.stringify(snapshot)).not.toContain('blade.damage2')
        expect(JSON.stringify(snapshot)).not.toContain('credits')
        expect(JSON.stringify(snapshot)).not.toContain('evidence')
    })

    it('keeps discoveries through temporary death and clears them at permanent death', () => {
        const actor = hero()
        actor.progression.constellations.opened.add('life.hp4')
        actor.applyDamage(actor.hp, 1000)
        expect(hasStar(actor, 'life.hp4')).toBe(true)
        retireCharacter(actor)
        expect(hasStar(actor, 'life.hp4')).toBe(false)
        expect(actor.progression.constellations.credits.life).toBe(0)
    })
})

describe('Arrow discoveries', () => {
    it('starts Rangers with two actions and an unsettled mobility star', () => {
        const actor = hero('ranger')
        const arrow = fullConstellationCatalog.filter(
            (node) => node.constellationId === 'arrow'
        )
        const sniper = arrow.find((node) => node.id === 'arrow.sniper_shot')
        if (sniper === undefined) {
            throw new Error('Sniper Shot is missing from Arrow')
        }
        expect(arrow).toHaveLength(40)
        expect(actor.abilities.known).toEqual(new Set(['shot', 'sniper_shot']))
        expect(actor.progression.constellations.opened).toEqual(
            new Set(['arrow.root', sniper.id])
        )
        expect(actor.progression.constellations.credits.arrow).toBe(0)
        expect(costsConstellationOpening(sniper, 'ranger')).toBe(false)
        expect(minimumConstellationLevel(sniper.id, 'ranger')).toBe(0)
        expect(costsConstellationOpening(sniper, 'vanguard')).toBe(true)
        expect(minimumConstellationLevel(sniper.id, 'vanguard')).toBe(2)
        const nodes = snapshotConstellations(actor).nodes
        expect(
            nodes.find((node) => node.id === constellationWireId(sniper.id))
        ).toMatchObject({ name: 'Снайперский выстрел', unlocked: true })
        expect(
            nodes.find(
                (node) => node.id === constellationWireId('arrow.moving_shot')
            )
        ).toMatchObject({ unlocked: false })
    })

    it('lets Sniper Shot compete for a credit from level two and grants the skill only when drawn', () => {
        const lucky = hero()
        const other = hero()
        const awards = [{ constellationId: 'arrow', experience: 100 }] as const
        for (const actor of [lucky, other]) {
            actor.abilities.known.add('shot')
            syncAbilityConstellations(actor)
            awardMasteries(actor, awards, { now: 1000, random: () => 1 })
            expect(actor.progression.masteries.arrow.level).toBe(1)
            expect(actor.abilities.known.has('sniper_shot')).toBe(false)
        }
        awardMasteries(lucky, awards, { now: 2000, random: () => 1 })
        awardMasteries(other, awards, { now: 2000, random: () => 0 })
        expect(lucky.progression.masteries.arrow.level).toBe(2)
        expect(other.progression.masteries.arrow.level).toBe(2)
        expect(lucky.abilities.known.has('sniper_shot')).toBe(true)
        expect(other.abilities.known.has('sniper_shot')).toBe(false)
        expect(hasStar(other, 'arrow.damage1')).toBe(true)
        expect(lucky.progression.constellations.credits.arrow).toBe(0)
        expect(other.progression.constellations.credits.arrow).toBe(0)
    })

    it('grants Moving Shot at level four with no stored opening', () => {
        const actor = hero('ranger')
        actor.progression.masteries.arrow.level = 3
        finishConstellationAction(actor, { now: 1000 })
        expect(hasStar(actor, 'arrow.moving_shot')).toBe(false)
        actor.progression.masteries.arrow.level = 4
        finishConstellationAction(actor, { now: 2000 })
        expect(hasStar(actor, 'arrow.moving_shot')).toBe(true)
        expect(actor.progression.constellations.credits.arrow).toBe(0)
        expect(actor.abilities.known).toEqual(new Set(['shot', 'sniper_shot']))
    })
})

describe('cross-constellation discoveries', () => {
    it('requires one enemy and the five-second boundary, then consumes a single runic charge', () => {
        const actor = hero('arcanist')
        actor.progression.constellations.opened.add('magic.spark_damage')
        actor.progression.constellations.opened.add('arrow.damage1')
        recordRunicContact(actor, 'enemy-1', 'spell', 1000)
        expect(recordRunicContact(actor, 'enemy-2', 'shot', 2000)).toEqual([])
        expect(recordRunicContact(actor, 'enemy-1', 'shot', 6001)).toEqual([])
        expect(recordRunicContact(actor, 'enemy-1', 'shot', 6000)).toEqual([])
        expect(hasStar(actor, 'magic.runic_echo')).toBe(true)
        expect(consumeRunicShot(actor, 6000)).toBe(1)
        recordRunicContact(actor, 'enemy-1', 'spell', 7000)
        expect(consumeRunicShot(actor, 11999)).toBe(1.1)
        expect(consumeRunicShot(actor, 11999)).toBe(1)
        recordRunicContact(actor, 'enemy-1', 'spell', 13000)
        expect(consumeRunicShot(actor, 18000)).toBe(1)
    })

    it('opens Last Light from a validated low-HP gift without spending a mastery credit', () => {
        const actor = hero('cleric')
        actor.progression.constellations.opened.add('prayer.gift1')
        actor.progression.constellations.opened.add('life.hp1')
        expect(
            finishConstellationAction(actor, {
                constellationIds: ['prayer'],
                now: 1000,
                evidence: ['gift'],
            })
        ).toEqual([])
        expect(
            finishConstellationAction(actor, {
                constellationIds: ['prayer'],
                now: 2000,
                evidence: ['gift', 'low_hp_gift'],
            })
        ).toEqual([])
        expect(hasStar(actor, 'prayer.last_light')).toBe(true)
        expect(actor.progression.constellations.credits.prayer).toBe(0)
    })
})

let nextId = 0
function hero(
    heroClass: HeroClass = 'vanguard',
    controllerKind: CharacterControllerKind = 'network_player'
) {
    const actor = new GameCharacter({
        archetype: 'human',
        controllerKind,
        heroClass,
        id: `constellation-${String(nextId++)}`,
        nickname: 'Герой',
        spawnPosition: { x: 100, y: 100 },
    })
    prepareConstellationLayout(actor)
    return actor
}
