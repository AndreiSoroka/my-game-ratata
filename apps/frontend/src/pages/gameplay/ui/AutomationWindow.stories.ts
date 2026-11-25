import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { UiInput } from '@/shared/ui/common'

import AutomationWindow from './AutomationWindow.vue'

type SlotContent = 'div' | 'text' | 'example'
type Args = { title: string; defaultSlot: SlotContent }
const meta = {
    title: 'Pages/gameplay/AutomationWindow',
    parameters: { backgrounds: { disable: false } },
    args: { title: 'Настройка сценария', defaultSlot: 'text' },
    argTypes: {
        defaultSlot: {
            name: 'default slot',
            control: 'select',
            options: ['div', 'text', 'example'],
        },
    },
    render({ defaultSlot, ...props }) {
        return renderVueStory(
            () =>
                h(AutomationWindow, props, {
                    default: () =>
                        defaultSlot === 'div'
                            ? h('div', { style: 'min-height:48px;background:#98425d' })
                            : defaultSlot === 'example'
                              ? h(UiInput, {
                                    'aria-label': 'Название сценария',
                                    placeholder: 'Название сценария',
                                })
                              : 'Укажите цель и шаги, которые выполнит персонаж.',
                }),
            {}
        )
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
