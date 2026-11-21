import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'

import type { MenuPanelProps } from './index'
import MenuPanelStory from './MenuPanelStory.vue'
import { menuStoryItems } from './menuStoryItems'

type MenuStoryArgs = MenuPanelProps & { onAction: (id: string) => void }
const meta = {
    title: 'Entities/Menu/Menu',
    args: {
        items: menuStoryItems,
        title: 'Игровое меню',
        description: 'Мир продолжает жить, пока открыто меню.',
        onAction: fn().mockName('action'),
    },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        items: { control: 'object' },
        title: { control: 'text' },
        description: { control: 'text' },
        onAction: { control: false },
    },
} satisfies Meta<MenuStoryArgs>
export default meta
type Story = StoryObj<MenuStoryArgs>

function preview(section: string, props: Partial<MenuStoryArgs> = {}): HTMLElement {
    return renderVueStory(MenuPanelStory, { section, ...props }, { padding: '16px' })
}

export const Default: Story = { render: (args) => preview('default', args) }
export const Actions: Story = {
    parameters: { controls: { disable: true } },
    render: (args) => preview('actions', { onAction: args.onAction }),
}
export const Disabled: Story = {
    parameters: { controls: { disable: true } },
    render: (args) => preview('disabled', { onAction: args.onAction }),
}
export const LongLabels: Story = {
    parameters: { controls: { disable: true } },
    render: (args) => preview('long-labels', { onAction: args.onAction }),
}
export const Overflow: Story = {
    parameters: { controls: { disable: true } },
    render: (args) => preview('overflow', { onAction: args.onAction }),
}
