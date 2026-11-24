import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import ConstellationDebug from './ConstellationDebug.vue'

afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
})

it('shows the full catalogue without a character and keeps selected details when search changes', async () => {
    const view = mount(ConstellationDebug, { props: { syncUrl: false } })
    expect(view.get('h1').text()).toBe('Атлас созвездий · Отладка')
    expect(view.get('a[href="/"]').text()).toBe('В игру')
    expect(view.get('[data-testid="debug-seed"]').attributes('maxlength')).toBe('128')
    expect(view.findAll('[data-star-id]')).toHaveLength(fullConstellationCatalog.length)
    await view.get('[data-testid="debug-search"]').setValue('prayer.revive')
    expect(view.findAll('[data-star-id]')).toHaveLength(
        fullConstellationCatalog.filter((node) => node.id.startsWith('prayer.revive')).length
    )
    await view.get('[data-star-id="prayer.revive"]').trigger('click')
    expect(view.get('[data-testid="selected-star-card"] h3').text()).toBe('Воскрешение')
    expect(view.get('[data-testid="selected-star-card"]').text()).toContain('Пассивный навык')
    expect(view.get('[data-testid="debug-effect-chance"] > summary').text()).toBe(
        'Шанс срабатывания эффекта'
    )
    expect(view.get('[data-testid="debug-effect-chance-formulas"]').text()).toContain('55')
    expect(view.get('[data-testid="selected-star-card"]').text()).not.toContain(
        'Шанс срабатывания эффекта'
    )
    expect(view.get('[data-testid="debug-unlock-conditions"]').text()).toContain('Клерик')
    const [x, y, width, height] = view
        .get('.constellation-map__sky')
        .attributes('viewBox')!
        .split(' ')
        .map(Number)
    const selected = view
        .get('[data-node-id="prayer.revive"]')
        .attributes('transform')!
        .match(/[-\d.]+/g)!
        .map(Number)
    expect(selected[0]! - x!).toBeGreaterThan(0)
    expect(x! + width! - selected[0]!).toBeGreaterThan(0)
    expect(selected[1]! - y!).toBeGreaterThan(0)
    expect(y! + height! - selected[1]!).toBeGreaterThan(0)
    await view.get('[data-testid="debug-search"]').setValue('звезда без совпадений')
    expect(view.findAll('[data-star-id]')).toHaveLength(0)
    expect(view.get('[data-testid="selected-star-card"] h3').text()).toBe('Воскрешение')
    expect(view.get('[data-testid="debug-effect-chance-formulas"]').text()).toContain('55')
    expect(view.get('[data-testid="debug-unlock-conditions"]').text()).toContain('Клерик')
    expect(view.emitted('command')).toBeUndefined()
    view.unmount()
})
it('loads and updates replayable class/seed URL without navigating away', async () => {
    window.history.replaceState(
        null,
        '',
        '/?debug=constellations&class=ranger&seed=URL-seed&keep=1#atlas'
    )
    const view = mount(ConstellationDebug)
    expect(view.get('[data-testid="debug-seed"]').element).toHaveProperty('value', 'URL-seed')
    expect(view.get('[data-testid="debug-class"]').element).toHaveProperty('value', 'ranger')
    expect(view.get('[data-testid="selected-star-card"] h3').text()).toBe('Быстрый выстрел')
    await view.get('[data-testid="debug-seed"]').setValue(' next-seed ')
    await view.get('form').trigger('submit')
    expect(new URL(window.location.href).searchParams.get('seed')).toBe('next-seed')
    expect(window.location.hash).toBe('#atlas')
    expect(new URL(window.location.href).searchParams.get('keep')).toBe('1')
    await view.get('[data-testid="debug-class"]').setValue('vanguard')
    expect(view.get('[data-testid="selected-star-card"] h3').text()).toBe('Клинок')
    expect(new URL(window.location.href).searchParams.get('class')).toBe('vanguard')
    view.unmount()
})
it('filters paths and uses cryptographic seeds for a new map', async () => {
    const random = vi
        .spyOn(window.crypto, 'randomUUID')
        .mockReturnValue('00000000-0000-4000-8000-000000000001')
    const view = mount(ConstellationDebug, { props: { syncUrl: false } })
    await view.get('[data-testid="debug-path"]').setValue('prayer_grave')
    const stars = view.findAll('[data-star-id]').map((node) => node.attributes('data-star-id'))
    expect(stars).toHaveLength(44)
    expect(stars.every((id) => id?.startsWith('prayer_grave.'))).toBe(true)
    await view.get('[data-testid="debug-regenerate"]').trigger('click')
    expect(random).toHaveBeenCalledOnce()
    expect(view.get('[data-testid="debug-seed"]').element).toHaveProperty(
        'value',
        '00000000-0000-4000-8000-000000000001'
    )
    view.unmount()
})

it('limits replayable URL seeds to the input limit', () => {
    window.history.replaceState(null, '', `/?debug=constellations&seed=${'s'.repeat(200)}`)
    const view = mount(ConstellationDebug)
    expect(view.get('[data-testid="debug-seed"]').element).toHaveProperty('value', 's'.repeat(128))
    view.unmount()
})
