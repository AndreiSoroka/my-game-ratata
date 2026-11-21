import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { GameBar } from '@/shared/ui/common/game-bar'
import { lightUiColors } from '@/shared/ui/theme'

import HudRow from './HudRow.vue'

function colorBlock(color: string, width: string) {
    return h('div', { style: { backgroundColor: color, height: '12px', width } })
}

function exampleIcon() {
    return h('span', { role: 'img', 'aria-label': 'Иконка' }, '✦')
}

const leadingExamples = {
    div: () => colorBlock(lightUiColors.bar.health.color, '12px'),
    icon: exampleIcon,
    text: () => 'HP',
}

const contentExamples = {
    div: () => colorBlock(lightUiColors.bar.mana.color, '100%'),
    bar: () => h(GameBar, { value: 72, max: 100, label: 'Ресурс', height: 18 }),
    text: () => '72 / 100',
    icon: exampleIcon,
}

const trailingExamples = {
    div: () => colorBlock(lightUiColors.bar.energy.color, '12px'),
    icon: exampleIcon,
    text: () => '3',
    empty: undefined,
}

interface StoryArgs {
    align: 'start' | 'center'
    leading: keyof typeof leadingExamples
    content: keyof typeof contentExamples
    trailing: keyof typeof trailingExamples
    width: number
}

const meta = {
    title: 'Shared/Common/HudRow',
    args: { align: 'center', leading: 'div', content: 'div', trailing: 'icon', width: 330 },
    argTypes: {
        align: { control: 'inline-radio', options: ['start', 'center'] },
        leading: {
            name: 'Левый слот (leading)',
            control: {
                type: 'select',
                labels: { div: 'Пустой div', icon: 'Иконка', text: 'Текст' },
            },
            options: Object.keys(leadingExamples),
        },
        content: {
            name: 'Центральный слот (default)',
            control: {
                type: 'select',
                labels: { div: 'Пустой div', bar: 'Полоса ресурса', text: 'Текст', icon: 'Иконка' },
            },
            options: Object.keys(contentExamples),
        },
        trailing: {
            name: 'Правый слот (trailing)',
            control: {
                type: 'select',
                labels: { div: 'Пустой div', icon: 'Иконка', text: 'Текст', empty: 'Без слота' },
            },
            options: Object.keys(trailingExamples),
        },
        width: { control: { type: 'range', min: 110, max: 560, step: 10 } },
    },
    render(args) {
        const host = renderVueStory(
            {
                render: () =>
                    h(
                        HudRow,
                        { align: args.align },
                        {
                            leading: leadingExamples[args.leading],
                            default: contentExamples[args.content],
                            trailing: trailingExamples[args.trailing],
                        }
                    ),
            },
            {}
        )
        host.style.maxWidth = `${args.width}px`
        host.style.containerType = 'inline-size'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const CompactWithTrailing: Story = {
    name: 'Compact',
    args: {
        align: 'start',
        width: 180,
    },
}
