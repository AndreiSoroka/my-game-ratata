import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import FantasyBorderStory from './FantasyBorderStory.vue'
import { FantasyBorder, type FantasyBorderProps, type FantasyBorderVariant } from './index'

type BorderArgs = FantasyBorderProps & { slotContent: 'empty' | 'sample' }
type Section = 'variants' | 'colors' | 'composition' | 'sizes'
const variants = Array.from(
    { length: 32 },
    (_, index) => `border-${String(index).padStart(3, '0')}` as FantasyBorderVariant
)
const meta = {
    title: 'Shared/External/fantasy-ui-borders/FantasyBorder',
    args: { as: 'div', border: 'border-026', color: 'currentColor', slotContent: 'sample' },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        as: { control: 'select', options: ['div', 'span'] },
        border: { control: 'select', options: variants },
        borderWidth: { control: 'number' },
        color: { control: 'text' },
        slotContent: {
            name: 'Default slot',
            control: { type: 'select', labels: { empty: 'Empty element', sample: 'Sample text' } },
            options: ['empty', 'sample'],
        },
    },
} satisfies Meta<BorderArgs>
export default meta
type Story = StoryObj<BorderArgs>

function canvasForeground(globals: Record<string, unknown>): string {
    const backgrounds = globals.backgrounds as { value?: string } | string | undefined
    const background = typeof backgrounds === 'string' ? backgrounds : backgrounds?.value
    return background === 'wood' || background === 'dark'
        ? lightUiColors.button.text
        : background === 'parchment'
          ? lightUiColors.panel.text
          : 'inherit'
}

function preview(section: Section, globals: Record<string, unknown>): HTMLElement {
    return renderVueStory(FantasyBorderStory, { section, foreground: canvasForeground(globals) })
}

export const Default: Story = {
    render(args, context) {
        const { slotContent, ...props } = args
        const host = renderVueStory(
            () =>
                h(
                    FantasyBorder,
                    {
                        ...props,
                        role: 'region',
                        'aria-label': 'FantasyBorder',
                        'data-testid': 'border-default',
                        style: {
                            display: props.as === 'span' ? 'inline-block' : undefined,
                            width: 'min(480px, 100%)',
                            padding: '16px',
                        },
                    },
                    () =>
                        slotContent === 'empty'
                            ? h(props.as === 'span' ? 'span' : 'div')
                            : 'Рамка с содержимым'
                ),
            {}
        )
        host.style.color = canvasForeground(context.globals)
        return host
    },
}
export const Variants: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('variants', context.globals),
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('colors', context.globals),
}
export const Composition: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('composition', context.globals),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('sizes', context.globals),
}
