import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import FantasyDividerStory from './FantasyDividerStory.vue'
import type { FantasyDividerEnds, FantasyDividerVariant } from './index'

type DividerArgs = {
    divider: FantasyDividerVariant
    color: string
    fade: boolean
    ends: FantasyDividerEnds
}
type Section = 'default' | 'variants' | 'directions' | 'colors' | 'sizes'
const variants = Array.from(
    { length: 6 },
    (_, index) => `divider-${String(index).padStart(3, '0')}` as FantasyDividerVariant
)
const meta = {
    title: 'Shared/External/fantasy-ui-borders/FantasyDivider',
    args: { divider: 'divider-000', color: 'currentColor', fade: false, ends: 'right' },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        divider: { control: 'select', options: variants },
        color: { control: 'text' },
        fade: { control: 'boolean' },
        ends: { control: 'select', options: ['left', 'right', 'both'] },
    },
} satisfies Meta<DividerArgs>
export default meta
type Story = StoryObj<DividerArgs>

function preview(
    section: Section,
    args: Partial<DividerArgs>,
    globals: Record<string, unknown>
): HTMLElement {
    const backgrounds = globals.backgrounds as { value?: string } | string | undefined
    const background = typeof backgrounds === 'string' ? backgrounds : backgrounds?.value
    const foreground =
        background === 'wood' || background === 'dark'
            ? lightUiColors.button.text
            : background === 'parchment'
              ? lightUiColors.panel.text
              : 'inherit'
    return renderVueStory(
        FantasyDividerStory,
        { section, ...args, foreground },
        { background: 'transparent' }
    )
}

export const Default: Story = {
    render: (args, context) => preview('default', args, context.globals),
}
export const Variants: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('variants', {}, context.globals),
}
export const Directions: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('directions', {}, context.globals),
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('colors', {}, context.globals),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('sizes', {}, context.globals),
}
