import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ConstellationMasterySummary from './ConstellationMasterySummary.vue'

const active = new Set([
    'prayer.root',
    'prayer.revive',
    'prayer.harm',
    'prayer.harm1',
    'prayer.harm2',
])
it('shows current planned level and exact next-level actions without a whole-history estimate', async () => {
    const view = mount(ConstellationMasterySummary, {
        props: { path: 'prayer', activeIds: active, heroClass: 'cleric' },
    })
    expect(view.get('details').attributes('open')).toBeUndefined()
    expect(view.get('summary').text()).toBe('Развитие созвездия')
    expect(view.get('[data-testid="debug-mastery-level"]').text()).toBe('12')
    expect(view.get('[data-testid="debug-mastery-total"]').text()).toBe('19\u00a0067,49 XP')
    expect(view.get('[data-testid="debug-mastery-next"]').text()).toBe(
        '131 действий · 0 / 4\u00a0687,22 XP'
    )
    expect(view.find('[data-testid="debug-mastery-actions"]').exists()).toBe(false)
    expect(view.text()).toContain('База 30 XP · прошлое +20% · конфликт 0%')
    expect(view.get('[data-testid="debug-mastery-rate"]').text()).toBe('36 XP')
    expect(view.get('[data-testid="debug-mastery-pending"]').text()).toContain('9')
    await view.get('[data-testid="debug-mastery-reward"]').setValue('prayerHarm')
    expect(view.get('[data-testid="debug-mastery-next"]').text()).toBe(
        '56 действий · 0 / 4\u00a0687,22 XP'
    )
    view.unmount()
})
it('shows conflict as an explicit loss, rounds display to2decimals and limits rewards to learned effects', () => {
    const mixed = new Set([...active, 'magic.root', 'magic.fireball', 'magic.greater_fireball'])
    const view = mount(ConstellationMasterySummary, {
        props: { path: 'prayer', activeIds: mixed, heroClass: 'cleric' },
    })
    expect(view.text()).toContain('База 30 XP · прошлое +20% · конфликт −')
    expect(view.get('[data-testid="debug-mastery-rate"]').text()).not.toMatch(/,\d{3}/)
    view.unmount()
    const base = mount(ConstellationMasterySummary, {
        props: { path: 'prayer', activeIds: new Set(['prayer.root']), heroClass: 'cleric' },
    })
    expect(base.find('option[value="prayerHarm"]').exists()).toBe(false)
    expect(base.find('option[value="resurrection"]').exists()).toBe(false)
    base.unmount()
})

it.each([
    ['vanguard', 'blade', '18 XP'],
    ['ranger', 'arrow', '24 XP'],
    ['arcanist', 'magic', '30 XP'],
    ['cleric', 'prayer', '36 XP'],
    ['cleric', 'prayer_road', '36 XP'],
    ['cleric', 'prayer_lantern', '36 XP'],
    ['cleric', 'prayer_grave', '36 XP'],
] as const)(
    'uses the shared %s experience bonus for %s in atlas calculations',
    (heroClass, path, expected) => {
        const view = mount(ConstellationMasterySummary, {
            props: { path, activeIds: new Set([`${path}.root`]), heroClass },
        })
        expect(view.get('[data-testid="debug-mastery-rate"]').text()).toBe(expected)
        expect(view.text()).toContain('прошлое +20%')
        expect(view.text()).toContain('конфликт 0%')
        view.unmount()
    }
)

it('keeps the background bonus separate from conflict and does not boost an unrelated school', () => {
    const view = mount(ConstellationMasterySummary, {
        props: { path: 'prayer', activeIds: new Set(['prayer.root']), heroClass: 'ranger' },
    })
    expect(view.get('[data-testid="debug-mastery-rate"]').text()).toBe('30 XP')
    expect(view.text()).toContain('прошлое +0%')
    view.unmount()
})
