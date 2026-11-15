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

function windowStory(tab: 'stats' | 'development'): HTMLElement {
    const host = renderVueStory(CharacterWindow, {
        player: developmentCharacterFixture(),
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
            selectedId: fixtureStarId('prayer.revive'),
        }),
}
