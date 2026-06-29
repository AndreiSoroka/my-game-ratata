import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    type LogMessage,
    renderFullHud,
    renderLogPanel,
    renderSpeechBubble,
    renderStatusGroup,
} from '../ui/renderInterfaceStory'

interface InterfaceArgs {
    energy: number
    hp: number
    mana: number
    serverLabel: string
    showAbilities: boolean
    speechText: string
}

const meta = {
    title: 'Interface/HUD',
    argTypes: {
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
        speechText: {
            control: 'text',
        },
    },
    args: {
        energy: 36,
        hp: 84,
        mana: 58,
        serverLabel: '127.0.0.1:2567',
        showAbilities: true,
        speechText: 'Need mana before the bridge.',
    },
} satisfies Meta<InterfaceArgs>

export default meta
type Story = StoryObj<InterfaceArgs>

const messages: LogMessage[] = [
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

export const Logs: Story = {
    render: () =>
        renderLogPanel({
            messages,
        }),
}

export const SpeechBubble: Story = {
    render: (args) => renderSpeechBubble(args.speechText),
}

export const FullHUD: Story = {
    render: (args) =>
        renderFullHud({
            messages,
            resources: resourcesFromArgs(args),
            serverLabel: args.serverLabel,
            showAbilities: args.showAbilities,
            speechText: args.speechText,
        }),
}
