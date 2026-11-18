import { expect, it, vi } from 'vitest'

import { drawAttackGeometry } from './attackGeometryDrawing'

function context() {
    return Object.fromEntries(
        ['beginPath', 'rect', 'arc', 'moveTo', 'closePath', 'fill'].map((name) => [
            name,
            vi.fn<(...args: unknown[]) => void>(),
        ])
    )
}
it('draws the authoritative circular and directional sector footprints without changing their radius', () => {
    const circle = context()
    drawAttackGeometry(circle as unknown as CanvasRenderingContext2D, {
        kind: 'circle',
        center: { x: 20, y: 30 },
        radius: 48,
    })
    expect(circle.arc).toHaveBeenCalledWith(20, 30, 48, 0, Math.PI * 2)
    const sector = context()
    drawAttackGeometry(sector as unknown as CanvasRenderingContext2D, {
        kind: 'sector',
        center: { x: 10, y: 12 },
        radius: 24,
        direction: { x: 0, y: 1 },
        angleDegrees: 120,
    })
    expect(sector.moveTo).toHaveBeenCalledWith(10, 12)
    expect(sector.arc).toHaveBeenCalledWith(
        10,
        12,
        24,
        expect.closeTo(Math.PI / 6, 12),
        expect.closeTo((5 * Math.PI) / 6, 12)
    )
    expect(sector.closePath).toHaveBeenCalledOnce()
    expect(sector.fill).toHaveBeenCalledOnce()
})
it('keeps compound ordinary geometry as the supplied rectangles', () => {
    const ctx = context()
    drawAttackGeometry(ctx as unknown as CanvasRenderingContext2D, {
        kind: 'rectangles',
        zones: [{ ownerId: 'actor', minX: 10, minY: 20, maxX: 26, maxY: 52 }],
    })
    expect(ctx.rect).toHaveBeenCalledWith(10, 20, 16, 32)
    expect(ctx.arc).not.toHaveBeenCalled()
})
