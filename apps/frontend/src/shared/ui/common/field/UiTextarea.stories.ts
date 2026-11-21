import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import {
    type FieldStoryArgs,
    fieldStoryArgTypes,
    renderFieldStates,
    renderFieldStory,
} from './fieldStoryExamples'
import UiTextarea from './UiTextarea.vue'

interface TextareaArgs extends FieldStoryArgs {
    rows: number
}

const meta = {
    title: 'Shared/Common/UiTextarea',
    args: {
        label: 'Заметка',
        modelValue: 'У старой башни идёт дождь.\nВернёмся до заката.',
        placeholder: 'Введите заметку…',
        border: 'border-017',
        disabled: false,
        readonly: false,
        required: false,
        invalid: false,
        maxlength: 240,
        rows: 3,
        onValueUpdate: fn().mockName('update:modelValue'),
    },
    argTypes: {
        ...fieldStoryArgTypes,
        rows: { control: { type: 'number', min: 2, max: 8, step: 1 } },
    },
    render: (args) => renderFieldStory(UiTextarea, args),
} satisfies Meta<TextareaArgs>

export default meta
type Story = StoryObj<TextareaArgs>

export const Default: Story = {}

export const States: Story = {
    parameters: { controls: { disable: true } },
    render: (args) => renderFieldStates(UiTextarea, args),
}
