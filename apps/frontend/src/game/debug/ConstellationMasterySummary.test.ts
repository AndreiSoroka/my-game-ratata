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
    expect(view.get('[data-testid="debug-mastery-level"]').text()).toBe('5')
    expect(view.get('[data-testid="debug-mastery-total"]').text()).toMatch(/1\s200 XP/)
    expect(view.get('[data-testid="debug-mastery-next"]').text()).toBe('27 действий · 0 / 800 XP')
    expect(view.find('[data-testid="debug-mastery-actions"]').exists()).toBe(false)
    expect(view.text()).toContain('База 30 XP · конфликт 0%')
    expect(view.get('[data-testid="debug-mastery-rate"]').text()).toBe('30 XP')
    expect(view.get('[data-testid="debug-mastery-pending"]').text()).toContain(
        'Не распределено открытий в плане: 2'
    )
    await view.get('[data-testid="debug-mastery-reward"]').setValue('prayerHarm')
    expect(view.get('[data-testid="debug-mastery-next"]').text()).toBe('12 действий · 0 / 800 XP')
    view.unmount()
})
it('shows conflict as an explicit loss, rounds display to2decimals and limits rewards to learned effects', () => {
    const mixed = new Set([...active, 'magic.root', 'magic.fireball', 'magic.greater_fireball'])
    const view = mount(ConstellationMasterySummary, {
        props: { path: 'prayer', activeIds: mixed, heroClass: 'cleric' },
    })
    expect(view.text()).toContain('База 30 XP · конфликт −')
    expect(view.get('[data-testid="debug-mastery-rate"]').text()).not.toMatch(/,\d{3}/)
    view.unmount()
    const base = mount(ConstellationMasterySummary, {
        props: { path: 'prayer', activeIds: new Set(['prayer.root']), heroClass: 'cleric' },
    })
    expect(base.find('option[value="prayerHarm"]').exists()).toBe(false)
    expect(base.find('option[value="resurrection"]').exists()).toBe(false)
    base.unmount()
})
