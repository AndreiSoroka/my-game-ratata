import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ConstellationStarCard from '../ui/ConstellationStarCard.vue'
import ConstellationDebugChance from './ConstellationDebugChance.vue'
import { buildConstellationDebugSnapshot } from './constellationDebugData'
import { describeConstellationEffectChance } from './constellationEffectChance'

it('keeps every authored formula available in a closed disclosure for all 77 stars', () => {
    const sky = buildConstellationDebugSnapshot({ heroClass: 'cleric', seed: 'chance-ui-test' })
    for (const node of sky.nodes) {
        const chance = describeConstellationEffectChance(node.id)
        const view = mount(ConstellationDebugChance, { props: { nodeId: node.id } })
        expect(view.get('[data-testid="debug-effect-chance"] > summary').text()).toBe(
            'Шанс срабатывания эффекта'
        )
        const formulas = view.findAll('[data-testid="debug-effect-formula"]')
        expect(formulas).toHaveLength(chance.formulaDetails!.length)
        expect(formulas.length).toBeGreaterThan(0)
        for (const [index, formula] of formulas.entries()) {
            const detail = chance.formulaDetails![index]!
            expect(formula.get('h3').text()).toBe(detail.label)
            expect(formula.get('code').text()).toBe(detail.expression)
            expect(formula.get('code').text()).not.toMatch(/[А-Яа-яЁё]/)
            expect(formula.element.closest('details')?.hasAttribute('open')).toBe(false)
            expect(formula.findAll('dt').map((entry) => entry.text())).toEqual(
                detail.variables.map((entry) => entry.symbol)
            )
            expect(formula.findAll('dd').map((entry) => entry.text())).toEqual(
                detail.variables.map((entry) => entry.description)
            )
            for (const legend of formula.findAll('dl'))
                expect(legend.element.closest('details')?.hasAttribute('open')).toBe(false)
        }
        expect(view.get('[data-testid="debug-effect-chance-summary"]').text()).toBe(chance.summary)
        view.unmount()
    }
})
it.each([
    ['prayer.root', /55\s*%/],
    ['prayer.revive', /55/],
    ['blade.critical', /min\s*\(\s*95/],
    ['shadow.luck1', /17[,.]4\s*%/],
    ['blade.damage1', /100\s*%/],
])('shows effect probabilities and examples for %s', (nodeId, expected) => {
    const view = mount(ConstellationDebugChance, { props: { nodeId: String(nodeId) } })
    expect(view.text()).toMatch(expected)
    expect(view.findAll('table tr')).toHaveLength(
        describeConstellationEffectChance(String(nodeId)).examples.length
    )
    view.unmount()
})
it('keeps probability explanations out of the ordinary spell card', () => {
    const node = buildConstellationDebugSnapshot({
        heroClass: 'cleric',
        seed: 'card-privacy',
    }).nodes.find((node) => node.id === 'prayer.revive')!
    const view = mount(ConstellationStarCard, { props: { node } })
    expect(view.text()).not.toContain('Шанс срабатывания эффекта')
    expect(view.text()).not.toContain('Повышают шанс открытия')
    expect(view.find('table').exists()).toBe(false)
    view.unmount()
})
