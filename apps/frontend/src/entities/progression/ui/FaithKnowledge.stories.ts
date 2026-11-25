import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import FaithKnowledge from './FaithKnowledge.vue'
import { believer, shrineKeeper } from './knowledgeStoryFixtures'

type Args = InstanceType<typeof FaithKnowledge>['$props']

const meta = {
    title: 'Entities/progression/FaithKnowledge',
    args: { player: believer, characters: [shrineKeeper] },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(FaithKnowledge, args),
}
export const WithoutShrine: Story = { ...Default, args: { characters: [] } }
