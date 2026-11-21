import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import {
    type FieldStoryArgs,
    fieldStoryArgTypes,
    renderFieldStates,
    renderFieldStory,
} from './fieldStoryExamples'
import UiInput from './UiInput.vue'

const inputTypes = ['text', 'search', 'email', 'password', 'tel', 'url'] as const

interface InputArgs extends FieldStoryArgs {
    type: (typeof inputTypes)[number]
    borderWidth: number
    focusRing: boolean
    framed: boolean
    leading: 'none' | 'empty' | 'prompt'
    trailing: 'none' | 'empty' | 'count'
}

const meta = {
    title: 'Shared/Common/UiInput',
    args: {
        label: 'Сообщение',
        modelValue: 'Встретимся у ворот.',
        placeholder: 'Введите сообщение…',
        border: 'border-017',
        borderWidth: 8,
        type: 'text',
        focusRing: true,
        framed: true,
        disabled: false,
        readonly: false,
        required: false,
        invalid: false,
        maxlength: 240,
        leading: 'none',
        trailing: 'none',
        onValueUpdate: fn().mockName('update:modelValue'),
    },
    argTypes: {
        ...fieldStoryArgTypes,
        type: { control: 'select', options: [...inputTypes] },
        borderWidth: { control: { type: 'number', min: 1, step: 1 } },
        focusRing: { control: 'boolean' },
        framed: { control: 'boolean' },
        leading: {
            name: 'Левый слот (leading)',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой span', prompt: 'Знак ввода' },
            },
            options: ['none', 'empty', 'prompt'],
        },
        trailing: {
            name: 'Правый слот (trailing)',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой span', count: 'Счётчик' },
            },
            options: ['none', 'empty', 'count'],
        },
    },
    render({ leading, trailing, ...args }) {
        const leadingSamples = {
            none: undefined,
            empty: () => h('span', { 'data-testid': 'ui-input-empty-leading' }),
            prompt: () => h('span', { 'aria-hidden': 'true' }, '›'),
        }
        return renderFieldStory(UiInput, args, (value) => ({
            leading: leadingSamples[leading],
            trailing:
                trailing === 'count'
                    ? () => h('span', `${value.length} / ${args.maxlength ?? 240}`)
                    : trailing === 'empty'
                      ? () => h('span', { 'data-testid': 'ui-input-empty-trailing' })
                      : undefined,
        }))
    },
} satisfies Meta<InputArgs>

export default meta
type Story = StoryObj<InputArgs>

export const Default: Story = {}

export const States: Story = {
    parameters: { controls: { disable: true } },
    render: ({ leading: _leading, trailing: _trailing, ...args }) =>
        renderFieldStates(UiInput, args),
}

export const WithSlots: Story = {
    args: { leading: 'prompt', trailing: 'count' },
}
