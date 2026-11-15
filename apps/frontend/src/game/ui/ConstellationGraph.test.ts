import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { constellationFixture, fixtureStarId } from '../testing/developmentFixture'
import { developmentCharacterFixture } from '../testing/developmentFixture'
import CharacterDevelopment from './CharacterDevelopment.vue'
import ConstellationGraph from './ConstellationGraph.vue'
import { constellationLabels } from './constellationLabels'

it('keeps unknown stars generic and clickable in detailed mode and preserves fixed bounds across reveals', async () => {
    const sky = constellationFixture()
    const view = mount(ConstellationGraph, {
        props: { constellation: sky, selectedId: fixtureStarId('prayer.root') },
    })
    const initial = view.get('svg').attributes('viewBox')
    const unknown = () => view.get(`[data-node-id="${fixtureStarId('prayer.radius2')}"]`)
    expect(unknown().attributes('aria-label')).toBe('Неизвестно')
    expect(unknown().attributes('aria-hidden')).toBe('true')
    await view.get(`[data-node-id="${fixtureStarId('prayer.root')}"]`).trigger('click')
    expect(unknown().attributes('role')).toBe('button')
    await unknown().trigger('click')
    expect(view.emitted('select')?.at(-1)).toEqual([fixtureStarId('prayer.radius2')])
    const focused = view.get('svg').attributes('viewBox')
    await view.setProps({ constellation: constellationFixture(true) })
    expect(view.get('svg').attributes('viewBox')).toBe(focused)
    await view.get('[aria-label="Показать весь небосвод"]').trigger('click')
    expect(view.get('svg').attributes('viewBox')).toBe(initial)
    view.unmount()
})
it('shows one word and no knowledge or predecessor metadata for an unknown root', async () => {
    const view = mount(CharacterDevelopment, {
        props: { player: developmentCharacterFixture(), characters: [] },
    })
    await view.get(`[data-node-id="${fixtureStarId('prayer_road.root')}"]`).trigger('click')
    expect(view.get('[aria-label="Выбранная звезда"]').text()).toBe('Неизвестно')
    expect(view.find('.embedded-knowledge').exists()).toBe(false)
    view.unmount()
})
it('places full-catalogue labels without overlapping at detailed scale', () => {
    const sky = constellationFixture(true)
    const labels = constellationLabels(
        sky,
        fixtureStarId('prayer.root'),
        true,
        1.25,
        sky.layout!.regions.prayer
    )
    expect(labels.length).toBeGreaterThan(0)
    for (const [index, a] of labels.entries())
        for (const b of labels.slice(index + 1))
            expect(
                a.x + a.width <= b.x ||
                    b.x + b.width <= a.x ||
                    a.y + a.height <= b.y ||
                    b.y + b.height <= a.y
            ).toBe(true)
})

it.each(['vanguard', 'arcanist', 'cleric', 'ranger'] as const)(
    'centers %s on its immutable starting root and resets selection there',
    async (heroClass) => {
        const player = developmentCharacterFixture(heroClass)
        const sky = player.progression!.constellations!
        const center = sky.nodes.find((node) => node.id === sky.layout!.centerNodeId)!
        expect(center.x).toBe(0)
        expect(center.y).toBe(0)
        const view = mount(CharacterDevelopment, { props: { player, characters: [] } })
        expect(view.get('[aria-label="Выбранная звезда"] h3').text()).toBe(center.name)
        const box = () => view.get('svg').attributes('viewBox')!.split(' ').map(Number)
        const [x, y, width, height] = box()
        expect(x! + width! / 2).toBeCloseTo(0)
        expect(y! + height! / 2).toBeCloseTo(0)
        const other = sky.nodes.find((node) => node.parents.length === 0 && node.id !== center.id)!
        await view.get(`[data-node-id="${other.id}"]`).trigger('click')
        await view.get('[aria-label="Показать весь небосвод"]').trigger('click')
        expect(view.get('[aria-label="Выбранная звезда"] h3').text()).toBe(center.name)
        expect(box()).toEqual([x, y, width, height])
        view.unmount()
    }
)
it('preserves selected stars on reveal, then clears selection for a new identity', async () => {
    const player = developmentCharacterFixture('cleric')
    const view = mount(CharacterDevelopment, { props: { player, characters: [] } })
    await view.get(`[data-node-id="${fixtureStarId('life.root')}"]`).trigger('click')
    expect(view.get('[aria-label="Выбранная звезда"] h3').text()).toBe('Жизнь')
    const revealed = {
        ...player,
        progression: { ...player.progression!, constellations: constellationFixture(true) },
    }
    await view.setProps({ player: revealed })
    expect(view.get('[aria-label="Выбранная звезда"] h3').text()).toBe('Жизнь')
    await view.setProps({ player: { ...developmentCharacterFixture('ranger'), id: 'new-life' } })
    expect(view.get('[aria-label="Выбранная звезда"] h3').text()).toBe('Стрела')
    view.unmount()
})

it('keeps the selected root in view when its nearest branch cannot fit beside it', async () => {
    const sky = constellationFixture(true)
    const root = { ...sky.nodes.find((node) => node.id === sky.layout!.centerNodeId)!, x: 0, y: 0 }
    const child = { ...sky.nodes.find((node) => node.parents.includes(root.id))!, x: 2000, y: 0 }
    sky.nodes = [root, child]
    sky.edges = [{ from: root.id, to: child.id }]
    sky.layout!.minimumNodeSpacing = 80
    const view = mount(ConstellationGraph, { props: { constellation: sky } })
    await view.get(`[data-node-id="${root.id}"]`).trigger('click')
    const [x, y, width, height] = view.get('svg').attributes('viewBox')!.split(' ').map(Number)
    const scale = width! / 700
    expect(root.x - x!).toBeGreaterThanOrEqual(31 * scale)
    expect(x! + width! - root.x).toBeGreaterThanOrEqual(31 * scale)
    expect(root.y - y!).toBeGreaterThanOrEqual(31 * scale)
    expect(y! + height! - root.y).toBeGreaterThanOrEqual(31 * scale)
    view.unmount()
})
