import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import { UiButton, type UiButtonProps } from './index'
import UiButtonStory from './UiButtonStory.vue'

type ButtonArgs = UiButtonProps & { label: string; onClick: (event: MouseEvent) => void }
const onClick = fn().mockName('click')
const borders = Array.from({ length: 32 }, (_, index) => `border-${String(index).padStart(3, '0')}`)
const panels = Array.from({ length: 32 }, (_, index) => `panel-${String(index).padStart(3, '0')}`)
const meta = {
    title: 'Shared/Common/UiButton',
    args: {
        label: 'Продолжить',
        border: 'border-026',
        appearance: 'filled',
        panel: 'panel-004',
        panelAppearance: 'solid',
        variant: 'secondary',
        disabled: false,
        focusRing: true,
        type: 'button',
        onClick,
    },
    argTypes: {
        label: { control: 'text' },
        border: { control: 'select', options: borders },
        appearance: { control: 'select', options: ['filled', 'ghost', 'panel'] },
        panel: { control: 'select', options: panels, if: { arg: 'appearance', eq: 'panel' } },
        panelAppearance: {
            control: 'select',
            options: ['solid', 'transparent-center'],
            if: { arg: 'appearance', eq: 'panel' },
        },
        variant: { control: 'select', options: ['secondary', 'primary', 'success', 'danger'] },
        colors: { control: 'object' },
        highlighted: { control: 'boolean' },
        focusRing: { control: 'boolean' },
        disabled: { control: 'boolean' },
        type: { control: 'select', options: ['button', 'submit', 'reset'] },
        onClick: { control: false, table: { disable: true } },
    },
} satisfies Meta<ButtonArgs>
export default meta
type Story = StoryObj<ButtonArgs>

function preview(section: string): HTMLElement {
    const host = renderVueStory(
        UiButtonStory,
        { section, onButtonClick: onClick },
        { background: lightUiColors.panel.coffee, padding: '0' }
    )
    host.style.minHeight = '100dvh'
    return host
}

export const Default: Story = {
    render: ({ label, ...args }) =>
        renderVueStory(
            {
                render: () =>
                    h(UiButton, { ...args, 'data-testid': 'ui-button-default' }, () => label),
            },
            {}
        ),
}
export const Appearances: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('appearances'),
}
export const Variants: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('variants'),
}
export const Borders: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('borders'),
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('colors'),
}
export const States: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('states'),
}
export const PanelStates: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('panel-states'),
}
