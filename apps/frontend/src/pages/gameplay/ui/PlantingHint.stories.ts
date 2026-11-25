import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import PlantingHint from './PlantingHint.vue'

type Args = InstanceType<typeof PlantingHint>['$props']
const meta = {
    title: 'Pages/Gameplay/PlantingHint',
    args: {
        anchor: { x: 30, y: 150, width: 390, height: 520 },
        available: true,
        approaching: false,
        status: 'Свободный участок · 5 EN',
    },
    argTypes: {
        anchor: { control: 'object' },
        available: { control: 'boolean' },
        approaching: { control: 'boolean' },
        status: { control: 'text' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = { render: (args) => renderVueStory(PlantingHint, args) }
export const Checking: Story = {
    ...Default,
    args: { available: false, status: 'Проверяем участок…' },
}
export const Blocked: Story = {
    ...Default,
    args: { available: false, status: 'Проход должен оставаться свободным' },
}
export const Approaching: Story = {
    ...Default,
    args: { approaching: true, status: 'Подходим к участку… · WASD / Esc — отменить' },
}
