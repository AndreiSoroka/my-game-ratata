import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import { UiFrame } from './index'

type FrameArgs = InstanceType<typeof UiFrame>['$props']

const meta = {
    title: 'Shared/Common/UiFrame',
    args: { variant: 'panel', skin: 'default' },
    argTypes: {
        variant: { control: 'select', options: ['window', 'panel', 'inset', 'speech'] },
        skin: { control: 'select', options: ['default', 'parchment'] },
    },
    render: (args) =>
        renderVueStory(
            {
                render: () =>
                    h(
                        'div',
                        {
                            class: 'game-frame-host',
                            style: {
                                inlineSize: 'min(280px, 100%)',
                                blockSize: '120px',
                                border: args.skin === 'parchment' ? '10px solid transparent' : '',
                            },
                        },
                        [h(UiFrame, args)]
                    ),
            },
            {}
        ),
} satisfies Meta<FrameArgs>

export default meta
type Story = StoryObj<FrameArgs>

export const Default: Story = {}
export const Parchment: Story = { args: { skin: 'parchment' } }
export const Speech: Story = { args: { variant: 'speech' } }
