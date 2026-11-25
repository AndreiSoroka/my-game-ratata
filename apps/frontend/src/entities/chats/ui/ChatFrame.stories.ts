import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref, shallowRef, useId, watch } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { ChatHistoryEntry, ChatHistoryFilter } from '../model/chatHistory'
import ChatComposer from './ChatComposer.vue'
import ChatComposerFrame from './ChatComposerFrame.vue'
import ChatFrame from './ChatFrame.vue'
import ChatHistoryPanel from './ChatHistoryPanel.vue'
import ChatToolbar from './ChatToolbar.vue'

interface StoryArgs {
    collapsed: boolean
    toolbar: 'empty' | 'text' | 'buttons'
    history: 'empty' | 'text' | 'messages'
    composer: 'none' | 'empty' | 'text' | 'input'
}

const entries: readonly ChatHistoryEntry[] = [
    { id: 'gate', channel: 'say', name: 'Мира', text: 'Встретимся у северных ворот.', at: 1 },
    { id: 'bridge', channel: 'say', name: 'Лада', text: 'Пойду через мост.', at: 2 },
]

const meta = {
    title: 'Entities/chats/ChatFrame',
    args: { collapsed: false, toolbar: 'text', history: 'empty', composer: 'none' },
    argTypes: {
        collapsed: { control: 'boolean' },
        toolbar: {
            control: {
                type: 'select',
                labels: { empty: 'Пустой div с фоном', text: 'Текст', buttons: 'Кнопки' },
            },
            options: ['empty', 'text', 'buttons'],
        },
        history: {
            control: {
                type: 'select',
                labels: { empty: 'Пустой div с фоном', text: 'Текст', messages: 'Сообщения' },
            },
            options: ['empty', 'text', 'messages'],
        },
        composer: {
            control: {
                type: 'select',
                labels: {
                    none: 'Без слота',
                    empty: 'Пустой div с фоном',
                    text: 'Текст',
                    input: 'Поле ввода',
                },
            },
            options: ['none', 'empty', 'text', 'input'],
        },
    },
    render(args) {
        const host = renderVueStory(
            {
                setup() {
                    const listId = useId()
                    const filter = ref<ChatHistoryFilter>('all')
                    const collapsed = ref(args.collapsed)
                    const draft = ref('Я уже в пути.')
                    const composerRef = shallowRef<InstanceType<typeof ChatComposer> | null>(null)
                    watch(collapsed, () => composerRef.value?.focusAtEnd(), { flush: 'post' })
                    const slots = {
                        toolbar: () =>
                            args.toolbar === 'empty'
                                ? h('div', { style: { minHeight: '24px', background: '#8b4865' } })
                                : args.toolbar === 'text'
                                  ? h('span', 'Фильтр сообщений')
                                  : h(ChatToolbar, {
                                        historyId: listId,
                                        filter: filter.value,
                                        collapsed: collapsed.value,
                                        'onUpdate:filter': (value: ChatHistoryFilter) =>
                                            (filter.value = value),
                                        'onUpdate:collapsed': (value: boolean) =>
                                            (collapsed.value = value),
                                    }),
                        history: () =>
                            args.history === 'empty'
                                ? h('div', { style: { minHeight: '24px', background: '#374c82' } })
                                : args.history === 'text'
                                  ? h('span', 'Мира: Встретимся у северных ворот.')
                                  : h(ChatHistoryPanel, {
                                        entries,
                                        listId,
                                        filter: filter.value,
                                        collapsed: collapsed.value,
                                    }),
                    }
                    const composer = () =>
                        args.composer === 'empty'
                            ? h('div', { style: { minHeight: '24px', background: '#625091' } })
                            : args.composer === 'text'
                              ? h('span', 'Здесь появляется черновик сообщения.')
                              : h(ChatComposerFrame, { framed: !collapsed.value }, () =>
                                    h(ChatComposer, {
                                        ref: composerRef,
                                        draft: draft.value,
                                        maxLength: 400,
                                        'onUpdate:draft': (value: string) => (draft.value = value),
                                    })
                                )
                    return () =>
                        h(
                            ChatFrame,
                            { collapsed: collapsed.value },
                            args.composer === 'none' ? slots : { ...slots, composer }
                        )
                },
            },
            {}
        )
        host.style.maxWidth = '418px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const WithHistory: Story = { args: { toolbar: 'buttons', history: 'messages' } }

export const Typing: Story = { args: { ...WithHistory.args, composer: 'input' } }
