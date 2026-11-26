import {
    type AbilityId,
    ARTISAN_STARS,
    createMasteryLevels,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../src/game/constellationNodes'
import {
    canDiscoverConstellationStar,
    type ConstellationRequirementContext,
} from '../src/game/constellationRequirements'

const node = (id: string) => {
    const result = fullConstellationCatalog.find((entry) => entry.id === id)
    if (result === undefined) {
        throw new Error(`Missing star: ${id}`)
    }
    return result
}
function context(
    level = 1,
    parents: string[] = []
): ConstellationRequirementContext {
    const levels = createMasteryLevels()
    levels.prayer = level
    return {
        opened: new Set(['prayer.root', 'prayer.revive', ...parents]),
        levels,
        knownAbilities: new Set<AbilityId>(['pray']),
        heroClass: 'cleric',
    }
}

const authoredLevelGates = new Map([
    [ARTISAN_STARS.hand, 1],
    [ARTISAN_STARS.economy, 2],
    [ARTISAN_STARS.oneStrike, 3],
    [ARTISAN_STARS.endurance, 4],
    ['arrow.damage3', 6],
    ['arrow.economy2', 4],
    ['arrow.tempo2', 4],
    ['arrow.critical2', 4],
    ['arrow.series1', 2],
    ['arrow.series2', 4],
    ['arrow.sniper_shot', 2],
    ['arrow.sniper_range1', 3],
    ['arrow.sniper_range2', 5],
    ['arrow.sniper_windup1', 3],
    ['arrow.sniper_windup2', 5],
    ['arrow.sniper_economy1', 3],
    ['arrow.sniper_economy2', 5],
    ['arrow.sniper_tempo1', 3],
    ['arrow.sniper_tempo2', 5],
    ['arrow.sniper_critical1', 3],
    ['arrow.sniper_critical2', 5],
    ['arrow.sniper_opening', 5],
    ['arrow.sniper_long_range', 8],
    ['arrow.moving_damage1', 5],
    ['arrow.moving_damage2', 7],
    ['arrow.moving_critical1', 5],
    ['arrow.moving_critical2', 7],
    ['arrow.moving_dash1', 5],
    ['arrow.moving_dash2', 7],
    ['arrow.moving_speed1', 5],
    ['arrow.moving_speed2', 7],
    ['arrow.moving_followup1', 7],
    ['arrow.moving_followup2', 9],
    ['blade.combo1', 12],
    ['life.endurance', 3],
    ['life.rest', 3],
    ['life.work', 3],
    ['magic.fire_damage', 3],
    ['magic.chains_duration', 5],
    ['magic.chains_party', 8],
    ['magic.spell_economy1', 2],
    ['magic.spell_economy2', 5],
    ['magic.spell_economy3', 8],
    ['magic.mana_rest1', 2],
    ['magic.mana_rest2', 5],
    ['magic.mana_rest3', 8],
    ['prayer.harm1', 6],
    ['prayer.harm2', 12],
    ['prayer.ward3', 7],
    ['prayer.ward4', 12],
    ['prayer.aura_domain', 12],
    ['prayer.revive_master', 12],
    ['prayer.revive_angelic', 12],
    ['shadow.speed2', 3],
    ['shadow.speed3', 6],
    ['shadow.noise2', 3],
    ['shadow.noise3', 6],
    ['shadow.sight2', 3],
    ['shadow.sight3', 6],
    ['theft.luck2', 3],
    ['theft.luck3', 6],
    ['theft.composure2', 3],
    ['theft.composure3', 6],
    ['theft.tempo', 3],
    ['theft.rhythm', 6],
    ['undead.arcane_frame', 3],
    ['undead.hollow_bones', 3],
    ['undead.hollow_bones2', 6],
    ['undead.arcane_endurance', 3],
    ['undead.arcane_endurance2', 6],
    ['undead.consume_half', 5],
    ['undead.consume_full', 10],
    ['undead.dense_bone', 4],
    ['undead.splinters', 7],
    ['undead.anvil', 20],
    ['undead.cracked', 4],
    ['undead.splinter_edge', 8],
    ['undead.nothing_to_lose', 24],
    ['undead.bone_windup', 4],
    ['undead.read_recovery', 9],
    ['undead.feint', 16],
    ['undead.shatter_guard', 18],
    ['undead.dull_ring', 28],
    ['undead.marrow_draw', 5],
    ['undead.grudge', 6],
    ['undead.empty_veins', 10],
    ['undead.reassembly', 13],
    ['undead.grave_loan', 15],
    ['undead.delayed_decay', 7],
    ['undead.held_pain', 12],
    ['undead.collapse', 22],
    ['undead.collapse2', 36],
    ['undead.grim_feast', 8],
    ['undead.imprint', 20],
    ['undead.second_oath', 40],
    ['undead.hollow_sight', 4],
    ['undead.night_watch', 21],
    ['undead.bone_rank', 14],
    ['undead.arrow_catch', 18],
    ['undead.rattle', 26],
    ['undead.dust_kin', 11],
    ['undead.ash_crust', 25],
])

describe('individually authored constellation requirements', () => {
    it('uses the authored level gates for random stars', () => {
        for (const star of fullConstellationCatalog.filter(
            (entry) =>
                entry.acquisition === 'random' &&
                entry.constellationId !== 'prayer_grave'
        )) {
            expect(star.minimumLevel, star.id).toBe(
                authoredLevelGates.get(star.id) ?? 1
            )
        }
        expect(node('magic.fireball').minimumLevel).toBe(3)
        expect(node('magic.greater_fireball').minimumLevel).toBe(10)
        expect(node('prayer.revive').minimumLevel).toBe(5)
        expect(node('arrow.moving_shot')).toMatchObject({
            acquisition: 'event',
            minimumLevel: 4,
        })
        expect(node('undead.arcane_joints')).toMatchObject({
            acquisition: 'event',
            minimumLevel: 2,
        })
    })
    it('keeps all five upgrades random, passive and bound to the learned Mother prayer', () => {
        const upgrades = fullConstellationCatalog.filter((entry) =>
            entry.id.startsWith('prayer.revive_')
        )
        expect(upgrades).toHaveLength(5)
        for (const star of upgrades) {
            expect(star.acquisition).toBe('random')
            expect(star.effectType).toBe('passive')
            expect(star.ability).toBe('pray')
            expect(star.activationAbilityId).toBeUndefined()
            expect(star.evidence).toEqual([])
            expect(star.id.endsWith('.revive')).toBe(false)
        }
    })
    it('requires every parent together without adding a generation-level condition', () => {
        const experienced = 'prayer.revive_experienced'
        const higher = 'prayer.revive_higher'
        for (const id of ['prayer.revive_higher', experienced]) {
            expect(canDiscoverConstellationStar(node(id), context())).toBe(true)
        }
        const stable = node('prayer.revive_stable')
        expect(
            canDiscoverConstellationStar(stable, context(1, [experienced]))
        ).toBe(false)
        expect(canDiscoverConstellationStar(stable, context(1, [higher]))).toBe(
            false
        )
        expect(
            canDiscoverConstellationStar(
                stable,
                context(1, [experienced, higher])
            )
        ).toBe(true)
        const unknownPrayer = context(1, [experienced, higher])
        unknownPrayer.knownAbilities = new Set()
        expect(canDiscoverConstellationStar(stable, unknownPrayer)).toBe(false)
    })
    it('holds Master and Angelic outside the random pool until Miracles12 and all parents are present', () => {
        const experienced = 'prayer.revive_experienced'
        const higher = 'prayer.revive_higher'
        const master = node('prayer.revive_master')
        expect(
            canDiscoverConstellationStar(master, context(11, [experienced]))
        ).toBe(false)
        expect(
            canDiscoverConstellationStar(master, context(12, [experienced]))
        ).toBe(true)
        expect(
            canDiscoverConstellationStar(master, context(12, [higher]))
        ).toBe(false)
        const angelic = node('prayer.revive_angelic')
        expect(
            canDiscoverConstellationStar(
                angelic,
                context(11, [experienced, higher])
            )
        ).toBe(false)
        expect(
            canDiscoverConstellationStar(angelic, context(12, [experienced]))
        ).toBe(false)
        expect(
            canDiscoverConstellationStar(angelic, context(12, [higher]))
        ).toBe(false)
        expect(
            canDiscoverConstellationStar(
                angelic,
                context(12, [experienced, higher])
            )
        ).toBe(true)
    })
})
