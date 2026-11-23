import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { enableAllConstellationStars } from './constellationBuild'
import ConstellationDebugChance from './ConstellationDebugChance.vue'
import { describeConstellationEffectChance } from './constellationEffectChance'
import { constellationStarPlan } from './constellationMasteryPlan'
import ConstellationPrayerCalculator from './ConstellationPrayerCalculator.vue'
import { calculatePrayerScenario } from './constellationPrayerScenario'

const all = enableAllConstellationStars()
const calculate = (
    nodeId = 'prayer.root',
    active: ReadonlySet<string> = all,
    mood: 'neutral' | 'benevolent' | 'wrathful' = 'neutral'
) => calculatePrayerScenario(nodeId, { mood, tileWidth: 16 }, active)!
const metric = (nodeId: string, label: string) =>
    calculate(nodeId).build!.metrics.find((entry) => entry.label === label)?.value
it('shows only each resurrection passive contribution, with no inherited fractions or success bonuses', () => {
    const nodes = fullConstellationCatalog.filter((node) => node.id.startsWith('prayer.revive'))
    expect(nodes).toHaveLength(6)
    for (const node of nodes) {
        const full = calculate(node.id)
        const own = calculate(node.id, new Set([node.id]))
        expect(full.build).toEqual(own.build)
        expect(full.metrics).toEqual(own.metrics)
    }
    expect(metric('prayer.revive', 'Ресурсы после воскрешения')).toContain('1% максимума')
    expect(metric('prayer.revive_higher', 'HP после воскрешения')).toContain('75%')
    expect(metric('prayer.revive_experienced', 'Бонус шанса воскрешения')).toBe('+10 п.п.')
    expect(metric('prayer.revive_master', 'Бонус шанса воскрешения')).toBe('+10 п.п.')
    expect(metric('prayer.revive_stable', 'Бонус шанса воскрешения')).toBe('+5 п.п.')
    expect(calculate('prayer.revive_angelic').metrics).toEqual([
        { label: 'Ангельское при успешном воскрешении', value: '30%' },
    ])
    expect(metric('prayer.revive_angelic', 'Ресурсы при Ангельском воскрешении')).toContain(
        '150% максимума HP, MP и EN'
    )
})
it('combines the active prayer without changing healing or mixing conditional and overall Angelic chances', () => {
    const full = calculate()
    expect(full.metrics).toContainEqual({ label: 'Шанс лечения', value: '55%' })
    expect(full.metrics).toContainEqual({ label: 'Шанс воскрешения', value: '80%' })
    expect(full.metrics).toContainEqual({
        label: 'Ангельское при успешном воскрешении',
        value: '30%',
    })
    expect(full.metrics).toContainEqual({
        label: 'Общий шанс Ангельского воскрешения',
        value: '24%',
    })
    expect(full.build!.metrics).toContainEqual({
        label: 'HP после воскрешения',
        value: '100% максимума; округление вверх, минимум 1',
    })
    expect(full.build!.metrics).toContainEqual({
        label: 'MP и EN после воскрешения',
        value: '1% максимума; минимум 1 каждого ресурса',
    })
    expect(full.build!.metrics).toContainEqual({ label: 'Время воскрешения', value: '1200 мс' })
    expect(calculate('prayer.root', all, 'benevolent').metrics).toContainEqual({
        label: 'Шанс воскрешения',
        value: '95%',
    })
    expect(calculate('prayer_grave.root').metrics).toContainEqual({
        label: 'Шанс воскрешения',
        value: '70%',
    })
    expect(metric('prayer_grave.revive', 'Ресурсы после воскрешения')).toContain('50% максимума')
})
it('keeps level12 individual gates while the ordinary Kara chain costs only its three openings', () => {
    expect(constellationStarPlan('prayer.harm2', 'cleric').levels.prayer).toBe(12)
    expect(constellationStarPlan('prayer.revive_master', 'cleric').levels.prayer).toBe(12)
    expect(constellationStarPlan('prayer.revive_angelic', 'cleric').levels.prayer).toBe(12)
    expect(constellationStarPlan('prayer.revive_stable', 'cleric').levels.prayer).toBe(3)
})
it('shows an own30% Angelic formula and dynamic active totals while keeping deterministic upgrades collapsed away', async () => {
    for (const id of [
        'prayer.revive_higher',
        'prayer.revive_experienced',
        'prayer.revive_master',
        'prayer.revive_stable',
    ]) {
        const view = mount(ConstellationDebugChance, { props: { nodeId: id, enabledStarIds: all } })
        expect(view.find('[data-testid="debug-effect-chance"]').exists()).toBe(false)
        view.unmount()
    }
    const angelic = describeConstellationEffectChance('prayer.revive_angelic', all)
    expect(angelic.formulas).toContain('30')
    expect(angelic.formulas.join(' ')).not.toContain('10 × E')
    const combined = describeConstellationEffectChance('prayer.root', all)
    expect(combined.formulas).toContain('min(95, B + 10 × E + 10 × M + 5 × S)')
    expect(combined.formulas).toContain('P × A / 100')
    const view = mount(ConstellationPrayerCalculator, {
        props: { nodeId: 'prayer.revive_angelic', enabledStarIds: all },
    })
    expect(view.get('summary').text()).toBe('Ангельское воскрешение: результат')
    expect(view.find('[data-testid="debug-prayer-mood"]').exists()).toBe(false)
    await view.setProps({ nodeId: 'prayer.root' })
    expect(view.get('[data-metric="Общий шанс Ангельского воскрешения"] dd').text()).toBe('24%')
    view.unmount()
})
