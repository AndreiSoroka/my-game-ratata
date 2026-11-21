import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import FantasyPanelStory from './FantasyPanelStory.vue'
import { FantasyPanel, type FantasyPanelAppearance, type FantasyPanelVariant } from './index'

type PanelArgs = {
    panel: FantasyPanelVariant
    appearance: FantasyPanelAppearance
    borderColor: string
    backgroundColor: string
}
type Section = 'variants' | 'appearances' | 'colors' | 'composition' | 'sizes'
const variants = Array.from(
    { length: 32 },
    (_, index) => `panel-${String(index).padStart(3, '0')}` as FantasyPanelVariant
)
const meta = {
    title: 'Shared/External/fantasy-ui-borders/FantasyPanel',
    args: {
        panel: 'panel-026',
        appearance: 'solid',
        borderColor: lightUiColors.panel.parchment,
        backgroundColor: lightUiColors.panel.parchment,
    },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        panel: { control: 'select', options: variants },
        appearance: {
            control: 'select',
            options: ['solid', 'transparent-border', 'transparent-center'],
        },
        borderColor: { control: 'text' },
        backgroundColor: { control: 'text' },
    },
} satisfies Meta<PanelArgs>
export default meta
type Story = StoryObj<PanelArgs>

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
    return renderVueStory(FantasyPanelStory, { section, foreground: canvasForeground(globals) })
}

export const Default: Story = {
    render(args, context) {
        const host = renderVueStory(
            () =>
                h(
                    FantasyPanel,
                    {
                        ...args,
                        borderColor: args.borderColor || undefined,
                        backgroundColor: args.backgroundColor || undefined,
                        role: 'region',
                        'aria-label': 'FantasyPanel',
                        'data-testid': 'panel-default',
                        style: { width: 'min(560px, 100%)', padding: '16px' },
                    },
                    () =>
                        h(
                            'span',
                            { style: { color: lightUiColors.panel.text } },
                            'Панель с содержимым'
                        )
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
export const Appearances: Story = {
    parameters: { controls: { disable: true } },
    render: (_args, context) => preview('appearances', context.globals),
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
