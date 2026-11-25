import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import ChatComposer from './ChatComposer.vue'
import ChatComposerFrame from './ChatComposerFrame.vue'

interface StoryArgs {
    framed: boolean
    borderWidth?: number
    default: 'empty' | 'text' | 'composer'
}

const meta = {
    title: 'Entities/chats/ChatComposerFrame',
    args: { framed: true, default: 'text' },
    argTypes: {
        framed: { control: 'boolean' },
        borderWidth: { control: { type: 'number', min: 1 } },
        default: {
            name: 'Содержимое слота',
            control: {
                type: 'select',
                labels: { empty: 'Пустой div с фоном', text: 'Текст', composer: 'Поле ввода чата' },
            },
            options: ['empty', 'text', 'composer'],
        },
    },
    render({ borderWidth, default: content, framed }) {
        const host = renderVueStory(
            {
                setup() {
                    const draft = ref('Встретимся у северных ворот.')
                    return () =>
                        h(
                            ChatComposerFrame,
                            { borderWidth, framed },
                            {
                                default: () =>
                                    content === 'empty'
                                        ? h('div', {
                                              style: { minHeight: '36px', background: '#8b4865' },
                                          })
                                        : content === 'text'
                                          ? 'Новая реплика'
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

export const WithComposer: Story = { args: { default: 'composer' } }

export const Unframed: Story = { args: { default: 'composer', framed: false } }
