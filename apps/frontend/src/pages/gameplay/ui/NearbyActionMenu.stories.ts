import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import { UiButton } from '@/shared/ui/common'

import NearbyActionMenu from './NearbyActionMenu.vue'

type StoryArgs = InstanceType<typeof NearbyActionMenu>['$props'] & { content: StorySlot }
const meta = {
    title: 'Pages/gameplay/NearbyActionMenu',
    args: {
        open: true,
        contextLabel: 'Савва',
        targetKey: 'character:merchant',
        actions: [
            { id: 'speak', label: 'Поговорить' },
            { id: 'trade', label: 'Обмен недоступен', disabled: true },
        ],
        content: 'none',
    },
    argTypes: {
        open: { control: 'boolean' },
        contextLabel: { control: 'text' },
        targetKey: { control: 'text' },
        actions: { control: 'object' },
        neighbors: { control: 'object' },
        content: storySlotControl('Содержимое'),
    },
    render: ({ content, ...props }) =>
        renderVueStory(
            {
                render: () =>
                    h(NearbyActionMenu, props, {
                        default: storySlot(content, 'Действия рядом', () =>
                            h(UiButton, { size: 'compact', disabled: true }, () => 'Сведения')
                        ),
                    }),
            },
            {}
        ),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
