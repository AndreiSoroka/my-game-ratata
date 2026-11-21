import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import ChatComposer from './ChatComposer.vue'
import ChatComposerFrame from './ChatComposerFrame.vue'

interface StoryArgs {
    framed: boolean
    default: 'empty' | 'composer'
}

const meta = {
    title: 'Entities/chats/ChatComposerFrame',
    args: { framed: true, default: 'composer' },
    argTypes: {
        framed: { control: 'boolean' },
        default: {
            name: 'Содержимое слота',
            control: {
                type: 'select',
                labels: { empty: 'Пустой div', composer: 'Поле ввода чата' },
            },
            options: ['empty', 'composer'],
        },
    },
    render({ default: content, framed }) {
        const host = renderVueStory(
            {
                setup() {
                    const draft = ref('Встретимся у северных ворот.')
                    return () =>
                        h(
                            ChatComposerFrame,
                            { framed },
                            {
                                default: () =>
                                    content === 'empty'
                                        ? h('div')
                                        : h(ChatComposer, {
                                              draft: draft.value,
                                              maxLength: 400,
                                              autofocus: true,
                                              'onUpdate:draft': (value: string) =>
                                                  (draft.value = value),
                                          }),
                            }
                        )
                },
            },
            {},
            { background: 'var(--vt-c-black-soft)' }
        )
        host.style.maxWidth = '418px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Unframed: Story = { args: { framed: false } }
