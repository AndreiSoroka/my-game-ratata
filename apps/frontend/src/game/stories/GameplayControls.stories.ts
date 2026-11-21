import '../ui/rpgControls.css'

import type { PartySnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import ActionHotbar from '../ui/ActionHotbar.vue'
import InventoryOverlay from '../ui/InventoryOverlay.vue'
import PartyPanel from '../ui/PartyPanel.vue'
import SpeechBubbles from '../ui/SpeechBubbles.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Game/Gameplay controls' } satisfies Meta
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
export const DefaultHotbar: Story = {
    render: () => renderVueStory(ActionHotbar, { player, characters: [player], blocked: false }),
}
export const InventoryFoodQuickSlots: Story = {
    render: () =>
        renderVueStory(InventoryOverlay, {
            character: characterFixture('mira', {
                nickname: 'Мира',
                inventory: [{ instanceId: 'apple', itemId: 'food' }],
            }),
            chests: [],
        }),
}
export const LongSpeech: Story = {
    render: () =>
        renderVueStory(SpeechBubbles, {
            player,
            game: {
                projectCharacter: () => ({
                    x: 210,
                    y: 180,
                    width: Math.min(480, window.innerWidth),
                    height: 520,
                }),
            },
            snapshot: {
                ...worldFixture([player]),
                adventure: {
                    ...adventureFixture(),
                    dialogue: {
                        npcId: player.id,
                        npcName: player.nickname,
                        title: 'Разговор',
                        canTrade: false,
                        choices: [],
                        text: 'Я стражница Рада. Если ты заметил вора, подойди и подай жалобу через E в течение пяти минут. Имя попадёт в городскую книгу: стража начнёт охоту, торговцы откажут в торговле. Снять запись может сестра Вера в часовне.',
                    },
                },
            },
        }),
}

export const RepeatingPrayer: Story = {
    render: () => {
        const cleric = characterFixture('cleric', {
            heroClass: 'cleric',
            abilities: { known: ['pray'], cooldowns: { pray: 1800 }, casting: null, barrier: null },
            control: {
                mode: 'action',
                targetId: null,
                action: { kind: 'prayer', intent: { mode: 'devotion' } },
                waiting: 'cooldown',
            },
        })
        return renderVueStory(ActionHotbar, {
            player: cleric,
            characters: [cleric],
            blocked: false,
        })
    },
}
export const WaitingForMana: Story = {
    render: () => {
        const mage = characterFixture('mage', {
            heroClass: 'arcanist',
            abilities: { known: ['spark'], cooldowns: {}, casting: null, barrier: null },
            resources: {
                mana: { kind: 'percent', percent: 0, hasCapacity: true },
                energy: { kind: 'percent', percent: 100, hasCapacity: true },
            },
            resourceChecks: {
                ...characterFixture('mage').resourceChecks!,
                abilities: { ...characterFixture('mage').resourceChecks!.abilities, spark: 'mana' },
            },
            control: {
                mode: 'action',
                targetId: 'enemy',
                action: { kind: 'ability', abilityId: 'spark', targetId: 'enemy' },
                waiting: 'resources',
            },
        })
        const enemy = characterFixture('enemy', { faction: 'monsters', relationship: 'hostile' })
        return renderVueStory(ActionHotbar, {
            player: mage,
            characters: [mage, enemy],
            target: enemy,
            blocked: false,
        })
    },
}
