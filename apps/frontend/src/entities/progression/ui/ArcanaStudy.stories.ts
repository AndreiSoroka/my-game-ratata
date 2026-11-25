import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ArcanaStudy from './ArcanaStudy.vue'
import { apprentice, caster, scholar } from './knowledgeStoryFixtures'

type Args = InstanceType<typeof ArcanaStudy>['$props']

const meta = {
    title: 'Entities/progression/ArcanaStudy',
    args: { player: apprentice, characters: [scholar] },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(ArcanaStudy, args),
}
export const Teaching: Story = {
    ...Default,
    args: { player: caster, characters: [{ ...apprentice, id: 'student' }, scholar] },
}
