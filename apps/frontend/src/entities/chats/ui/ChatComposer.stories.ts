import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import ChatComposer from './ChatComposer.vue'

interface StoryArgs {
    draft: string
    maxLength: number
    autofocus: boolean
    focusRing: boolean
    onDraftChange: (value: string) => void
}

const meta = {
    title: 'Entities/chats/ChatComposer',
    args: {
        draft: 'Встретимся у северных ворот.',
        maxLength: 400,
        autofocus: false,
        focusRing: false,
        onDraftChange: fn().mockName('update:draft'),
    },
    argTypes: {
        draft: { control: 'text' },
        maxLength: { control: { type: 'number', min: 1, step: 1 } },
        autofocus: { control: 'boolean' },
        focusRing: { control: 'boolean' },
        onDraftChange: { control: false, table: { disable: true } },
    },
    render({ onDraftChange, ...args }) {
        const host = renderVueStory(
            {
                setup() {
                    const draft = ref(args.draft)
                    return () =>
                        h(ChatComposer, {
                            ...args,
                            draft: draft.value,
                            'onUpdate:draft': (value: string) => {
                                draft.value = value
                                onDraftChange(value)
                            },
                        })
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

export const Empty: Story = { args: { draft: '' } }

const fullDraft = 'Я уже у ворот.'
export const AtLimit: Story = { args: { draft: fullDraft, maxLength: fullDraft.length } }
