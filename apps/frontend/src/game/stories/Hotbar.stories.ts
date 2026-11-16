import '../ui/rpgControls.css'

import type { HeroClass } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from '../ui/ActionHotbar.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Hotbar' } satisfies Meta
export default meta
type Story = StoryObj
function render(heroClass: HeroClass): HTMLElement {
    const player = characterFixture('adventurer', {
        heroClass,
        abilities: {
            known: ['shot', 'spark', 'pray'],
            cooldowns: {},
            barrier: null,
            casting: null,
        },
    })
    return renderVueStory(ActionHotbar, { player, characters: [player], blocked: false })
}
export const Vanguard: Story = { render: () => render('vanguard') }
export const Ranger: Story = { render: () => render('ranger') }
export const Arcanist: Story = { render: () => render('arcanist') }
export const Cleric: Story = { render: () => render('cleric') }
