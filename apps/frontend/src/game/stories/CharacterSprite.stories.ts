import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    type CharacterAction,
    characterActions,
    type CharacterDirection,
    characterDirections,
    type CharacterId,
    characterIds,
} from '../assets/characterCatalog'
import {
    type CharacterPreviewOptions,
    renderAllCharacters,
    renderCharacterFrame,
} from './renderExcaliburStory'

interface CharacterSpriteArgs {
    action: CharacterAction
    animate: boolean
    character: CharacterId
    direction: CharacterDirection
    frame: number
    showFrameGrid: boolean
    zoom: number
}

const meta = {
    title: 'Characters/Sprites',
    argTypes: {
        action: {
            control: 'select',
            options: characterActions,
        },
        animate: {
            control: 'boolean',
        },
        character: {
            control: 'select',
            options: characterIds,
        },
        direction: {
            control: 'select',
            options: characterDirections,
        },
        frame: {
            control: {
                max: 5,
                min: 0,
                step: 1,
                type: 'range',
            },
        },
        showFrameGrid: {
            control: 'boolean',
        },
        zoom: {
            control: {
                max: 8,
                min: 1,
                step: 1,
                type: 'range',
            },
        },
    },
    args: {
        action: 'idle',
        animate: false,
        character: 'player',
        direction: 'down',
        frame: 0,
        showFrameGrid: true,
        zoom: 4,
    },
    render: (args) => renderCharacterFrame(args as CharacterPreviewOptions),
} satisfies Meta<CharacterSpriteArgs>

export default meta
type Story = StoryObj<CharacterSpriteArgs>

export const FrameInspector: Story = {}

export const AnimationPreview: Story = {
    args: {
        action: 'walk',
        animate: true,
        character: 'skeleton',
        direction: 'right',
        frame: 0,
        showFrameGrid: false,
        zoom: 4,
    },
}

export const All: Story = {
    args: {
        zoom: 2,
    },
    render: (args) => renderAllCharacters(Number(args.zoom ?? 4)),
}
