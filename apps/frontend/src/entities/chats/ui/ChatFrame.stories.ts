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
    toolbar: 'empty' | 'buttons'
    history: 'empty' | 'messages'
    composer: 'none' | 'empty' | 'input'
}

const entries: readonly ChatHistoryEntry[] = [
    { id: 'gate', channel: 'say', name: 'Мира', text: 'Встретимся у северных ворот.', at: 1 },
    { id: 'bridge', channel: 'say', name: 'Лада', text: 'Пойду через мост.', at: 2 },
]

const meta = {
    title: 'Entities/chats/ChatFrame',
    args: { collapsed: false, toolbar: 'buttons', history: 'messages', composer: 'none' },
    argTypes: {
        collapsed: { control: 'boolean' },
        toolbar: {
            control: { type: 'select', labels: { empty: 'Пустой div', buttons: 'Кнопки' } },
            options: ['empty', 'buttons'],
        },
        history: {
            control: { type: 'select', labels: { empty: 'Пустой div', messages: 'Сообщения' } },
            options: ['empty', 'messages'],
        },
        composer: {
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', input: 'Поле ввода' },
            },
            options: ['none', 'empty', 'input'],
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
                                ? h('div')
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
                                ? h('div')
                                : h(ChatHistoryPanel, {
                                      entries,
                                      listId,
                                      filter: filter.value,
                                      collapsed: collapsed.value,
                                  }),
                    }
                    const composer = () =>
                        args.composer === 'empty'
                            ? h('div')
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

export const Typing: Story = { args: { composer: 'input' } }
