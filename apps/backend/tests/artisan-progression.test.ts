import {
    ARTISAN_LUMBER_RULES,
    ARTISAN_STARS,
    MASTERY_REWARDS,
    parseMasteryExperience,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { recordWoodHarvest } from '../src/game/artisanProgression'
import { curseWithAshExhaustion } from '../src/game/ashExhaustion'
import { constellationWireId } from '../src/game/constellationNodes'
import { hasStar } from '../src/game/constellations'
import { effectiveMaxEnergy } from '../src/game/effectiveResources'
import { prepareConstellationLayout } from '../src/game/personalConstellationSky'
import { snapshotProgression } from '../src/game/progressionObservation'
import { abilityHero } from './abilityTestHelpers'

const { root, hand, economy, oneStrike, endurance } = ARTISAN_STARS

describe('Artisan lumberjack progression', () => {
    it('discovers the root on the finish of a standing tree and then counts logs', () => {
        const actor = abilityHero('vanguard')
        const mastery = actor.progression.masteries.artisan
        prepareConstellationLayout(actor)
        const before = snapshotProgression(actor, 100)
        expect(before.masteries.some(({ id }) => id === 'artisan')).toBe(false)
        expect(
            before.constellations?.paths.find(({ id }) => id === 'artisan')
        ).toMatchObject({ unlocked: false })

        recordWoodHarvest(actor, false, 200)
        expect(hasStar(actor, root)).toBe(false)
        expect(mastery.experience).toBe(0n)

        recordWoodHarvest(actor, true, 300)
        const after = snapshotProgression(actor, 300)
        const reward = parseMasteryExperience(
            String(MASTERY_REWARDS.woodHarvest)
        )
        expect(hasStar(actor, root)).toBe(true)
        expect(mastery.experience).toBe(reward)
        expect(
            after.masteries.find(({ id }) => id === 'artisan')
        ).toMatchObject({
            level: 0,
            name: 'Ремесленник',
        })
        expect(
            after.constellations?.nodes.find(
                ({ id }) => id === constellationWireId(root)
            )
        ).toMatchObject({
            unlocked: true,
            nameMessage: { params: { text: 'Artisan' } },
        })
        expect(
            after.constellations?.nodes.find(
                ({ id }) => id === constellationWireId(hand)
            )
        ).toMatchObject({ unlocked: false, levelLocked: true })
        expect(
            after.constellations?.nodes.some(
                ({ id }) => id === constellationWireId(economy)
            )
        ).toBe(false)

        recordWoodHarvest(actor, false, 400)
        expect(mastery.experience).toBe(reward * 2n)
    })

    it('opens one perk at each level in sequence and adds a flat max energy bonus', () => {
        const actor = abilityHero('vanguard')
        actor.progression.constellations.opened.add('life.endurance')
        const beforeCap = effectiveMaxEnergy(actor)
        const beforeEnergy = actor.energy
        const perks = [hand, economy, oneStrike, endurance]
        for (let index = 0; index < 28; index += 1) {
            recordWoodHarvest(actor, index === 0, index, () => 0)
            const level = actor.progression.masteries.artisan.level
            expect(perks.filter((id) => hasStar(actor, id))).toEqual(
                perks.slice(0, level)
            )
            expect(actor.progression.constellations.credits.artisan).toBe(0)
        }
        expect(actor.progression.masteries.artisan.level).toBe(4)
        expect(effectiveMaxEnergy(actor)).toBe(
            beforeCap + ARTISAN_LUMBER_RULES.energyBonus
        )
        expect(actor.energy).toBe(beforeEnergy)

        const withoutArtisan = abilityHero('vanguard')
        withoutArtisan.progression.constellations.opened.add('life.endurance')
        curseWithAshExhaustion(withoutArtisan, 1, 100)
        curseWithAshExhaustion(actor, 1, 100)
        expect(effectiveMaxEnergy(actor)).toBeCloseTo(
            effectiveMaxEnergy(withoutArtisan) *
                (1 + ARTISAN_LUMBER_RULES.energyBonus / beforeCap)
        )
    })
})
