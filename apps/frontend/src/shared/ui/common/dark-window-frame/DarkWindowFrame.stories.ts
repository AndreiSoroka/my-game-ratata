import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'

import { darkPanelButtonColors, UiButton } from '../button'
import DarkWindowFrame from './DarkWindowFrame.vue'

const close = fn().mockName('close')

interface StoryArgs {
    title: string
    closeLabel?: string
    summary: StorySlot
    default: StorySlot
    actions: StorySlot
}

const meta = {
    title: 'Shared/Common/DarkWindowFrame',
    args: { title: 'Рюкзак', summary: 'text', default: 'text', actions: 'none' },
    argTypes: {
        title: { control: 'text' },
        closeLabel: { control: 'text' },
        summary: storySlotControl('Слот сводки'),
        default: storySlotControl('Слот содержимого'),
        actions: storySlotControl('Слот действий'),
    },
    render({ title, closeLabel, summary, default: body, actions: footer }) {
        const host = renderVueStory(
            () =>
                h(
                    DarkWindowFrame,
                    { title, closeLabel, onClose: close },
                    {
                        summary: storySlot(summary, 'Занято 2 из 10 слотов', () =>
                            h('strong', '2 / 10')
                        ),
                        default: storySlot(body, 'Фляга и походный плащ', () =>
                            h('ul', [h('li', 'Фляга × 1'), h('li', 'Походный плащ × 1')])
                        ),
                        actions: storySlot(footer, 'Действия', () =>
                            h(
                                UiButton,
                                {
                                    appearance: 'panel',
                                    colors: darkPanelButtonColors,
                                    onClick: close,
                                },
                                () => 'Закрыть'
                            )
                        ),
                    }
                ),
            {},
            { padding: '16px' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '544px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta

export const Default: StoryObj<StoryArgs> = {}
