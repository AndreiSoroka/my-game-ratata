import './rpgControls.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '../../../game/stories/renderVueStory'
import GameMenu from './GameMenu.vue'

type StoryArgs = Pick<
    InstanceType<typeof GameMenu>['$props'],
    'automationAvailable' | 'inventoryAvailable'
>
const meta = {
    title: 'Game/GameMenu',
    args: { automationAvailable: true, inventoryAvailable: true },
    argTypes: {
        automationAvailable: { control: 'boolean' },
        inventoryAvailable: { control: 'boolean' },
    },
    render: (args) => renderVueStory(GameMenu, args),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Open: Story = {}
