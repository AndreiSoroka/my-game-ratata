import '../ui/rpgControls.css'

import { bladeAbilityIds, type CharacterSnapshot, type HeroClass } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { defineComponent, h } from 'vue'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from '../ui/ActionHotbar.vue'
import type { HotbarBinding } from '../ui/hotbarBindings'
import { hotbarIdentityKey, provideHotbarSession } from '../ui/hotbarSession'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/ActionHotbar' } satisfies Meta
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

function bladeStory(guard: boolean): HTMLElement {
    const player = characterFixture('blade-adventurer', {
        heroClass: 'vanguard',
        abilities: { known: [...bladeAbilityIds], cooldowns: {}, barrier: null, casting: null },
        combat: { defensiveStance: guard, combo: { stacks: 2, limit: 3, expiresAt: 3000 } },
    })
    return savedHotbar(player, [
        { kind: 'attack' },
        { kind: 'ability', id: guard ? 'defensive_stance' : 'wide_swing' },
        { kind: 'ability', id: guard ? 'pommel_strike' : 'circular_swing' },
        { kind: 'ability', id: 'lunge' },
    ])
}
function savedHotbar(player: CharacterSnapshot, bindings: HotbarBinding[]): HTMLElement {
    const Preview = defineComponent({
        setup() {
            provideHotbarSession().set(hotbarIdentityKey(player), bindings)
            return () => h(ActionHotbar, { player, characters: [player], blocked: false })
        },
    })
    const host = renderVueStory(Preview, {})
    host.style.height = '100vh'
    return host
}
export const BladeTechniques: Story = { render: () => bladeStory(false) }
export const BladeGuard: Story = { render: () => bladeStory(true) }
