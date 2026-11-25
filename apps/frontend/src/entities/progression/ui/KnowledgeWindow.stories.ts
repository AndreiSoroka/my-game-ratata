import { constellationIds } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import { apprentice, scholar } from './knowledgeStoryFixtures'
import KnowledgeWindow from './KnowledgeWindow.vue'

type Args = InstanceType<typeof KnowledgeWindow>['$props']

const meta = {
    title: 'Entities/progression/KnowledgeWindow',
    args: { player: apprentice, characters: [scholar], embedded: true, constellationId: 'magic' },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
        embedded: { control: 'boolean' },
        constellationId: { control: 'select', options: constellationIds },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(KnowledgeWindow, args),
}
export const Standalone: Story = { ...Default, args: { embedded: false } }
