import '../../assets/app.css'

import { HERO_BACKGROUND_DEFINITIONS, type HeroClass, heroClasses } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import JoinGameStory from './JoinGameStory.vue'
import { renderVueStory } from './renderVueStory'
import { parseStoryHeroClass } from './storyHeroClass'

interface StoryArgs {
    heroClass: HeroClass
}

const meta = {
    title: 'Game/JoinGamePanel',
    args: { heroClass: 'vanguard' },
    argTypes: {
        heroClass: {
            name: 'Прошлое героя',
            options: heroClasses,
            control: {
                type: 'select',
                labels: Object.fromEntries(
                    heroClasses.map((id) => [id, HERO_BACKGROUND_DEFINITIONS[id].name])
                ),
            },
        },
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Ready: Story = {
    render: ({ heroClass }, { globals }) => {
        const host = renderVueStory(JoinGameStory, {
            initialHeroClass: parseStoryHeroClass(globals.heroClass) ?? heroClass,
        })
        host.style.padding = '0'
        return host
    },
}
