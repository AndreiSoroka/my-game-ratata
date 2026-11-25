import './rpgControls.css'

import {
    type AbilityId,
    bladeAbilityIds,
    type CharacterSnapshot,
    type HeroClass,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { userEvent, within } from 'storybook/test'
import { defineComponent, h, ref } from 'vue'

import { type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import { UiButton } from '@/shared/ui/common'

import { renderVueStory } from '../../../game/stories/renderVueStory'
import { characterFixture } from '../../../game/testing/characterFixture'
import type { HotbarBinding } from '../model/hotbarBindings'
import { hotbarIdentityKey, provideHotbarSession } from '../model/hotbarSession'
import ActionHotbar from './ActionHotbar.vue'

type Props = InstanceType<typeof ActionHotbar>['$props']
type StoryArgs = Pick<
    Props,
    'player' | 'target' | 'grave' | 'graves' | 'objectTarget' | 'characters' | 'blocked'
> & { guide: StorySlot }
const previewPlayer = characterFixture('adventurer', { heroClass: 'vanguard' })
const meta = {
    title: 'Game/ActionHotbar',
    args: { player: previewPlayer, characters: [previewPlayer], blocked: false, guide: 'none' },
    argTypes: {
        player: { control: 'object' },
        target: { control: 'object' },
        grave: { control: 'object' },
        graves: { control: 'object' },
        characters: { control: 'object' },
        objectTarget: { control: 'boolean' },
        blocked: { control: 'boolean' },
        guide: storySlotControl('Подсказка управления'),
    },
    render: ({ guide, ...props }) =>
        renderVueStory(
            {
                render: () =>
                    h(ActionHotbar, props, {
                        guide: storySlot(guide, 'F · Действие', () =>
                            h(UiButton, { size: 'compact' }, () => 'Поговорить')
                        ),
                    }),
            },
            {}
        ),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
const starterAbilities: Record<HeroClass, AbilityId[]> = {
    vanguard: [],
    ranger: ['shot', 'sniper_shot'],
    arcanist: ['spark', 'barrier'],
    cleric: ['pray'],
}

function themedHotbarStory(heroClass: HeroClass): Story {
    return {
        parameters: { heroClass },
        render() {
            const player = characterFixture('adventurer', {
                heroClass,
                abilities: {
                    known: [...starterAbilities[heroClass]],
                    cooldowns: {},
                    barrier: null,
                    casting: null,
                },
            })
            return renderVueStory(ActionHotbar, { player, characters: [player], blocked: false })
        },
    }
}
export const Vanguard = themedHotbarStory('vanguard')
export const Ranger = themedHotbarStory('ranger')
export const Arcanist = themedHotbarStory('arcanist')
export const Cleric = themedHotbarStory('cleric')
export const Assignment: Story = {
    ...themedHotbarStory('ranger'),
    async play({ canvasElement }) {
        const slot = await within(canvasElement).findByRole('button', { name: /^4: Пусто/ })
        await userEvent.click(slot)
    },
}

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
            provideHotbarSession().set(hotbarIdentityKey(player), {
                bindings: ref(bindings),
                seen: new Set(player.abilities?.known),
            })
            return () => h(ActionHotbar, { player, characters: [player], blocked: false })
        },
    })
    const host = renderVueStory(Preview, {})
    host.style.height = '100vh'
    return host
}
export const BladeTechniques: Story = { render: () => bladeStory(false) }
export const BladeGuard: Story = { render: () => bladeStory(true) }
