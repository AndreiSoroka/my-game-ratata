import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { RefreshIcon } from '../icons'
import {
    type FieldStoryArgs,
    fieldStoryArgTypes,
    renderFieldStates,
    renderFieldStory,
} from './fieldStoryExamples'
import UiInput from './UiInput.vue'

const inputTypes = [
    'text',
    'search',
    'email',
    'password',
    'tel',
    'url',
    'number',
    'checkbox',
    'radio',
    'range',
] as const

interface InputArgs extends FieldStoryArgs {
    type: (typeof inputTypes)[number]
    borderWidth?: number
    focusRing: boolean
    framed: boolean
    leading: 'none' | 'empty' | 'prompt' | 'icon'
    trailing: 'none' | 'empty' | 'text' | 'count'
}

const meta = {
    title: 'Shared/Common/UiInput',
    args: {
        label: 'Сообщение',
        modelValue: 'Встретимся у ворот.',
        placeholder: 'Введите сообщение…',
        border: 'border-017',
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
                labels: {
                    none: 'Без слота',
                    empty: 'Цветной блок',
                    prompt: 'Текст',
                    icon: 'Значок',
                },
            },
            options: ['none', 'empty', 'prompt', 'icon'],
        },
        trailing: {
            name: 'Правый слот (trailing)',
            control: {
                type: 'select',
                labels: {
                    none: 'Без слота',
                    empty: 'Цветной блок',
                    text: 'Текст',
                    count: 'Счётчик',
                },
            },
            options: ['none', 'empty', 'text', 'count'],
        },
    },
    render({ leading, trailing, ...args }) {
        const leadingSamples = {
            none: undefined,
            empty: () =>
                h('span', {
                    'data-testid': 'ui-input-empty-leading',
                    style: 'display:block;width:16px;height:14px;background:#a64440',
                }),
            prompt: () => h('span', { 'aria-hidden': 'true' }, '›'),
            icon: () => h(RefreshIcon, { width: 16, height: 16 }),
        }
        return renderFieldStory(UiInput, args, (value) => {
            const trailingSamples = {
                none: undefined,
                empty: () =>
                    h('span', {
                        'data-testid': 'ui-input-empty-trailing',
                        style: 'display:block;width:28px;height:14px;background:#265c97',
                    }),
                text: () => h('span', 'символов'),
                count: () => h('span', `${String(value).length} / ${args.maxlength ?? 240}`),
            }
            return { leading: leadingSamples[leading], trailing: trailingSamples[trailing] }
        })
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
