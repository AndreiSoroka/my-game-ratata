import type { DeityId } from '@my-game-ratata/contracts'

import { drawEffectGraphic, type EffectShape } from '../runtime/effectGraphics'

export type EffectSurface = 'grass' | 'stone' | 'room'
const surfaces: Record<EffectSurface, { ground: string; detail: string }> = {
    grass: { ground: '#718f56', detail: '#819e60' },
    stone: { ground: '#d1cbb5', detail: '#b8b19c' },
    room: { ground: '#30342e', detail: '#3d4138' },
}

/** The same draw functions as the cached in-world graphics, enlarged without smoothing. */
export function effectPreview(
    deity: DeityId,
    states: { kind: EffectShape; label: string }[],
    surface: EffectSurface = 'grass'
): HTMLElement {
    const panel = document.createElement('section')
    panel.className = 'rpg-panel'
    Object.assign(panel.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '20px',
        width: 'fit-content',
    })
    for (const state of states) {
        const figure = document.createElement('figure')
        figure.style.margin = '0'
        figure.style.textAlign = 'center'
        const canvas = document.createElement('canvas')
        canvas.width = 112
        canvas.height = 112
        canvas.style.width = '168px'
        canvas.style.height = '168px'
        canvas.style.imageRendering = 'pixelated'
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', state.label)
        const ctx = canvas.getContext('2d')
        if (ctx) {
            drawSurface(ctx, surface)
            ctx.translate(56, 56)
            drawEffectGraphic(ctx, state.kind, deity, 0.7)
        }
        const label = document.createElement('figcaption')
        label.textContent = state.label
        figure.append(canvas, label)
        panel.append(figure)
    }
    return panel
}

function drawSurface(ctx: CanvasRenderingContext2D, surface: EffectSurface): void {
    const colors = surfaces[surface]
    ctx.fillStyle = colors.ground
    ctx.fillRect(0, 0, 112, 112)
    ctx.fillStyle = colors.detail
    for (let x = 0; x < 112; x += 16) {
        for (let y = 0; y < 112; y += 16) {
            if (surface === 'grass') ctx.fillRect(x + (y % 3) * 3, y + 5, 2, 3)
            else {
                ctx.fillRect(x, y, 16, 1)
                ctx.fillRect(x, y, 1, 16)
            }
        }
    }
}
