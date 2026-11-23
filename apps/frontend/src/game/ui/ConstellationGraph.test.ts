import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { nextTick } from 'vue'

import { ConstellationGraph } from '@/entities/constellations'

import { constellationFixture, fixtureStarId } from '../testing/developmentFixture'
import { developmentCharacterFixture } from '../testing/developmentFixture'
import CharacterDevelopment from './CharacterDevelopment.vue'

it('keeps ordinary development selection separate from debug build activation', async () => {
    const root = fixtureStarId('prayer.root')
    const view = mount(ConstellationGraph, {
        props: { constellation: constellationFixture(true), selectedId: root },
    })
    await view.get(`[data-node-id="${root}"]`).trigger('click')
    expect(view.emitted('select')?.at(-1)).toEqual([root])
    expect(view.emitted('activate')).toBeUndefined()
    view.unmount()
})

it('dims disabled known build stars without hiding their names or descriptions', async () => {
    const sky = constellationFixture(true)
    const original = JSON.stringify(sky)
    const root = fixtureStarId('prayer.root')
    const child = fixtureStarId('prayer.radius1')
    const view = mount(ConstellationGraph, {
        props: { constellation: sky, selectedId: child, enabledStarIds: new Set([root]) },
    })
    await view.get(`[data-node-id="${root}"]`).trigger('click')
    const star = view.get(`[data-node-id="${child}"]`)
    view.vm.focusNode(child)
    await nextTick()
    expect(star.attributes('aria-label')).toBe('Дальний голос')
    expect(star.attributes('aria-pressed')).toBe('false')
    expect(star.classes()).toContain('inactive')
    await star.trigger('click')
    expect(view.emitted('activate')).toBeUndefined()
    await star.trigger('keydown', { code: 'Space' })
    expect(view.emitted('activate')?.at(-1)).toEqual([child])
    expect(star.attributes('aria-pressed')).toBe('false')
    await view.setProps({ enabledStarIds: new Set([root, child]) })
    expect(star.attributes('aria-pressed')).toBe('true')
    expect(star.classes()).not.toContain('inactive')
    expect(JSON.stringify(sky)).toBe(original)
    view.unmount()
})

it('toggles debug ownership only on non-repeated Space and keeps clicks or Enter inspect-only', async () => {
    const root = fixtureStarId('prayer.root')
    const view = mount(ConstellationGraph, {
        props: { constellation: constellationFixture(true), enabledStarIds: new Set([root]) },
    })
    view.vm.focusNode(root)
    await view.get(`[data-node-id="${root}"]`).trigger('keydown', { code: 'ArrowDown' })
    await view.get('[aria-label="Показать весь небосвод"]').trigger('click')
    expect(view.emitted('activate')).toBeUndefined()
    await view.get(`[data-node-id="${root}"]`).trigger('keydown', { code: 'Enter' })
    expect(view.emitted('activate')).toBeUndefined()
    await view.get(`[data-node-id="${root}"]`).trigger('click')
    expect(view.emitted('activate')).toBeUndefined()
    await view.get(`[data-node-id="${root}"]`).trigger('keydown', { code: 'Space' })
    expect(view.emitted('activate')).toEqual([[root]])
    await view.get(`[data-node-id="${root}"]`).trigger('keydown', {
        code: 'Space',
        repeat: true,
    })
    expect(view.emitted('activate')).toEqual([[root]])
    view.unmount()
})

it('does not activate stars after a pan made of small pointer movements or a pinch', async () => {
    const root = fixtureStarId('prayer.root')
    const view = mount(ConstellationGraph, {
        props: { constellation: constellationFixture(true), enabledStarIds: new Set([root]) },
    })
    const star = view.get(`[data-node-id="${root}"]`)
    const svg = view.get('.constellation-map__sky')
    const pointer = async (target: Element, type: string, id: number, x = 0, y = 0) => {
        const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
        Object.defineProperty(event, 'pointerId', { value: id })
        target.dispatchEvent(event)
        await nextTick()
    }
    const initial = svg.attributes('viewBox')
    await pointer(star.element, 'pointerdown', 1, 20, 20)
    for (let x = 21; x <= 30; x++) await pointer(svg.element, 'pointermove', 1, x, 20)
    await pointer(svg.element, 'pointerup', 1)
    expect(svg.attributes('viewBox')).not.toBe(initial)
    await star.trigger('click')
    expect(view.emitted('activate')).toBeUndefined()

    await pointer(star.element, 'pointerdown', 1, 20, 20)
    await pointer(svg.element, 'pointerdown', 2, 40, 20)
    await pointer(svg.element, 'pointermove', 2, 50, 20)
    await pointer(svg.element, 'pointerup', 2)
    await pointer(svg.element, 'pointerup', 1)
    await star.trigger('click')
    expect(view.emitted('activate')).toBeUndefined()

    await pointer(star.element, 'pointerdown', 1, 20, 20)
    await pointer(svg.element, 'pointerup', 1)
    await star.trigger('click')
    expect(view.emitted('activate')).toBeUndefined()
    await star.trigger('keydown', { code: 'Space' })
    expect(view.emitted('activate')).toEqual([[root]])
    view.unmount()
})

it('keeps unknown stars inert in detailed mode and preserves fixed bounds across reveals', async () => {
    const sky = constellationFixture()
    const view = mount(ConstellationGraph, {
        props: { constellation: sky, selectedId: fixtureStarId('prayer.root') },
    })
    const initial = view.get('.constellation-map__sky').attributes('viewBox')
    const unknown = () => view.get(`[data-node-id="${fixtureStarId('prayer.radius2')}"]`)
    expect(unknown().attributes('aria-label')).toBe('Неизвестно')
    expect(unknown().attributes('aria-hidden')).toBe('true')
    await view.get(`[data-node-id="${fixtureStarId('prayer.root')}"]`).trigger('click')
    expect(unknown().attributes('role')).toBeUndefined()
    expect(unknown().attributes('tabindex')).toBeUndefined()
    await unknown().trigger('click')
    expect(view.emitted('select')?.at(-1)).toEqual([fixtureStarId('prayer.root')])
    view.vm.focusNode(fixtureStarId('prayer.radius2'))
    await unknown().trigger('keydown', { code: 'Space' })
    expect(view.emitted('select')?.at(-1)).toEqual([fixtureStarId('prayer.root')])
    const focused = view.get('.constellation-map__sky').attributes('viewBox')
    await view.setProps({ constellation: constellationFixture(true) })
    expect(view.get('.constellation-map__sky').attributes('viewBox')).toBe(focused)
    await view.get('[aria-label="Показать весь небосвод"]').trigger('click')
    expect(view.get('.constellation-map__sky').attributes('viewBox')).toBe(initial)
    view.unmount()
})
it('skips unknown stars during keyboard navigation and ignores their key events', async () => {
    const sky = constellationFixture(true)
    const root = { ...sky.nodes.find((node) => node.id === sky.layout!.centerNodeId)!, x: 0, y: 0 }
    const child = sky.nodes.find((node) => node.parents.includes(root.id))!
    const unknown = { ...child, id: 'closed', x: 100, y: 0, unlocked: false, name: undefined }
    const known = { ...child, id: 'known', x: 200, y: 0 }
    sky.nodes = [root, unknown, known]
    sky.edges = []
    const view = mount(ConstellationGraph, { props: { constellation: sky, selectedId: root.id } })
    await view.get(`[data-node-id="${root.id}"]`).trigger('click')
    await view.get(`[data-node-id="${root.id}"]`).trigger('keydown', { code: 'ArrowRight' })
    expect(view.emitted('select')?.at(-1)).toEqual(['known'])
    const before = view.emitted('select')!.length
    await view.get('[data-node-id="closed"]').trigger('keydown', { code: 'Enter' })
    view.vm.focusNode('closed')
    expect(view.emitted('select')).toHaveLength(before)
    expect(view.get('[data-node-id="closed"]').attributes('role')).toBeUndefined()
    view.unmount()
})

it('ignores an unknown root and preserves the current known card', async () => {
    const view = mount(CharacterDevelopment, {
        props: { player: developmentCharacterFixture(), characters: [] },
    })
    const before = view.get('[aria-label="Выбранная звезда"]').text()
    const camera = view.get('.constellation-map__sky').attributes('viewBox')
    await view.get(`[data-node-id="${fixtureStarId('prayer_road.root')}"]`).trigger('click')
    expect(view.get('[aria-label="Выбранная звезда"]').text()).toBe(before)
    expect(view.get('.constellation-map__sky').attributes('viewBox')).toBe(camera)
    view.unmount()
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
        const box = () =>
            view.get('.constellation-map__sky').attributes('viewBox')!.split(' ').map(Number)
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
    expect(view.get('[aria-label="Выбранная звезда"] h3').text()).toBe('Быстрый выстрел')
    view.unmount()
})

it('fits the projected received path and its local route independently of other path spacing', async () => {
    const sky = constellationFixture(true)
    const root = { ...sky.nodes.find((node) => node.id === sky.layout!.centerNodeId)!, x: 0, y: 0 }
    const child = { ...sky.nodes.find((node) => node.parents.includes(root.id))!, x: 2000, y: 0 }
    sky.nodes = [root, child]
    const bend = { x: 1000, y: 600 }
    sky.edges = [{ from: root.id, to: child.id, via: [bend] }]
    sky.layout!.minimumNodeSpacing = 80
    const view = mount(ConstellationGraph, { props: { constellation: sky } })
    await view.get(`[data-node-id="${root.id}"]`).trigger('click')
    const [x, y, width, height] = view
        .get('.constellation-map__sky')
        .attributes('viewBox')!
        .split(' ')
        .map(Number)
    const scale = width! / 700
    const points = view
        .get('polyline')
        .attributes('points')!
        .split(' ')
        .map((point) => {
            const [x, y] = point.split(',').map(Number)
            return { x: x!, y: y! }
        })
    expect(points).toHaveLength(3)
    const projectedCenter = {
        x:
            (Math.min(...points.map((point) => point.x)) +
                Math.max(...points.map((point) => point.x))) /
            2,
        y:
            (Math.min(...points.map((point) => point.y)) +
                Math.max(...points.map((point) => point.y))) /
            2,
    }
    expect(Math.abs(x! + width! / 2 - projectedCenter.x)).toBeLessThan(scale)
    expect(Math.abs(y! + height! / 2 - projectedCenter.y)).toBeLessThan(scale)
    for (const point of points) {
        expect(point.x - x!).toBeGreaterThanOrEqual(35 * scale)
        expect(x! + width! - point.x).toBeGreaterThanOrEqual(35 * scale)
        expect(point.y - y!).toBeGreaterThanOrEqual(35 * scale)
        expect(y! + height! - point.y).toBeGreaterThanOrEqual(35 * scale)
    }
    const focused = view.get('.constellation-map__sky').attributes('viewBox')
    await view.setProps({
        constellation: { ...sky, layout: { ...sky.layout!, minimumNodeSpacing: 1 } },
    })
    await view.get(`[data-node-id="${root.id}"]`).trigger('click')
    expect(view.get('.constellation-map__sky').attributes('viewBox')).toBe(focused)
    view.unmount()
})

it('focuses an externally requested leaf without changing the catalogue or accepting missing IDs', async () => {
    const sky = constellationFixture(true)
    const id = fixtureStarId('prayer.revive_master')
    const node = sky.nodes.find((node) => node.id === id)!
    expect(sky.nodes.some((entry) => entry.parents.includes(id))).toBe(false)
    const before = structuredClone(sky)
    const view = mount(ConstellationGraph, { props: { constellation: sky } })
    view.vm.focusNode(id)
    await view.vm.$nextTick()
    expect(view.emitted('select')?.at(-1)).toEqual([id])
    expect(sky).toEqual(before)
    const emitted = view.emitted('select')!.length
    view.vm.focusNode('no-such-star')
    expect(view.emitted('select')).toHaveLength(emitted)
    const [x, y, width, height] = view
        .get('.constellation-map__sky')
        .attributes('viewBox')!
        .split(' ')
        .map(Number)
    expect(x! + width! / 2).toBeCloseTo(node.x)
    expect(y! + height! / 2).toBeCloseTo(node.y)
    expect(view.get(`[data-node-id="${id}"]`).attributes('role')).toBe('button')
    expect(node.x).toBeGreaterThan(x!)
    expect(node.x).toBeLessThan(x! + width!)
    expect(node.y).toBeGreaterThan(y!)
    expect(node.y).toBeLessThan(y! + height!)
    view.unmount()
})

it('marks extra mandatory links without dropping their geometry or changing ownership', () => {
    const sky = constellationFixture(true)
    const edge = sky.edges[0]!
    edge.crossLink = true
    const view = mount(ConstellationGraph, { props: { constellation: sky } })
    try {
        expect(view.findAll('polyline')).toHaveLength(sky.edges.length)
        const link = view.get('.constellation-edge--cross-link')
        expect(link.attributes('stroke-dasharray')).toBe('8 4 2 4')
        expect(link.get('title').text()).toBe('Дополнительная обязательная связь')
        expect(view.emitted('activate')).toBeUndefined()
    } finally {
        view.unmount()
    }
})
