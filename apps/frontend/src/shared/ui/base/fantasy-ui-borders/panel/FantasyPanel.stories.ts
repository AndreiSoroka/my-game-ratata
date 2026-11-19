import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import FantasyPanelStory from './FantasyPanelStory.vue'
import type { FantasyPanelAppearance, FantasyPanelVariant } from './index'

type PanelArgs = {
    panel: FantasyPanelVariant
    appearance: FantasyPanelAppearance
    color: string
}
type Section = 'default' | 'variants' | 'appearances' | 'colors' | 'composition' | 'sizes'
const variants = Array.from(
    { length: 32 },
    (_, index) => `panel-${String(index).padStart(3, '0')}` as FantasyPanelVariant
)
const meta = {
    title: 'Interface/Base/fantasy-ui-borders/FantasyPanel',
    args: { panel: 'panel-026', appearance: 'solid', color: lightUiColors.panel.parchment },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        panel: { control: 'select', options: variants },
        appearance: {
            control: 'select',
            options: ['solid', 'transparent-border', 'transparent-center'],
        },
        color: { control: 'text' },
    },
} satisfies Meta<PanelArgs>
export default meta
type Story = StoryObj<PanelArgs>

function preview(
    section: Section,
    args: Partial<PanelArgs>,
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
    return renderVueStory(FantasyPanelStory, { section, ...args, foreground })
}

export const Default: Story = {
    render: (args, context) => preview('default', args, context.globals),
}
export const Variants: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('variants', {}, context.globals),
}
export const Appearances: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('appearances', {}, context.globals),
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
