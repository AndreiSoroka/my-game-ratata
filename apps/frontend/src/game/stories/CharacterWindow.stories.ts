import type { HeroClass } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    constellationFixture,
    developmentCharacterFixture,
    fixtureStarId,
} from '../testing/developmentFixture'
import CharacterDevelopment from '../ui/CharacterDevelopment.vue'
import CharacterStats from '../ui/CharacterStats.vue'
import CharacterWindow from '../ui/CharacterWindow.vue'
import ConstellationGraph from '../ui/ConstellationGraph.vue'
import { renderVueStory } from './renderVueStory'

function windowStory(tab: 'stats' | 'development', heroClass: HeroClass = 'cleric'): HTMLElement {
    const host = renderVueStory(CharacterWindow, {
        player: developmentCharacterFixture(heroClass),
        characters: [],
        tab,
    })
    host.style.minHeight = '100dvh'
    return host
}

const meta = { title: 'Interface/Character' } satisfies Meta
export default meta
type Story = StoryObj

export const Statistics: Story = {
    render: () => windowStory('stats'),
}
export const Development: Story = {
    render: () => windowStory('development'),
}
export const ResourceEstimates: Story = {
    render: () => renderVueStory(CharacterStats, { player: developmentCharacterFixture() }),
}
export const Sky: Story = {
    render: () =>
        renderVueStory(ConstellationGraph, {
            constellation: constellationFixture(),
            selectedId: fixtureStarId('prayer.radius1'),
        }),
}
export const PrayerPath: Story = {
    render: () =>
        renderVueStory(CharacterDevelopment, {
            player: developmentCharacterFixture(),
            characters: [],
        }),
}

export const FullSky: Story = {
    render: () =>
        renderVueStory(ConstellationGraph, {
            constellation: constellationFixture(true),
            selectedId: constellationFixture(true).layout!.centerNodeId,
        }),
}

export const VanguardDevelopment: Story = { render: () => windowStory('development', 'vanguard') }
export const ArcanistDevelopment: Story = { render: () => windowStory('development', 'arcanist') }
export const RangerDevelopment: Story = { render: () => windowStory('development', 'ranger') }
