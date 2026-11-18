import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import GameFrame from './GameFrame.vue'
import GameResourceBar from './GameResourceBar.vue'
import GameRibbon from './GameRibbon.vue'

it('keeps parchment decoration hidden from accessibility and leaves the default skin explicit', async () => {
    const frame = mount(GameFrame)
    expect(frame.attributes('aria-hidden')).toBe('true')
    expect(frame.classes()).not.toContain('game-frame--parchment')
    await frame.setProps({ skin: 'parchment' })
    expect(frame.classes()).toContain('game-frame--parchment')
    expect(frame.attributes('aria-hidden')).toBe('true')
    frame.unmount()
})

it('passes ribbon content and native attributes without adding accessible decoration', () => {
    const ribbon = mount(GameRibbon, {
        attrs: { 'aria-label': 'Имя героя' },
        slots: { default: '<h2>Астрия Янтарь</h2><span role="img" aria-label="Искра">✧</span>' },
    })
    expect(ribbon.element.tagName).toBe('DIV')
    expect(ribbon.attributes('aria-label')).toBe('Имя героя')
    expect(ribbon.get('h2').text()).toBe('Астрия Янтарь')
    expect(ribbon.findAll('[role="img"]')).toHaveLength(1)
    expect(ribbon.find('[aria-hidden="true"]').exists()).toBe(false)
    ribbon.unmount()
})

it('projects percent resources as progress values without inventing exact resource numbers', async () => {
    const bar = mount(GameResourceBar, {
        props: { value: { kind: 'percent', percent: 37 }, kind: 'hp' },
        attrs: { 'aria-label': 'Health', 'data-resource': 'hp' },
    })
    expect(bar.element.tagName).toBe('SPAN')
    expect(bar.attributes('role')).toBe('progressbar')
    expect(bar.attributes('aria-label')).toBe('Health')
    expect(bar.attributes('data-resource')).toBe('hp')
    expect(bar.attributes('aria-valuenow')).toBe('37')
    expect(bar.attributes('aria-valuetext')).toBeUndefined()
    expect(bar.text()).toBe('')
    expect(bar.get('.game-resource-bar__fill').attributes('style')).toContain('width: 37%')
    await bar.setProps({ value: { kind: 'percent', percent: 0 } })
    expect(bar.get('.game-resource-bar__fill').attributes('style')).toContain('width: 0%')
    expect(bar.attributes('aria-valuenow')).toBe('0')
    bar.unmount()
})

it('shows authorized rounded numbers and bounds exact resource fills', async () => {
    const bar = mount(GameResourceBar, {
        props: { value: { kind: 'exact', current: 17.8704, max: 30 }, kind: 'mana' },
        attrs: { 'aria-label': 'Mana' },
    })
    expect(Number(bar.attributes('aria-valuenow'))).toBeCloseTo((17.8704 / 30) * 100)
    expect(bar.attributes('aria-valuetext')).toBe('18/30')
    expect(bar.get('.game-resource-bar__text').text()).toBe('18/30')
    expect(bar.get('.game-resource-bar__text').attributes('aria-hidden')).toBe('true')
    await bar.setProps({ value: { kind: 'exact', current: 0, max: 0 } })
    expect(bar.attributes('aria-valuenow')).toBe('0')
    expect(bar.get('.game-resource-bar__text').text()).toBe('0/0')
    await bar.setProps({ value: { kind: 'exact', current: 12, max: 10 } })
    expect(bar.attributes('aria-valuenow')).toBe('100')
    expect(bar.get('.game-resource-bar__text').text()).toBe('12/10')
    bar.unmount()
})
