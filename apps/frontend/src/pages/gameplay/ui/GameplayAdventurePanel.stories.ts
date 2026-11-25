import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { adventureFixture, characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import GameplayAdventurePanel from './GameplayAdventurePanel.vue'

const player = characterFixture('adventurer')
const merchant = characterFixture('merchant', { nickname: 'Савва' })
const snapshot = {
    ...worldFixture([player, merchant]),
    adventure: {
        ...adventureFixture(),
        dialogue: {
            npcId: merchant.id,
            npcName: merchant.nickname,
            title: 'Разговор',
            text: 'Чем могу помочь?',
            canTrade: false,
            choices: [{ id: 'close', label: 'До свидания' }],
        },
    },
}
const targetSwitch = {
    connected: () => true,
    blocked: () => false,
    canSelectTarget: () => true,
    isPositionVisible: () => true,
    openCharacterMenu: () => {},
}

type StoryArgs = InstanceType<typeof GameplayAdventurePanel>['$props']
const meta = {
    title: 'Pages/gameplay/GameplayAdventurePanel',
    args: { player, characters: [player, merchant], snapshot, inventoryOpen: false, targetSwitch },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
        snapshot: { control: 'object' },
        inventoryOpen: { control: 'boolean' },
        targetSwitch: { control: false },
    },
    render: (args) => renderVueStory(GameplayAdventurePanel, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
