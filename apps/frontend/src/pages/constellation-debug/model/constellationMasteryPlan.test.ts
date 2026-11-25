import { expect, it } from 'vitest'

import { initialConstellationBuild } from './constellationBuild'
import {
    constellationBuildLevels,
    constellationBuildParents,
    constellationStarPlan,
} from './constellationMasteryPlan'

it('excludes cleric starters from paid cost and uses authored gates', () => {
    const start = initialConstellationBuild('cleric')
    expect([...start]).toEqual(['prayer.root', 'prayer.revive'])
    expect(constellationBuildLevels(start, 'cleric').prayer).toBe(0)
    expect(constellationBuildLevels(start, 'vanguard').prayer).toBe(5)
    const area = constellationStarPlan('prayer.area', 'cleric')
    expect(area.ids.size).toBe(7)
    expect(area.levels.prayer).toBe(5)
    expect(constellationStarPlan('prayer.harm2', 'cleric').levels.prayer).toBe(12)
})
it('keeps spell knowledge prerequisites separate from presentation edges', () => {
    expect(constellationBuildParents('magic.fire_damage')).toContain('magic.fireball')
    expect(constellationStarPlan('magic.fire_damage').levels.magic).toBe(3)
    const joint = constellationStarPlan('prayer.last_light', 'cleric')
    expect(joint.levels.prayer).toBe(1)
    expect(joint.levels.life).toBe(1)
})
