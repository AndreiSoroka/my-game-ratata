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
    slot1: keyof typeof leadingExamples
    slot2: keyof typeof contentExamples
    slot3: keyof typeof trailingExamples
    width: number
}

const meta = {
    title: 'Shared/Common/HUD row',
    args: { align: 'center', slot1: 'div', slot2: 'div', slot3: 'div', width: 330 },
    argTypes: {
        align: { control: 'inline-radio', options: ['start', 'center'] },
        slot1: {
            control: 'select',
            options: Object.keys(leadingExamples),
            description: 'Левый слот (leading)',
        },
        slot2: {
            control: 'select',
            options: Object.keys(contentExamples),
            description: 'Широкий центральный слот (default)',
        },
        slot3: {
            control: 'select',
            options: Object.keys(trailingExamples),
            description: 'Правый слот (trailing)',
        },
    },
    render(args) {
        const host = renderVueStory(
            {
                render: () =>
                    h(
                        HudRow,
                        { align: args.align },
                        {
                            leading: leadingExamples[args.slot1],
                            default: contentExamples[args.slot2],
                            trailing: trailingExamples[args.slot3],
                        }
                    ),
            },
            {},
            { background: lightUiColors.panel.parchment }
        )
        host.style.maxWidth = `${args.width}px`
        host.style.containerType = 'inline-size'
        host.style.color = lightUiColors.panel.text
        host.style.font = '12px/1.4 var(--ratata-font-family, sans-serif)'
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
