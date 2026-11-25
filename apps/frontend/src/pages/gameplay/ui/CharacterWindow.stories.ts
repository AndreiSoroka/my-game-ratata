import type { AdventureSnapshot, HeroClass } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { parseStoryHeroClass } from '@/game/stories/storyHeroClass'
import { adventureFixture, worldFixture } from '@/game/testing/characterFixture'
import {
    constellationFixture,
    developmentCharacterFixture,
} from '@/game/testing/developmentFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import CharacterWindow from './CharacterWindow.vue'

function windowStory(
    tab: 'stats' | 'development' | 'crafting',
    heroClass: HeroClass,
    { adventure, full = false }: { adventure?: AdventureSnapshot; full?: boolean } = {}
): HTMLElement {
    const player = developmentCharacterFixture(heroClass)
    if (full) player.progression!.constellations = constellationFixture(true, heroClass)
    const host = renderVueStory(
        CharacterWindow,
        {
            player,
            characters: [],
            snapshot: adventure ? { ...worldFixture([player]), adventure } : undefined,
            tab,
        },
        { padding: '0' }
    )
    host.style.minHeight = '100dvh'
    return host
}

type Args = InstanceType<typeof CharacterWindow>['$props']
const meta = {
    title: 'Pages/Gameplay/CharacterWindow',
    args: { player: developmentCharacterFixture(), characters: [], tab: 'stats' },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
        snapshot: { control: 'object' },
        tab: { control: 'select', options: ['stats', 'development', 'quests', 'crafting'] },
    },
    parameters: { heroClass: 'cleric' },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render(args) {
        const host = renderVueStory(CharacterWindow, args, { padding: '0' })
        host.style.minHeight = '100dvh'
        return host
    },
}

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
