import {
    bladeAbilityIds,
    HUMAN_MELEE_RULES,
    resolveBladeDefense,
    resolveBladeTechnique,
} from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { enableAllConstellationStars } from './constellationBuild'
import { describeConstellationBuild } from './constellationBuildSummary'
import ConstellationDebug from './ConstellationDebug.vue'

it('resolves learned blade actions from the same ordinary energy and technique rules as the simulation', () => {
    const active = enableAllConstellationStars()
    const bonuses = resolveConstellationBonuses(active)
    const energy = Math.ceil(HUMAN_MELEE_RULES.energy * bonuses.swordEnergyMultiplier)
    expect(energy).toBe(11)
    for (const id of bladeAbilityIds.filter((id) => id !== 'defensive_stance')) {
        const action = resolveBladeTechnique(id, bonuses, energy, 1)
        const rows = Object.fromEntries(
            describeConstellationBuild(`blade.${id}`, active).rows.map((row) => [
                row.label,
                row.value,
            ])
        )
        expect(rows['Цена приёма, EN']).toBe(String(action.energy))
        expect(rows['Полный цикл приёма, мс']).toBe(String(action.cycleMs))
        expect(rows['Момент попадания, мс']).toBe(String(action.windupMs))
        expect(rows['Возвращение движения, мс']).toBe(String(action.movementMs))
        expect(rows['Отдельный откат, мс']).toBe(String(action.cooldownMs))
    }
    const defense = resolveBladeDefense(bonuses)
    const rows = Object.fromEntries(
        describeConstellationBuild('blade.defensive_stance', active).rows.map((row) => [
            row.label,
            row.value,
        ])
    )
    expect(rows['Минимум энергии и цена принятого удара, EN']).toBe(String(defense.hitEnergy))
    expect(rows['Парирование дальнего удара']).toBe('10%')
})

it('keeps all 42 authored Blade results available and previews 0/1/2/all earned card rows', async () => {
    expect(
        fullConstellationCatalog.filter((node) => node.constellationId === 'blade')
    ).toHaveLength(42)
    const view = mount(ConstellationDebug, {
        props: { syncUrl: false, initialHeroClass: 'vanguard' },
    })
    try {
        await view.get('[data-star-id="blade.wide_swing"]').trigger('click')
        const card = () => view.get('[data-testid="selected-star-card"]')
        expect(card().findAll('li')).toHaveLength(5)
        await view.get('[data-testid="debug-character-knowledge"]').setValue(true)
        expect(card().findAll('li')).toHaveLength(0)
        await view.get('[data-testid="debug-build-all"]').trigger('click')
        expect(card().findAll('li')).toHaveLength(5)
        await view.get('[data-star-toggle="blade.insight3"]').trigger('click')
        expect(card().findAll('li')).toHaveLength(2)
        await view.get('[data-star-toggle="blade.insight2"]').trigger('click')
        expect(card().findAll('li')).toHaveLength(1)
        await view.get('[data-star-toggle="blade.insight1"]').trigger('click')
        expect(card().findAll('li')).toHaveLength(0)
        await view.get('[data-testid="debug-character-knowledge"]').setValue(false)
        expect(card().findAll('li')).toHaveLength(5)
        expect(view.emitted('command')).toBeUndefined()
    } finally {
        view.unmount()
    }
})
