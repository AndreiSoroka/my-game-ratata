import { heroClasses } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '../../../game/stories/renderVueStory'
import ConstellationDebug from './ConstellationDebug.vue'

type StoryArgs = InstanceType<typeof ConstellationDebug>['$props']
const meta = {
    title: 'Debug/Constellation atlas',
    args: { syncUrl: false },
    argTypes: {
        syncUrl: { control: 'boolean' },
        initialHeroClass: { options: heroClasses, control: 'select' },
        initialSeed: { control: 'text' },
    },
    render: (args) => {
        const host = renderVueStory(ConstellationDebug, args)
        host.style.padding = '0'
        return host
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>
export const Default: Story = {}
export const Atlas: Story = {}
