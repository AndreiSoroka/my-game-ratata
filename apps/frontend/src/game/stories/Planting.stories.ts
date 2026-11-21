import '../ui/rpgControls.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import PlantingHint from '../ui/PlantingHint.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/PlantingHint' } satisfies Meta
export default meta
type Story = StoryObj
const anchor = { x: 30, y: 150, width: 390, height: 520 }
export const Checking: Story = {
    render: () =>
        renderVueStory(PlantingHint, {
            anchor,
            available: false,
            approaching: false,
            status: 'Проверяем участок…',
        }),
}
export const Available: Story = {
    render: () =>
        renderVueStory(PlantingHint, {
            anchor,
            available: true,
            approaching: false,
            status: 'Свободный участок · 5 EN',
        }),
}
export const Blocked: Story = {
    render: () =>
        renderVueStory(PlantingHint, {
            anchor,
            available: false,
            approaching: false,
            status: 'Проход должен оставаться свободным',
        }),
}
export const Approaching: Story = {
    render: () =>
        renderVueStory(PlantingHint, {
            anchor,
            available: true,
            approaching: true,
            status: 'Подходим к участку… · WASD / Esc — отменить',
        }),
}
