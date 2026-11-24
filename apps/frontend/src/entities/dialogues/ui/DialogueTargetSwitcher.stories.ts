import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'

import type { DialogueNeighbors } from '../model/dialogue'
import DialogueTargetSwitcher from './DialogueTargetSwitcher.vue'

interface StoryArgs {
    neighbors: DialogueNeighbors
    tabbable: boolean
    disabled: boolean
}

const switchTarget = fn().mockName('switchTarget')
const meta = {
    title: 'Entities/dialogues/DialogueTargetSwitcher',
    args: {
        neighbors: {
            left: { key: 'character:marina', name: 'Марина' },
            right: { key: 'character:severin', name: 'Северин' },
        },
        tabbable: true,
        disabled: false,
    },
    argTypes: {
        neighbors: { control: 'object' },
        tabbable: { control: 'boolean' },
        disabled: { control: 'boolean' },
    },
    render(props) {
        const host = renderVueStory(
            DialogueTargetSwitcher,
            { ...props, onSwitchTarget: switchTarget },
            { padding: '16px' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '612px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const RightOnly: Story = {
    args: {
        neighbors: {
            right: { key: 'character:severin', name: 'Северин из речного дозора' },
        },
    },
}

export const NoNeighbors: Story = { args: { neighbors: {} } }
