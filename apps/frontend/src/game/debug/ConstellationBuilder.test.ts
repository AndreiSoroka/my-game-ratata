import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import ConstellationGraph from '../ui/ConstellationGraph.vue'
import { enableAllConstellationStars } from './constellationBuild'
import ConstellationBuildSummary from './ConstellationBuildSummary.vue'
import ConstellationDebug from './ConstellationDebug.vue'
import ConstellationPrayerCalculator from './ConstellationPrayerCalculator.vue'

it('starts with Prayer and Resurrection and changes ownership only with Space', async () => {
    const view = mount(ConstellationDebug, { props: { syncUrl: false } })
    const graph = view.getComponent(ConstellationGraph)
    expect(view.get('[data-testid="debug-build-count"]').text()).toContain('2')
    expect(graph.props('enabledStarIds')?.size).toBe(2)
    expect(graph.props('enabledStarIds')?.has('prayer.root')).toBe(true)
    expect(view.get('[data-testid="selected-star-card"] ul').text()).toMatch(/воскреш/i)
    graph.vm.focusNode('prayer.harm')
    await view.vm.$nextTick()
    expect(graph.props('enabledStarIds')?.size).toBe(2)
    await view.get('[data-node-id="prayer.harm"]').trigger('click')
    expect(graph.props('enabledStarIds')?.has('prayer.harm')).toBe(false)
    const panel = view.get('.debug-selected-details').element
    panel.scrollTop = 80
    await view.get('[data-node-id="prayer.harm"]').trigger('keydown', { code: 'Space' })
    expect(graph.props('enabledStarIds')?.has('prayer.harm')).toBe(true)
    expect(panel.scrollTop).toBe(80)
    await view.get('[data-node-id="prayer.root"]').trigger('click')
    expect(graph.props('enabledStarIds')?.size).toBe(3)
    expect(view.get('[data-testid="debug-prayer-build-effects"]').text()).toContain('Кара')
    expect(view.get('[data-testid="selected-star-card"] ul').text()).toMatch(/урон нежити/i)
    expect(view.find('[data-metric="Кара (если изучена)"]').exists()).toBe(false)
    expect(view.find('[data-testid="debug-prayer-faith"]').exists()).toBe(false)
    expect(view.get('[data-testid="debug-mastery-level"]').text()).toBe('1')
    view.unmount()
})
it('names missing prerequisites, provides inspect-only links and briefly reports cascades outside the card', async () => {
    const view = mount(ConstellationDebug, { props: { syncUrl: false } })
    const toggle = async (id: string) => view.get(`[data-star-toggle="${id}"]`).trigger('click')
    await toggle('prayer.harm')
    await toggle('prayer.harm2')
    expect(view.get('[data-testid="debug-build-blocked"]').text()).toContain(
        'Нужно открыть «Суровый ответ»'
    )
    expect(view.getComponent(ConstellationGraph).props('enabledStarIds')?.size).toBe(3)
    await view.get('[data-find-parent="prayer.harm1"]').trigger('click')
    expect(view.get('[data-testid="selected-star-card"] h3').text()).toBe('Суровый ответ')
    expect(view.getComponent(ConstellationGraph).props('enabledStarIds')?.size).toBe(3)
    await view.get('[data-testid="selected-star-toggle"]').trigger('click')
    await toggle('prayer.harm2')
    await view.get('[data-star-id="prayer.root"]').trigger('click')
    expect(view.get('[data-build-metric="Множитель кары"] dd').text()).toBe('×5,6')
    expect(view.get('[data-build-metric="Урон кары"] dd').text()).toContain('34 HP')
    await toggle('prayer.harm')
    const cascade = view.get('[data-testid="debug-build-cascade"]')
    expect(
        view.get('.debug-selected-details').find('[data-testid="debug-build-feedback"]').exists()
    ).toBe(false)
    expect(cascade.text()).toContain('Отключено звёзд: 3')
    expect(cascade.text()).toContain('Кара')
    expect(cascade.text()).toContain('Суровый ответ')
    expect(cascade.text()).toContain('Гнев небес')
    await view.get('[data-star-id="prayer.root"]').trigger('click')
    expect(view.get('[data-testid="debug-build-cascade"]').text()).toContain('Суровый ответ')
    expect(view.find('[data-build-metric="Урон кары"]').exists()).toBe(false)
    expect(view.get('[data-testid="selected-star-card"] ul').text()).not.toMatch(/урон нежити/i)
    view.unmount()
})
it('keeps selected stars and example inputs through class and seed changes', async () => {
    const view = mount(ConstellationDebug, { props: { syncUrl: false } })
    await view.get('[data-testid="debug-build-all"]').trigger('click')
    expect(view.getComponent(ConstellationGraph).props('enabledStarIds')?.size).toBe(
        fullConstellationCatalog.length
    )
    await view.get('[data-testid="debug-prayer-mood"] [data-mood="benevolent"]').trigger('click')
    await view.get('[data-testid="debug-last-light"]').setValue(true)
    await view.get('[data-testid="debug-class"]').setValue('vanguard')
    await view.get('[data-testid="debug-seed"]').setValue('preserve-build')
    await view.get('form').trigger('submit')
    expect(view.getComponent(ConstellationGraph).props('enabledStarIds')?.size).toBe(
        fullConstellationCatalog.length
    )
    await view.get('[data-testid="debug-class"]').setValue('cleric')
    expect(
        view
            .get('[data-testid="debug-prayer-mood"] [data-mood="benevolent"]')
            .attributes('aria-pressed')
    ).toBe('true')
    expect(view.get('[data-testid="debug-last-light"]').element).toHaveProperty('checked', true)
    await view.get('[data-testid="debug-build-reset"]').trigger('click')
    expect(view.getComponent(ConstellationGraph).props('enabledStarIds')?.size).toBe(2)
    await view.get('[data-testid="debug-build-clear"]').trigger('click')
    expect(view.get('[data-testid="debug-prayer-unavailable"]').text()).toContain('не включена')
    expect(view.get('[data-testid="selected-star-card"] h3').text()).toBe('Молитва')
    view.unmount()
})
it('calculates the whole prayer set and applies only learned bonuses plus the complete Last Light condition', async () => {
    const full = enableAllConstellationStars()
    const view = mount(ConstellationPrayerCalculator, {
        props: { nodeId: 'prayer.root', enabledStarIds: full },
    })
    const metric = (label: string) => view.get(`[data-build-metric="${label}"] dd`).text()
    expect(metric('Лечение')).toBe('30 HP')
    await view.get('[data-testid="debug-last-light"]').setValue(true)
    expect(metric('Лечение')).toBe('90 HP')
    expect(metric('Множитель лечения')).toBe('×14,95')
    const noLastLight = new Set(full)
    noLastLight.delete('prayer.last_light')
    await view.setProps({ enabledStarIds: noLastLight })
    expect(view.find('[data-testid="debug-last-light"]').exists()).toBe(false)
    expect(metric('Лечение')).toBe('30 HP')
    view.unmount()
})
it('shows cross-path runic totals only while its example charge is active', async () => {
    const full = enableAllConstellationStars()
    const view = mount(ConstellationBuildSummary, {
        props: { nodeId: 'arrow.root', activeIds: full },
    })
    expect(
        view.get('[data-build-metric="Итоговый множитель урона Быстрого выстрела"] dd').text()
    ).toBe('×1,25')
    await view.get('[data-testid="debug-runic-charged"]').setValue(true)
    expect(
        view.get('[data-build-metric="Итоговый множитель урона Быстрого выстрела"] dd').text()
    ).toBe('×1,375')
    await view.setProps({ nodeId: 'magic.runic_echo' })
    expect(view.get('[data-build-metric="Усиление следующего Быстрого выстрела"] dd').text()).toBe(
        '+10%'
    )
    expect(view.find('[data-testid="debug-runic-charged"]').exists()).toBe(false)
    await view.setProps({ nodeId: 'arrow.root' })
    expect(
        view.get('[data-build-metric="Итоговый множитель урона Быстрого выстрела"] dd').text()
    ).toBe('×1,375')
    const noEcho = new Set(full)
    noEcho.delete('magic.runic_echo')
    await view.setProps({ activeIds: noEcho })
    expect(view.find('[data-testid="debug-runic-charged"]').exists()).toBe(false)
    expect(
        view.get('[data-build-metric="Итоговый множитель урона Быстрого выстрела"] dd').text()
    ).toBe('×1,25')
    view.unmount()
})
