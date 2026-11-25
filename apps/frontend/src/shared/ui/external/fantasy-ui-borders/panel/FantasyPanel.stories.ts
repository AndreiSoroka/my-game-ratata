import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import FantasyPanelStory from './FantasyPanelStory.vue'
import { FantasyPanel, type FantasyPanelProps, type FantasyPanelVariant } from './index'

type PanelArgs = Omit<FantasyPanelProps, 'backgroundGradient'> & {
    gradientTop: string
    gradientBottom: string
    slotContent: StorySlot
}
type Section = 'variants' | 'appearances' | 'colors' | 'composition' | 'sizes'
const variants = Array.from(
    { length: 32 },
    (_, index) => `panel-${String(index).padStart(3, '0')}` as FantasyPanelVariant
)
const meta = {
    title: 'Shared/External/fantasy-ui-borders/FantasyPanel',
    args: {
        as: 'div',
        panel: 'panel-026',
        appearance: 'solid',
        color: 'currentColor',
        borderColor: lightUiColors.panel.parchment,
        backgroundColor: lightUiColors.panel.parchment,
        gradientTop: '',
        gradientBottom: '',
        slotContent: 'text',
    },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        as: { control: 'select', options: ['div', 'span'] },
        panel: { control: 'select', options: variants },
        appearance: {
            control: 'select',
            options: ['solid', 'transparent-border', 'transparent-center'],
        },
        color: {
            control: 'text',
            description: 'Fallback for an empty border or background color.',
        },
        borderColor: { control: 'text' },
        backgroundColor: { control: 'text' },
        gradientTop: { name: 'Gradient top color', control: 'text' },
        gradientBottom: { name: 'Gradient bottom color', control: 'text' },
        slotContent: storySlotControl('Содержимое слота'),
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
        const { gradientTop, gradientBottom, slotContent, ...props } = args
        const host = renderVueStory(
            () =>
                h(
                    FantasyPanel,
                    {
                        ...props,
                        borderColor: props.borderColor || undefined,
                        backgroundColor: props.backgroundColor || undefined,
                        backgroundGradient:
                            gradientTop && gradientBottom
                                ? [gradientTop, gradientBottom]
                                : undefined,
                        role: 'region',
                        'aria-label': 'FantasyPanel',
                        'data-testid': 'panel-default',
                        style: {
                            display: props.as === 'span' ? 'inline-block' : undefined,
                            width: 'min(560px, 100%)',
                            padding: '16px',
                        },
                    },
                    {
                        default:
                            slotContent === 'text'
                                ? () =>
                                      h(
                                          'span',
                                          { style: { color: lightUiColors.panel.text } },
                                          'Панель с содержимым'
                                      )
                                : storySlot(
                                      slotContent,
                                      'Панель с содержимым',
                                      () => h('strong', 'Записка у городских ворот'),
                                      { inline: props.as === 'span' }
                                  ),
                    }
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
