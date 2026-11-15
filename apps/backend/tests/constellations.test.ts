import type {
    CharacterControllerKind,
    HeroClass,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { constellationStars } from '../src/game/constellationCatalog'
import { constellationWireId } from '../src/game/constellationNodes'
import {
    consumeRunicShot,
    finishConstellationAction,
    hasStar,
    recordRunicContact,
    snapshotConstellations,
} from '../src/game/constellations'
import { prepareConstellationLayout } from '../src/game/personalConstellationSky'
import { trainSkill } from '../src/game/skillProgression'

describe('server-owned constellation discovery', () => {
    it.each(['network_player', 'scripted', 'mob1'] as const)(
        'banks mastery and opens at most one star after an action for %s',
        (controllerKind) => {
            const actor = hero('vanguard', controllerKind)
            trainSkill(actor, 'swordsmanship', 100_000)
            expect(actor.progression.constellations.credits.blade).toBe(9)
            expect(hasStar(actor, 'blade.damage1')).toBe(false)
            const first = {
                skillIds: ['swordsmanship'] as const,
                now: 1000,
                random: () => 0,
                actionId: 'resolved-1',
            }
            expect(finishConstellationAction(actor, first)).toHaveLength(1)
            expect(hasStar(actor, 'blade.damage1')).toBe(true)
            expect(hasStar(actor, 'blade.damage2')).toBe(false)
            expect(actor.progression.constellations.credits.blade).toBe(8)
            expect(finishConstellationAction(actor, first)).toEqual([])
            snapshotConstellations(actor)
            snapshotConstellations(actor)
            expect(actor.progression.constellations.credits.blade).toBe(8)
            expect(trainSkill(actor, 'swordsmanship')).toEqual([])
            finishConstellationAction(actor, {
                ...first,
                actionId: 'resolved-2',
            })
            expect(hasStar(actor, 'blade.damage2')).toBe(true)
            expect(actor.progression.constellations.credits.blade).toBe(7)
        }
    )

    it('keeps positive base weights while relevant practice changes the draw', () => {
        const practiced = hero()
        const neutral = hero()
        for (const actor of [practiced, neutral]) {
            actor.progression.constellations.credits.blade = 1
        }
        practiced.progression.constellations.evidence['swordsmanship'] = 5
        const action = {
            skillIds: ['swordsmanship'] as const,
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
        const action = {
            skillIds: ['arcana'] as const,
            now: 1000,
            random: () => 0,
        }
        expect(finishConstellationAction(actor, action)).toEqual([])
        expect(actor.progression.constellations.credits.magic).toBe(1)
        actor.progression.skills.fireball.unlocked = true
        expect(
            finishConstellationAction(actor, { ...action, now: 2000 })
        ).toHaveLength(1)
        expect(hasStar(actor, 'magic.fire_damage')).toBe(true)
    })

    it('sends only roots and opaque neighboring unknown stars, with pure snapshots', () => {
        const actor = hero()
        const snapshot = snapshotConstellations(actor)
        expect(snapshot.paths).toHaveLength(9)
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

describe('cross-constellation discoveries', () => {
    it('requires one enemy and the five-second boundary, then consumes a single runic charge', () => {
        const actor = hero('arcanist')
        actor.progression.constellations.opened.add('magic.spark_damage')
        actor.progression.constellations.opened.add('arrow.damage1')
        recordRunicContact(actor, 'enemy-1', 'spell', 1000)
        expect(recordRunicContact(actor, 'enemy-2', 'shot', 2000)).toEqual([])
        expect(recordRunicContact(actor, 'enemy-1', 'shot', 6001)).toEqual([])
        expect(recordRunicContact(actor, 'enemy-1', 'shot', 6000)).toHaveLength(
            1
        )
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
                skillIds: ['faith'],
                now: 1000,
                evidence: ['gift'],
            })
        ).toEqual([])
        expect(
            finishConstellationAction(actor, {
                skillIds: ['faith'],
                now: 2000,
                evidence: ['gift', 'low_hp_gift'],
            })
        ).toHaveLength(1)
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
