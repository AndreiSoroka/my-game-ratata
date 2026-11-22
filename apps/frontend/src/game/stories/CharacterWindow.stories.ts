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
import { parseStoryHeroClass } from './storyHeroClass'

function windowStory(
    tab: 'stats' | 'development' | 'crafting',
    heroClass: HeroClass,
    { adventure, full = false }: { adventure?: AdventureSnapshot; full?: boolean } = {}
): HTMLElement {
    const player = developmentCharacterFixture(heroClass)
    if (full) player.progression!.constellations = constellationFixture(true, heroClass)
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

function themedStory(
    render: (heroClass: HeroClass) => HTMLElement,
    fixtureClass: HeroClass = 'cleric'
): Story {
    return {
        parameters: { heroClass: fixtureClass },
        render: (_, { globals }) => render(parseStoryHeroClass(globals.heroClass) ?? fixtureClass),
    }
}

export const Statistics = themedStory((heroClass) => windowStory('stats', heroClass))
export const Development = themedStory((heroClass) => windowStory('development', heroClass))
export const Crafting = themedStory((heroClass) => {
    const adventure = adventureFixture()
    adventure.materials.fiber = 3
    adventure.recipes = [
        { id: 'bake_bread', itemId: 'food', label: 'Испечь хлеб', cost: { grain: 3 } },
        { id: 'boots', itemId: 'boots', label: 'Сплести сапоги', cost: { fiber: 3 } },
    ]
    return windowStory('crafting', heroClass, { adventure })
})
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

export const FullBladeDevelopment = themedStory(
    (heroClass) => windowStory('development', heroClass, { full: true }),
    'vanguard'
)
export const FullMotherDevelopment = themedStory((heroClass) =>
    windowStory('development', heroClass, { full: true })
)
export const VanguardDevelopment = themedStory(
    (heroClass) => windowStory('development', heroClass),
    'vanguard'
)
export const ArcanistDevelopment = themedStory(
    (heroClass) => windowStory('development', heroClass),
    'arcanist'
)
export const RangerDevelopment = themedStory(
    (heroClass) => windowStory('development', heroClass),
    'ranger'
)
