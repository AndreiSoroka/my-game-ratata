import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    type ChatMessage,
    renderChatPanel,
    renderFullHud,
    renderStatusGroup,
} from '../ui/renderInterfaceStory'

interface InterfaceArgs {
    chatActive: boolean
    chatDraft: string
    energy: number
    hp: number
    mana: number
    serverLabel: string
    showAbilities: boolean
}

const meta = {
    title: 'Interface/HUD',
    argTypes: {
        chatActive: {
            control: 'boolean',
        },
        chatDraft: {
            control: 'text',
        },
        energy: {
            control: {
                max: 60,
                min: 0,
                step: 1,
                type: 'range',
            },
        },
        hp: {
            control: {
                max: 100,
                min: 0,
                step: 1,
                type: 'range',
            },
        },
        mana: {
            control: {
                max: 90,
                min: 0,
                step: 1,
                type: 'range',
            },
        },
        serverLabel: {
            control: 'text',
        },
        showAbilities: {
            control: 'boolean',
        },
    },
    args: {
        chatActive: true,
        chatDraft: '/party Need mana before the bridge.',
        energy: 36,
        hp: 84,
        mana: 58,
        serverLabel: '127.0.0.1:2567',
        showAbilities: true,
    },
} satisfies Meta<InterfaceArgs>

export default meta
type Story = StoryObj<InterfaceArgs>

const messages: ChatMessage[] = [
    {
        author: 'System',
        text: 'Campfire warmth restored 12 energy.',
        tone: 'system',
    },
    {
        author: 'Mira',
        text: 'The northern gate is quiet again.',
        tone: 'local',
    },
    {
        author: 'Whisper',
        text: 'Something moves under the old bridge.',
        tone: 'whisper',
    },
]

function resourcesFromArgs(args: InterfaceArgs) {
    return [
        { current: args.hp, kind: 'hp' as const, max: 100 },
        { current: args.mana, kind: 'mana' as const, max: 90 },
        { current: args.energy, kind: 'energy' as const, max: 60 },
    ]
}

export const StatusGroup: Story = {
    render: (args) => renderStatusGroup(resourcesFromArgs(args), args.serverLabel),
}

export const Chat: Story = {
    render: (args) =>
        renderChatPanel({
            active: args.chatActive,
            draft: args.chatDraft,
            messages,
        }),
}

export const FullHUD: Story = {
    render: (args) =>
        renderFullHud({
            chatActive: args.chatActive,
            chatDraft: args.chatDraft,
            messages,
            resources: resourcesFromArgs(args),
            serverLabel: args.serverLabel,
            showAbilities: args.showAbilities,
        }),
}
