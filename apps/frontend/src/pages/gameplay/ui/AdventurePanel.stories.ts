import type { AdventureSnapshot, CharacterSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import type { DialogueNeighbors } from '@/entities/dialogues'
import { adventureFixture, characterFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import AdventurePanel from './AdventurePanel.vue'

const player = characterFixture('self')
const adventure: AdventureSnapshot = {
    ...adventureFixture(),
    dialogue: {
        kind: 'sign',
        npcId: 'novogorod-sign',
        npcName: 'Указатель',
        title: 'Северная дорога',
        text: 'Дорога к лесной опушке и старой сторожевой башне.',
        choices: [],
        canTrade: false,
    },
}
type Args = {
    adventure: AdventureSnapshot
    characters: CharacterSnapshot[]
    inventoryOpen: boolean
    player: CharacterSnapshot
    serverTime: number
    neighbors?: DialogueNeighbors
    switchPending?: boolean
}
const meta = {
    title: 'Pages/gameplay/AdventurePanel',
    parameters: { backgrounds: { disable: false } },
    args: {
        adventure,
        characters: [player],
        player,
        inventoryOpen: false,
        serverTime: 1000,
        switchPending: false,
    },
    render: (args) => renderVueStory(AdventurePanel, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const HiddenByInventory: Story = { args: { inventoryOpen: true } }
