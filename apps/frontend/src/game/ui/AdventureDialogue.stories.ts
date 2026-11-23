import '../../assets/app.css'
import './adventurePanel.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import { adventureFixture, characterFixture } from '../testing/characterFixture'
import AdventureDialogue from './AdventureDialogue.vue'

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
        const host = renderVueStory(AdventureDialogue, {
            characters: [npc],
            adventure: {
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
            },
        })
        host.classList.add('adventure-ui')
        return host
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Service: Story = { args: { view: 'shop' } }
