import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import UiNumberInput from './UiNumberInput.vue'

type Args = { modelValue: number; label: string; min: number; max: number }
const meta = {
    title: 'Shared/Common/UiNumberInput',
    parameters: { backgrounds: { disable: false } },
    args: { modelValue: 5, label: 'Количество', min: 1, max: 10 },
    render: (args) => renderVueStory(UiNumberInput, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
