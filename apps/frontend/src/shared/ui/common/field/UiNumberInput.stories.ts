import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { defineComponent, h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import UiNumberInput from './UiNumberInput.vue'

type Args = { modelValue: number; label: string; min: number; max: number; decimals: number }
const meta = {
    title: 'Shared/Common/UiNumberInput',
    parameters: { backgrounds: { disable: false } },
    args: { modelValue: 5, label: 'Количество', min: 1, max: 10, decimals: 0 },
    argTypes: {
        modelValue: { control: 'number' },
        label: { control: 'text' },
        min: { control: 'number' },
        max: { control: 'number' },
        decimals: { control: { type: 'number', min: 0, max: 3, step: 1 } },
    },
    render(args) {
        const host = renderVueStory(
            defineComponent({
                setup() {
                    const modelValue = ref(args.modelValue)
                    return () =>
                        h(UiNumberInput, {
                            ...args,
                            modelValue: modelValue.value,
                            'onUpdate:modelValue': (value) => (modelValue.value = value),
                        })
                },
            }),
            {}
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '260px'
        return host
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}

export const DecimalSteps: Story = { args: { modelValue: 0.5, min: 0, max: 1, decimals: 1 } }
