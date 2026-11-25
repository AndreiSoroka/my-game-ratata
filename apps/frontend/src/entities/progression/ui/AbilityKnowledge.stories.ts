import { constellationIds } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import AbilityKnowledge from './AbilityKnowledge.vue'
import { caster, scholar } from './knowledgeStoryFixtures'

type Args = InstanceType<typeof AbilityKnowledge>['$props']

const meta = {
    title: 'Entities/progression/AbilityKnowledge',
    args: { player: caster, characters: [scholar], constellationId: 'magic' },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
        constellationId: { control: 'select', options: constellationIds },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(AbilityKnowledge, args),
}
export const WithoutTeacher: Story = { ...Default, args: { characters: [] } }
