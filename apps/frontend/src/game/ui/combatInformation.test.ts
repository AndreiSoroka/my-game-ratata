import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { graveFixture } from '../testing/graveFixture'
import { nextTarget, relation } from './combatTargeting'
import SelectedTargetPanel from './SelectedTargetPanel.vue'

it('shows a foreign health bar without numeric text and respects exact health when received', async () => {
    const player = characterFixture('hero')
    const target = characterFixture('enemy', { health: { kind: 'percent', percent: 37 } })
    const view = mount(SelectedTargetPanel, { props: { player, target, serverTime: 0 } })
    expect(view.get('progress').attributes('value')).toBe('37')
    expect(view.text()).not.toContain('37')
    await view.setProps({
        target: { ...target, health: { kind: 'exact', current: 8.870400000000018, max: 24 } },
    })
    expect(view.text()).toContain('9/24')
    view.unmount()
})
it('selects the peaceful training construct with T without changing its social relation or showing HP', () => {
    const player = characterFixture('hero')
    const target = characterFixture('dummy', {
        trainingTarget: { areaId: 'yard' },
        creatureType: 'construct',
    })
    expect(relation(target, player)).toBe('friendly')
    expect(nextTarget([player, target], player, undefined, false)).toBe(target.id)
    expect(nextTarget([player, target], player, undefined, true)).toBeUndefined()
    const view = mount(SelectedTargetPanel, { props: { player, target, serverTime: 0 } })
    expect(view.find('progress').exists()).toBe(false)
    expect(view.text()).toContain('Тренировочная цель')
    view.unmount()
})
it('uses the same privacy presentation for destructible combat targets', () => {
    const view = mount(SelectedTargetPanel, {
        props: {
            player: characterFixture('hero'),
            grave: graveFixture({ health: { kind: 'percent', percent: 99 } }),
            serverTime: 0,
        },
    })
    expect(view.get('progress').attributes('value')).toBe('99')
    expect(view.text()).not.toContain('HP')
    expect(view.text()).not.toContain('99')
    view.unmount()
})
