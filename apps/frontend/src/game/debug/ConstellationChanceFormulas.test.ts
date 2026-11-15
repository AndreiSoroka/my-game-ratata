import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ConstellationChanceFormulas from './ConstellationChanceFormulas.vue'

it('shows labels, compact expressions and each symbol legend without collapsing them', () => {
    const view = mount(ConstellationChanceFormulas, {
        props: {
            legacy: ['obsolete verbose expression'],
            details: [
                {
                    label: 'Шанс ответа, %',
                    expression: 'min(95, B + (F − 1) × 1,5)',
                    variables: [
                        { symbol: 'B', description: 'Базовый шанс настроения, %.' },
                        { symbol: 'F', description: 'Уровень Веры от 1 до 10.' },
                    ],
                },
            ],
        },
    })
    expect(view.get('h3').text()).toBe('Шанс ответа, %')
    expect(view.get('code').text()).toBe('min(95, B + (F − 1) × 1,5)')
    expect(view.findAll('dt').map((entry) => entry.text())).toEqual(['B', 'F'])
    expect(view.findAll('dd').map((entry) => entry.text())).toEqual([
        'Базовый шанс настроения, %.',
        'Уровень Веры от 1 до 10.',
    ])
    expect(view.find('details').exists()).toBe(false)
    expect(view.text()).not.toContain('obsolete')
    view.unmount()
})
it('renders a safe legacy fallback and makes constants explicit', () => {
    const view = mount(ConstellationChanceFormulas, { props: { legacy: ['100'] } })
    expect(view.get('code').text()).toBe('100')
    expect(view.get('.formula-constant').text()).toBe('В выражении нет переменных.')
    view.unmount()
})
it('handles an unknown empty description without invented formulas', () => {
    const view = mount(ConstellationChanceFormulas, { props: { legacy: [] } })
    expect(view.find('ul').exists()).toBe(false)
    view.unmount()
})
