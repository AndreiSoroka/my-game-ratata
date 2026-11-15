import type { ConstellationId, HeroClass } from '@my-game-ratata/contracts'
import { type DOMWrapper, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import ConstellationBuildSummary from './ConstellationBuildSummary.vue'
import ConstellationMasterySummary from './ConstellationMasterySummary.vue'
import ConstellationPrayerCalculator from './ConstellationPrayerCalculator.vue'
import { provideConstellationDebugPanels } from './useConstellationDebugPanels'

const activeIds = new Set(['prayer.root', 'prayer.revive', 'magic.root', 'arrow.root'])
const Atlas = defineComponent({
    props: {
        path: { type: String, default: 'prayer' },
        nodeId: { type: String, default: 'prayer.root' },
        heroClass: { type: String, default: 'cleric' },
    },
    setup(props) {
        provideConstellationDebugPanels()
        return () =>
            h('div', [
                h(ConstellationMasterySummary, {
                    path: props.path as ConstellationId,
                    heroClass: props.heroClass as HeroClass,
                    activeIds,
                }),
                h(ConstellationPrayerCalculator, {
                    nodeId: props.nodeId,
                    enabledStarIds: activeIds,
                }),
                h(ConstellationBuildSummary, { path: props.path as ConstellationId, activeIds }),
            ])
    },
})
const changeOpen = async (
    details: Pick<DOMWrapper<Element>, 'element' | 'trigger'>,
    open: boolean
) => {
    ;(details.element as HTMLDetailsElement).open = open
    await details.trigger('toggle')
}

it('shares independent collapsed panel preferences across stars, classes and result kinds', async () => {
    const view = mount(Atlas)
    const mastery = () => view.get('[data-testid="debug-mastery-summary"]')
    const prayer = () => view.get('[data-testid="debug-prayer-calculator"]')
    const result = () => view.get('[data-testid="debug-build-summary"]')
    expect(mastery().attributes('open')).toBeUndefined()
    expect(prayer().attributes('open')).toBeUndefined()
    await changeOpen(mastery(), true)
    await changeOpen(prayer(), true)
    await view.get('[data-mood="wrathful"]').trigger('click')
    await view.setProps({ path: 'magic', nodeId: 'magic.root', heroClass: 'arcanist' })
    expect(mastery().attributes('open')).toBe('')
    expect(result().attributes('open')).toBe('')
    expect(result().attributes('id')).toBe('debug-build-result')
    expect(result().get('summary').text()).toBe('Результат способности')
    await changeOpen(result(), false)
    await view.setProps({ path: 'prayer', nodeId: 'prayer.revive', heroClass: 'cleric' })
    expect(mastery().attributes('open')).toBe('')
    expect(prayer().attributes('open')).toBeUndefined()
    expect(view.get('[data-mood="wrathful"]').attributes('aria-pressed')).toBe('true')
    await changeOpen(mastery(), false)
    await changeOpen(prayer(), true)
    await view.setProps({ path: 'arrow', nodeId: 'arrow.root', heroClass: 'ranger' })
    expect(mastery().attributes('open')).toBeUndefined()
    expect(result().attributes('open')).toBe('')
    view.unmount()
})
