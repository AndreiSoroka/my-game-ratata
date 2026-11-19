import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    type KenneyUiStoryArgs,
    renderBarsStory,
    renderButtonsStory,
    renderTitlesStory,
    renderWindowsStory,
    renderWrappersStory,
} from '../ui/renderKenneyUiStory'

const meta = {
    title: 'Shared/Kenney UI',
    argTypes: {
        label: {
            control: 'text',
        },
        value: {
            control: {
                max: 100,
                min: 0,
                step: 1,
                type: 'range',
            },
        },
        width: {
            control: {
                max: 320,
                min: 96,
                step: 8,
                type: 'range',
            },
        },
    },
    args: {
        label: 'Okay',
        value: 72,
        width: 184,
    },
} satisfies Meta<KenneyUiStoryArgs>

export default meta
type Story = StoryObj<KenneyUiStoryArgs>

export const Buttons: Story = {
    render: (args) => renderButtonsStory(args),
}

export const Wrappers: Story = {
    render: () => renderWrappersStory(),
}

export const Titles: Story = {
    render: (args) => renderTitlesStory(args),
}

export const Bars: Story = {
    render: (args) => renderBarsStory(args),
}

export const Windows: Story = {
    render: () => renderWindowsStory(),
}
