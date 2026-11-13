import '../ui/rpgControls.css'

import type { PartySnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from '../ui/ActionHotbar.vue'
import PartyPanel from '../ui/PartyPanel.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Gameplay controls' } satisfies Meta
export default meta
type Story = StoryObj
const player = characterFixture('mira', {
    nickname: 'Мира',
    abilities: { known: ['pray', 'barrier', 'spark'], cooldowns: {}, barrier: null, casting: null },
})
const party: PartySnapshot = {
    partyId: 'party',
    leaderId: 'mira',
    members: [
        {
            id: 'mira',
            nickname: 'Мира',
            hpPercent: 100,
            alive: true,
            online: true,
            locationId: 'map-2-2',
        },
        {
            id: 'ignat',
            nickname: 'Игнат',
            hpPercent: 37,
            alive: true,
            online: true,
            locationId: 'map-2-1',
        },
        {
            id: 'vera',
            nickname: 'Вера',
            hpPercent: 0,
            alive: false,
            online: true,
            locationId: 'map-2-2',
        },
    ],
    invitations: [],
    jobs: [],
    activeJob: null,
    notice: null,
}
export const Party: Story = {
    render: () => renderVueStory(PartyPanel, { party, currentLocationId: 'map-2-2' }),
}
export const EmptyHotbar: Story = {
    render: () => renderVueStory(ActionHotbar, { player, characters: [player], blocked: false }),
}
