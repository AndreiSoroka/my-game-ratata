import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import FantasyBorderStory from './FantasyBorderStory.vue'
import type { FantasyBorderVariant } from './index'

type BorderArgs = { border: FantasyBorderVariant; color: string }
type Section = 'default' | 'variants' | 'colors' | 'composition' | 'sizes'
const variants = Array.from(
    { length: 32 },
    (_, index) => `border-${String(index).padStart(3, '0')}` as FantasyBorderVariant
)
const meta = {
    title: 'Shared/External/fantasy-ui-borders/FantasyBorder',
    args: { border: 'border-026', color: 'currentColor' },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        border: { control: 'select', options: variants },
        color: { control: 'text' },
    },
} satisfies Meta<BorderArgs>
export default meta
type Story = StoryObj<BorderArgs>

function preview(
    section: Section,
    args: Partial<BorderArgs>,
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
    return renderVueStory(FantasyBorderStory, { section, ...args, foreground })
}

export const Default: Story = {
    render: (args, context) => preview('default', args, context.globals),
}
export const Variants: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('variants', {}, context.globals),
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('colors', {}, context.globals),
}
export const Composition: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('composition', {}, context.globals),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('sizes', {}, context.globals),
}
