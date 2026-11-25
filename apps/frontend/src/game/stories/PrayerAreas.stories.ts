import '../../assets/base.css'
import '../../pages/gameplay/ui/rpgControls.css'
import './prayerAreasPreview.css'

import {
    ABILITY_DEFINITIONS,
    PRAYER_RULES,
    type PrayerActionId,
    prayerActionIds,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    prayerAreaOpacity,
    prayerAreaPulseAmplitude,
    prayerAreaPulseDurationMs,
    prayerAreaSources,
} from '../assets/prayerAreaAssets'
import { drawPrayerAreaOutline } from '../runtime/prayerAreaOutline'
import { drawEffectSurface, type EffectSurface } from './effectPreview'

const surfaces: { id: EffectSurface; label: string }[] = [
    { id: 'grass', label: 'Трава' },
    { id: 'stone', label: 'Светлый камень' },
    { id: 'room', label: 'Тёмное помещение' },
]
const sampleSize = PRAYER_RULES.radius * 2 + 16

export default { title: 'Combat/Prayer areas' } satisfies Meta

export const Default: StoryObj = {
    render: () => {
        const gallery = document.createElement('section')
        gallery.className = 'rpg-panel prayer-areas-preview'
        gallery.setAttribute('aria-label', 'Зоны молитв')
        for (const surface of surfaces) {
            const row = document.createElement('section')
            row.className = 'prayer-areas-preview__surface'
            const heading = document.createElement('h2')
            heading.textContent = surface.label
            const grid = document.createElement('div')
            grid.className = 'prayer-areas-preview__grid'
            for (const abilityId of prayerActionIds)
                grid.append(prayerSample(abilityId, surface.id))
            row.append(heading, grid)
            gallery.append(row)
        }
        return gallery
    },
}

function prayerSample(abilityId: PrayerActionId, surface: EffectSurface): HTMLElement {
    const figure = document.createElement('figure')
    const stage = document.createElement('div')
    stage.className = 'prayer-areas-preview__stage'
    const terrain = sampleCanvas((context) => drawEffectSurface(context, surface))
    const effect = document.createElement('div')
    effect.className = 'prayer-areas-preview__effect'
    effect.style.setProperty('--prayer-area-opacity', String(prayerAreaOpacity))
    effect.style.setProperty(
        '--prayer-area-opacity-min',
        String(prayerAreaOpacity - prayerAreaPulseAmplitude)
    )
    effect.style.setProperty(
        '--prayer-area-opacity-max',
        String(prayerAreaOpacity + prayerAreaPulseAmplitude)
    )
    effect.style.animationDuration = `${prayerAreaPulseDurationMs}ms`
    const sprite = document.createElement('img')
    sprite.src = prayerAreaSources[abilityId]
    sprite.alt = ''
    sprite.style.width = `${(PRAYER_RULES.radius * 2 * 100) / sampleSize}%`
    const outline = sampleCanvas((context) =>
        drawPrayerAreaOutline(context, sampleSize / 2, sampleSize / 2, PRAYER_RULES.radius)
    )
    const caption = document.createElement('figcaption')
    caption.textContent =
        abilityId === 'pray' ? 'Молитва Угольной Матери' : ABILITY_DEFINITIONS[abilityId].name
    effect.append(sprite, outline)
    stage.append(terrain, effect)
    figure.append(stage, caption)
    return figure
}

function sampleCanvas(draw: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = sampleSize
    canvas.height = sampleSize
    canvas.setAttribute('aria-hidden', 'true')
    const context = canvas.getContext('2d')
    if (context) draw(context)
    return canvas
}
