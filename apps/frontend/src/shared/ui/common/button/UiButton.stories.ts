import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import type { UiButtonProps } from './index'
import UiButtonStory from './UiButtonStory.vue'

type ButtonArgs = UiButtonProps & { label: string; onClick: (event: MouseEvent) => void }
const onClick = fn().mockName('click')
const borders = Array.from({ length: 32 }, (_, index) => `border-${String(index).padStart(3, '0')}`)
const meta = {
    title: 'Shared/Common/Button',
    args: {
        label: 'Продолжить',
        border: 'border-026',
        appearance: 'filled',
        variant: 'secondary',
        disabled: false,
        focusRing: true,
        type: 'button',
        onClick,
    },
    argTypes: {
        label: { control: 'text' },
        border: { control: 'select', options: borders },
        appearance: { control: 'select', options: ['filled', 'ghost'] },
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

function preview(section: string, args: Partial<ButtonArgs> = {}): HTMLElement {
    const { onClick: onButtonClick = onClick, ...buttonArgs } = args
    const host = renderVueStory(
        UiButtonStory,
        { section, ...buttonArgs, onButtonClick },
        { background: lightUiColors.panel.coffee, padding: '0' }
    )
    host.style.minHeight = '100dvh'
    return host
}

export const Default: Story = { render: (args) => preview('default', args) }
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
