import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { h, nextTick, shallowRef } from 'vue'

import ConstellationBackground from './ConstellationBackground.vue'

const dimensions = { width: 700, height: 450 }
const origin = { x: 0, y: 0 }
const props = { dimensions, origin, unitScale: 1, zoom: 1, pan: origin, seed: 'personal-sky' }

function mountBackground() {
    const state = shallowRef(props)
    const background = mount({ render: () => h('svg', [h(ConstellationBackground, state.value)]) })
    return {
        async setProps(next: Partial<typeof props>) {
            state.value = { ...state.value, ...next }
            await nextTick()
        },
        unmount: () => background.unmount(),
        circles: () => background.findAll('defs circle').map((star) => star.element),
        layers: () =>
            background.findAll('.constellation-background__layer').map((layer) => {
                const [scale, , , , x, y] = layer
                    .attributes('patternTransform')!
                    .slice('matrix('.length, -1)
                    .trim()
                    .split(/[\s,]+/)
                    .map(Number)
                return { scale: scale!, x: x!, y: y! }
            }),
    }
}

it('zooms five depths around the viewport center without rebuilding seeded stars', async () => {
    const { setProps, unmount, circles, layers } = mountBackground()
    const overviewLayers = layers()
    const initialCircles = circles()
    const initialGeometry = initialCircles.map((star) => star.outerHTML)
    expect(overviewLayers).toHaveLength(5)
    expect(overviewLayers.every((layer) => layer.scale === 1)).toBe(true)
    expect(initialGeometry.length).toBeGreaterThan(0)

    await setProps({ origin: { x: 175, y: 112.5 }, unitScale: 0.5, zoom: 2 })
    const zoomed = layers()
    const scales = zoomed.map(({ scale, x, y }) => {
        const halfWidth = dimensions.width / 2
        const halfHeight = dimensions.height / 2
        expect(x + halfWidth * scale).toBeCloseTo(halfWidth)
        expect(y + halfHeight * scale).toBeCloseTo(halfHeight)
        return scale
    })
    expect(scales[0]).toBeGreaterThan(1)
    expect(new Set(scales).size).toBe(5)
    expect(scales.at(-1)).toBeGreaterThan(scales[0]!)

    await setProps({ origin: { x: 262.5, y: 168.75 }, unitScale: 0.25, zoom: 4 })
    layers().forEach(({ scale }, index) => expect(scale).toBeGreaterThan(scales[index]!))
    expect(circles().map((star) => star.outerHTML)).toEqual(initialGeometry)
    circles().forEach((star, index) => expect(star).toBe(initialCircles[index]))

    await setProps(props)
    expect(layers()).toEqual(overviewLayers)
    await setProps({ seed: 'different-sky' })
    expect(circles().map((star) => star.outerHTML)).not.toEqual(initialGeometry)
    await setProps({ seed: props.seed })
    expect(circles().map((star) => star.outerHTML)).toEqual(initialGeometry)
    unmount()
})

it('pans near layers further and wraps large offsets without growing the SVG', async () => {
    const { setProps, unmount, circles, layers } = mountBackground()
    const overview = layers()
    const initialCircles = circles()
    await setProps({ pan: { x: 100, y: 50 } })
    const travel = layers().map(({ scale, x, y }, index) => {
        const initial = overview[index]!
        const dx = x - initial.x
        expect(scale).toBe(initial.scale)
        expect(dx).toBeGreaterThan(0)
        expect(y - initial.y).toBeCloseTo(dx / 2)
        return dx
    })
    expect(travel.at(-1)).toBeGreaterThan(travel[0]!)

    await setProps({ pan: { x: 100_000, y: -100_000 } })
    for (const { x, y } of layers()) {
        expect(Math.abs(x)).toBeLessThan(dimensions.width)
        expect(Math.abs(y)).toBeLessThan(dimensions.height)
    }
    expect(circles()).toHaveLength(initialCircles.length)
    circles().forEach((star, index) => expect(star).toBe(initialCircles[index]))

    await setProps({ pan: origin })
    expect(layers()).toEqual(overview)
    unmount()
})
