import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import GameBarStory from './GameBarStory.vue'
import { GameBar, type GameBarProps } from './index'

type StoryArgs = GameBarProps & { content: 'native' | 'empty' | 'text' }
type GalleryProps = Partial<GameBarProps> & { secondSegments?: readonly number[] }
const meta = {
    title: 'Shared/Common/GameBar',
    args: {
        value: 72,
        max: 100,
        color: lightUiColors.bar.health.color,
        trackColor: lightUiColors.bar.track,
        textColor: lightUiColors.bar.text,
        height: 24,
        label: 'Здоровье',
        showValue: false,
        shadow: true,
        segments: [],
        content: 'native',
    },
    argTypes: {
        value: { control: 'number' },
        max: { control: 'number' },
        color: { control: 'text' },
        trackColor: { control: 'text' },
        textColor: { control: 'text' },
        height: { control: { type: 'range', min: 8, max: 48, step: 2 } },
        label: { control: 'text' },
        showValue: { control: 'boolean' },
        shadow: { control: 'boolean' },
        segments: { control: 'object' },
        content: {
            name: 'Содержимое слота',
            control: {
                type: 'select',
                labels: { native: 'Значение полосы', empty: 'Пустой span', text: 'Текст' },
            },
            options: ['native', 'empty', 'text'],
        },
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

function preview(section: string, props: GalleryProps = {}): HTMLElement {
    const host = renderVueStory(
        GameBarStory,
        { section, ...props },
        { background: lightUiColors.panel.coffee }
    )
    host.style.minHeight = '100dvh'
    return host
}

export const Default: Story = {
    render: ({ content, ...args }) => {
        const renderContent = {
            native: undefined,
            empty: () => h('span'),
            text: () => 'Доступно',
        }
        return renderVueStory(
            {
                render: () =>
                    h(
                        GameBar,
                        {
                            ...args,
                            'data-testid': 'game-bar-default',
                            style: { maxWidth: '560px' },
                        },
                        renderContent[content]
                    ),
            },
            {}
        )
    },
}
export const WithValue: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('default', { value: 18, max: 30, showValue: true }),
}
export const Resources: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('resources'),
}
const segmentControlNames = {
    value: 'Заполнение, %',
    segments: 'Первая схема',
    secondSegments: 'Вторая схема',
}
export const Segments: StoryObj<StoryArgs & Pick<GalleryProps, 'secondSegments'>> = {
    args: {
        value: 82,
        segments: [40, 20, 20, 20],
        secondSegments: [30, 20, 10, 10, 10, 10, 10],
    },
    argTypes: {
        value: {
            name: segmentControlNames.value,
            control: { type: 'range', min: 0, max: 100, step: 1 },
        },
        segments: { name: segmentControlNames.segments, control: 'object' },
        secondSegments: { name: segmentControlNames.secondSegments, control: 'object' },
    },
    parameters: { controls: { include: Object.values(segmentControlNames) } },
    render: ({ value, segments, secondSegments }) =>
        preview('segments', { value, segments, secondSegments }),
}
export const Values: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('values'),
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('colors'),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('sizes'),
}
