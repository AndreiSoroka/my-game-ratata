import '../../assets/app.css'
import './adventurePanel.css'

import type { AdventureSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import AdventureDialogue from './AdventureDialogue.vue'
import SpeechBubbles from './SpeechBubbles.vue'

interface StoryArgs {
    view: 'conversation' | 'shop'
    text: string
    canTrade: boolean
}

const meta = {
    title: 'Game/AdventureDialogue',
    args: {
        view: 'conversation',
        text: 'Могу показать товары из городской лавки.',
        canTrade: true,
    },
    argTypes: {
        view: { control: 'select', options: ['conversation', 'shop'] },
        text: { control: 'text' },
        canTrade: { control: 'boolean' },
    },
    render({ view, text, canTrade }) {
        const npc = characterFixture('npc_merchant_1', {
            nickname: 'Торговец Савва',
            controllerKind: 'scripted',
            interactions: {
                dialogueMode: 'passive',
                aiDialogue: true,
                exchange: true,
                whisper: true,
            },
        })
        const player = characterFixture('preview-player')
        const characters = [player, npc]
        const adventure: AdventureSnapshot = {
            ...adventureFixture(12),
            dialogue: {
                npcId: npc.id,
                npcName: npc.nickname,
                title: 'Разговор',
                text,
                canTrade,
                choices: canTrade ? [{ id: 'trade', label: 'Посмотреть товары' }] : [],
                ...(view === 'shop' ? { initialView: 'shop' } : {}),
            },
            shop: [{ itemId: 'food', label: 'Еда', price: 4 }],
        }
        const host = renderVueStory(
            () => [
                ...(view === 'conversation'
                    ? [
                          h(SpeechBubbles, {
                              player,
                              snapshot: { ...worldFixture(characters), adventure },
                              game: {
                                  projectCharacter: () => ({
                                      x: window.innerWidth / 2,
                                      y: 170,
                                      lowerY: 206,
                                      width: window.innerWidth,
                                      height: 520,
                                  }),
                              },
                          }),
                      ]
                    : []),
                h(AdventureDialogue, {
                    characters,
                    adventure,
                    neighbors: { right: { key: 'character:ally', name: 'Лада' } },
                    onSwitchTarget: fn().mockName('switchTarget'),
                }),
            ],
            {}
        )
        host.classList.add('adventure-ui')
        return host
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Service: Story = { args: { view: 'shop' } }
