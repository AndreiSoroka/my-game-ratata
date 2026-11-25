import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { UiButton, UiInput } from '@/shared/ui/common'

import SocialWindow from './SocialWindow.vue'

type SlotContent = 'div' | 'text' | 'example'
type Args = {
    title: string
    modal: boolean
    layout?: 'exchange' | 'quest' | 'shop'
    defaultSlot: SlotContent
    belowSlot: SlotContent
}
const slots = ['div', 'text', 'example'] satisfies SlotContent[]
const meta = {
    title: 'Pages/gameplay/SocialWindow',
    parameters: { backgrounds: { disable: false } },
    args: { title: 'Разговор с Мирой', modal: false, defaultSlot: 'text', belowSlot: 'div' },
    argTypes: {
        layout: { control: 'select', options: [undefined, 'exchange', 'quest', 'shop'] },
        defaultSlot: { name: 'default slot', control: 'select', options: slots },
        belowSlot: { name: 'below slot', control: 'select', options: slots },
    },
    render({ defaultSlot, belowSlot, ...props }) {
        return renderVueStory(
            () =>
                h(SocialWindow, props, {
                    default: () =>
                        defaultSlot === 'div'
                            ? h('div', { style: 'min-height:48px;background:#98425d' })
                            : defaultSlot === 'example'
                              ? h(UiButton, {}, () => 'Спросить о дороге')
                              : 'Мира ждёт ответа.',
                    below: () =>
                        belowSlot === 'div'
                            ? h('div', { style: 'min-height:36px;background:#354c84' })
                            : belowSlot === 'example'
                              ? h(UiInput, {
                                    'aria-label': 'Реплика',
                                    placeholder: 'Написать реплику',
                                })
                              : h('p', 'Личная беседа'),
                }),
            {}
        )
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Modal: Story = { args: { modal: true } }
