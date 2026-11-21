import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import BarTrackStory from './BarTrackStory.vue'
import { BarTrack, type BarTrackProps } from './index'

type StoryArgs = BarTrackProps & { content: 'none' | 'empty' | 'text' }
const meta = {
    title: 'Shared/Common/BarTrack',
    args: { color: lightUiColors.bar.track, height: 24, shadow: true, content: 'none' },
    argTypes: {
        color: { control: 'text' },
        height: { control: { type: 'range', min: 8, max: 48, step: 2 } },
        shadow: { control: 'boolean' },
        content: {
            name: 'Содержимое слота',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', text: 'Текст' },
            },
            options: ['none', 'empty', 'text'],
        },
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

function preview(section: 'colors' | 'sizes'): HTMLElement {
    const host = renderVueStory(
        BarTrackStory,
        { section },
        { background: lightUiColors.panel.coffee }
    )
    host.style.minHeight = '100dvh'
    return host
}

export const Default: Story = {
    render: ({ content, ...args }) => {
        const renderContent = {
            none: undefined,
            empty: () => h('div'),
            text: () =>
                h(
                    'span',
                    {
                        style: {
                            color: lightUiColors.bar.text,
                            display: 'block',
                            textAlign: 'center',
                        },
                    },
                    'Запас'
                ),
        }
        return renderVueStory(
            {
                render: () =>
                    h(
                        BarTrack,
                        {
                            ...args,
                            'data-testid': 'track-default',
                            style: { maxWidth: '560px' },
                        },
                        renderContent[content]
                    ),
            },
            {}
        )
    },
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('colors'),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('sizes'),
}
