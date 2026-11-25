import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../../backend/src/game/constellationNodes'
import ConstellationDebugUnlock from '../ui/ConstellationDebugUnlock.vue'
import { constellationRequirementProgress } from './constellationRequirementProgress'

it('compares the inspected minimum with current build levels below, at and above the gate', () => {
    const active = new Set(['prayer.root', 'prayer.revive'])
    expect(constellationRequirementProgress('prayer.harm1', active, 'cleric')).toEqual([
        { id: 'prayer', name: 'Угольная Мать', required: 6, current: 0, satisfied: false },
    ])
    active.add('prayer.harm')
    expect(constellationRequirementProgress('prayer.harm1', active, 'cleric')?.[0]).toMatchObject({
        required: 6,
        current: 1,
        satisfied: false,
    })
    active.add('prayer.harm1')
    active.add('prayer.harm2')
    expect(constellationRequirementProgress('prayer.harm1', active, 'cleric')?.[0]).toMatchObject({
        required: 6,
        current: 12,
        satisfied: true,
    })
})
it('shows each independent mastery requirement of a joint star', () => {
    const active = new Set(['prayer.root', 'prayer.gift1'])
    expect(constellationRequirementProgress('prayer.last_light', active, 'cleric')).toEqual([
        { id: 'prayer', name: 'Угольная Мать', required: 1, current: 1, satisfied: true },
        { id: 'life', name: 'Жизнь', required: 1, current: 0, satisfied: false },
    ])
    active.add('life.root')
    active.add('life.hp1')
    expect(
        constellationRequirementProgress('prayer.last_light', active, 'cleric')?.every(
            (requirement) => requirement.satisfied
        )
    ).toBe(true)
})
it('includes level zero for free class knowledge and does not invent unknown requirements', () => {
    const active = new Set(['prayer.root'])
    expect(constellationRequirementProgress('prayer.revive', active, 'cleric')?.[0]).toMatchObject({
        required: 0,
        current: 0,
        satisfied: true,
    })
    expect(
        constellationRequirementProgress('prayer.revive', active, 'vanguard')?.[0]
    ).toMatchObject({
        required: 5,
        current: 0,
        satisfied: false,
    })
    expect(constellationRequirementProgress('missing', active, 'cleric')).toBeUndefined()
    for (const node of fullConstellationCatalog)
        expect(constellationRequirementProgress(node.id, active, 'cleric')?.length).toBeGreaterThan(
            0
        )
    expect([...active]).toEqual(['prayer.root'])
})
it('renders required/current levels and makes the insufficient state explicit without promising eligibility', async () => {
    const view = mount(ConstellationDebugUnlock, {
        props: {
            nodeId: 'prayer.harm1',
            activeIds: new Set(['prayer.root', 'prayer.revive']),
            heroClass: 'cleric',
        },
    })
    expect(view.get('[data-required-path="prayer"]').text()).toBe(
        'Угольная Мать: требуется 6 · сейчас 0'
    )
    expect(view.get('[data-required-path="prayer"]').attributes('data-level-satisfied')).toBe(
        'false'
    )
    expect(view.get('[data-testid="debug-star-level-status"]').text()).toBe(
        'Недостаточно уровня: звезда пока не может открыться.'
    )
    await view.setProps({
        activeIds: new Set(['prayer.root', 'prayer.revive', 'prayer.harm']),
    })
    expect(view.get('[data-required-path="prayer"]').text()).toBe(
        'Угольная Мать: требуется 6 · сейчас 1'
    )
    expect(view.get('[data-testid="debug-star-level-status"]').text()).toBe(
        'Недостаточно уровня: звезда пока не может открыться.'
    )
    expect(view.get('[data-testid="debug-unlock-conditions"]').text()).toContain(
        'Все условия обязательны'
    )
    await view.setProps({ nodeId: 'missing' })
    expect(view.get('[data-testid="debug-star-minimum"]').text()).toBe(
        'Требования к звезде неизвестны.'
    )
    expect(view.find('[data-testid="debug-star-level-status"]').exists()).toBe(false)
    view.unmount()
})
