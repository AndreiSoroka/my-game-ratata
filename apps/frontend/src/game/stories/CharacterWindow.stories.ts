import type { AdventureSnapshot, HeroClass } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { adventureFixture, worldFixture } from '../testing/characterFixture'
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

function windowStory(
    tab: 'stats' | 'development' | 'crafting',
    heroClass: HeroClass = 'cleric',
    adventure?: AdventureSnapshot
): HTMLElement {
    const player = developmentCharacterFixture(heroClass)
    const host = renderVueStory(CharacterWindow, {
        player,
        characters: [],
        snapshot: adventure ? { ...worldFixture([player]), adventure } : undefined,
        tab,
    })
    host.style.minHeight = '100dvh'
    return host
}

const meta = { title: 'Game/CharacterWindow' } satisfies Meta
export default meta
type Story = StoryObj

export const Statistics: Story = {
    render: () => windowStory('stats'),
}
export const Development: Story = {
    render: () => windowStory('development'),
}
export const Crafting: Story = {
    render: () => {
        const adventure = adventureFixture()
        adventure.materials.fiber = 3
        adventure.recipes = [
            { id: 'bake_bread', itemId: 'food', label: 'Испечь хлеб', cost: { grain: 3 } },
            { id: 'boots', itemId: 'boots', label: 'Сплести сапоги', cost: { fiber: 3 } },
        ]
        return windowStory('crafting', 'cleric', adventure)
    },
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

function fullDevelopment(heroClass: HeroClass): HTMLElement {
    const player = developmentCharacterFixture(heroClass)
    player.progression!.constellations = constellationFixture(true, heroClass)
    const host = renderVueStory(CharacterWindow, { player, characters: [], tab: 'development' })
    host.style.minHeight = '100dvh'
    return host
}

export const FullBladeDevelopment: Story = { render: () => fullDevelopment('vanguard') }
export const FullMotherDevelopment: Story = { render: () => fullDevelopment('cleric') }

export const VanguardDevelopment: Story = { render: () => windowStory('development', 'vanguard') }
export const ArcanistDevelopment: Story = { render: () => windowStory('development', 'arcanist') }
export const RangerDevelopment: Story = { render: () => windowStory('development', 'ranger') }
