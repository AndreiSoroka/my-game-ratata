import './adventurePanel.css'

import type { AdventureSnapshot, CharacterSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import type { DialogueNeighbors } from '@/entities/dialogues'
import { adventureFixture, characterFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import AdventureDialogue from './AdventureDialogue.vue'

interface Args {
    adventure: AdventureSnapshot
    characters: CharacterSnapshot[]
    neighbors?: DialogueNeighbors
    switchPending?: boolean
}

const npc = characterFixture('npc_merchant_1', {
    nickname: 'Торговец Савва',
    controllerKind: 'scripted',
    interactions: { dialogueMode: 'passive', aiDialogue: true, exchange: true, whisper: true },
})
const dialogue = {
    npcId: npc.id,
    npcName: npc.nickname,
    title: 'Разговор',
    text: 'Могу показать товары из городской лавки.',
    canTrade: true,
    choices: [{ id: 'trade', label: 'Посмотреть товары' }],
} satisfies NonNullable<AdventureSnapshot['dialogue']>
const adventure: AdventureSnapshot = {
    ...adventureFixture(12),
    dialogue,
    shop: [{ itemId: 'food', label: 'Еда', price: 4 }],
}
const meta = {
    title: 'Pages/gameplay/AdventureDialogue',
    parameters: { backgrounds: { disable: false } },
    args: {
        adventure,
        characters: [characterFixture('preview-player'), npc],
        neighbors: { right: { key: 'character:ally', name: 'Лада' } },
        switchPending: false,
    },
    render: (args) => renderVueStory(AdventureDialogue, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Service: Story = {
    args: { adventure: { ...adventure, dialogue: { ...dialogue, initialView: 'shop' } } },
}
