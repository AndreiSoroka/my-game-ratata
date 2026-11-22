import {
    masteryTotalExperience,
    parseMasteryExperience,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import {
    constellationWireId,
    fullConstellationCatalog,
} from '../src/game/constellationNodes'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import { effectiveMaxEnergy } from '../src/game/effectiveResources'
import { prepareConstellationLayout } from '../src/game/personalConstellationSky'
import {
    awardUndeadExperience,
    inheritSkeletonProgress,
} from '../src/game/skeletonProgression'

const skeleton = () =>
    new GameCharacter({
        archetype: 'skeleton',
        controllerKind: 'mob1',
        faction: 'monsters',
        id: 'skeleton',
        nickname: 'Skeleton',
        spawnPosition: { x: 0, y: 0 },
    })

describe('Undead constellation', () => {
    it('starts with Blade I and Arcane Joints on an ordinary character', () => {
        const actor = skeleton()
        expect(actor.baseMaxHp).toBe(10)
        expect(actor.hp).toBe(50)
        expect(actor.maxHp).toBe(50)
        expect(actor.progression.masteries.blade.level).toBe(1)
        expect(actor.progression.masteries.undead.level).toBe(2)
        expect([...actor.progression.constellations.opened]).toEqual([
            'blade.root',
            'undead.root',
            'undead.arcane_joints',
        ])

        prepareConstellationLayout(actor)
        const sky = snapshotConstellations(actor)
        expect(sky.layout?.centerNodeId).toBe(
            constellationWireId('undead.root')
        )
        expect(sky.paths.find((path) => path.id === 'undead')).toMatchObject({
            unlocked: true,
            name: 'Нежить',
        })
        expect(
            sky.nodes.find(
                (node) => node.id === constellationWireId('undead.arcane_frame')
            )
        ).toMatchObject({ unlocked: false })
    })

    it('discovers different branches at the first earned level', () => {
        const sturdy = skeleton()
        const armored = skeleton()
        const durable = skeleton()
        const experience = parseMasteryExperience('200')

        awardUndeadExperience(sturdy, experience, {
            now: 1000,
            random: () => 0,
        })
        awardUndeadExperience(durable, experience, {
            now: 1000,
            random: () => 0.9,
        })
        awardUndeadExperience(armored, experience, {
            now: 1000,
            random: () => 0.5,
        })

        expect(sturdy.maxHp).toBe(80)
        expect(sturdy.hp).toBe(50)
        expect(effectiveMaxEnergy(durable)).toBe(270)
        expect(durable.maxHp).toBe(50)
        expect(
            armored.progression.constellations.opened.has('undead.hollow_bones')
        ).toBe(true)
        expect(
            armored.progression.constellations.opened.has('undead.consume_half')
        ).toBe(false)

        awardUndeadExperience(durable, masteryTotalExperience(10), {
            now: 2000,
            random: () => 0,
        })
        expect(effectiveMaxEnergy(durable)).toBe(315)
        expect(
            durable.progression.constellations.opened.has('undead.consume_full')
        ).toBe(true)
    })

    it('fills inherited capacity at birth and ignores an inheritance replay', () => {
        const actor = skeleton()
        inheritSkeletonProgress(actor, 10, 1000)
        expect(actor.progression.masteries.undead.level).toBe(10)
        expect(actor.hp).toBe(actor.maxHp)
        expect(actor.energy).toBe(effectiveMaxEnergy(actor))

        actor.hp -= 25
        actor.energy -= 10
        const { hp, energy } = actor
        expect(inheritSkeletonProgress(actor, 10, 1001)).toEqual([])
        expect(actor.hp).toBe(hp)
        expect(actor.energy).toBe(energy)
    })

    it.each([0, 0.999])(
        'can reach all 39 stars by level 40 with draw %s',
        (draw) => {
            const actor = skeleton()
            awardUndeadExperience(actor, masteryTotalExperience(40), {
                now: 1000,
                random: () => draw,
            })
            expect(actor.progression.masteries.undead.level).toBe(40)
            const catalogue = fullConstellationCatalog.filter(
                (node) => node.constellationId === 'undead'
            )
            expect(catalogue).toHaveLength(39)
            expect(
                catalogue.every((node) =>
                    actor.progression.constellations.opened.has(node.id)
                )
            ).toBe(true)
        }
    )
})
