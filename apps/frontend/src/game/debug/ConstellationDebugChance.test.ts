import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ConstellationStarCard from '../ui/ConstellationStarCard.vue'
import ConstellationDebugChance from './ConstellationDebugChance.vue'
import { buildConstellationDebugSnapshot } from './constellationDebugData'
import { describeConstellationEffectChance } from './constellationEffectChance'

it('keeps every authored formula expanded for all 77 stars', () => {
    const sky = buildConstellationDebugSnapshot({ heroClass: 'cleric', seed: 'chance-ui-test' })
    for (const node of sky.nodes) {
        const chance = describeConstellationEffectChance(node.id)
        const view = mount(ConstellationDebugChance, { props: { nodeId: node.id } })
        expect(view.get('h2').text()).toBe('Шанс срабатывания эффекта')
        const formulas = view.findAll('[data-testid="debug-effect-chance-formulas"] li')
        expect(formulas).toHaveLength(chance.formulas.length)
        expect(formulas.length).toBeGreaterThan(0)
        for (const [index, formula] of formulas.entries()) {
            expect(formula.text()).toBe(chance.formulas[index])
            expect(formula.element.closest('details')).toBeNull()
        }
        expect(view.get('[data-testid="debug-effect-chance-summary"]').text()).toBe(chance.summary)
        view.unmount()
    }
})
it.each([
    ['prayer.root', /55\s*%/],
    ['prayer.revive', /95\s*%/],
    ['blade.critical', /min\s*\(\s*95\s*%/],
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
