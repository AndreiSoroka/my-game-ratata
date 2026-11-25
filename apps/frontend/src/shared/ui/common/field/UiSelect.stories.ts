import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import { UiSelect, type UiSelectProps } from './index'

interface SelectArgs extends UiSelectProps {
    label: string
    modelValue: string
    disabled: boolean
    required: boolean
    optionsSlot: 'empty' | 'text' | 'example'
    onValueUpdate: (value: string) => void
}

const regions = [
    { name: 'Новогород', value: 'novogorod' },
    { name: 'Лесная опушка', value: 'forest' },
    { name: 'Северный тракт', value: 'road' },
]

const samples = {
    empty: () => h('option', { value: '', style: 'background:#265c97', 'aria-label': 'Пусто' }),
    text: () => h('option', { value: 'novogorod' }, 'Новогород'),
    example: () =>
        h(
            'optgroup',
            { label: 'Соседние места' },
            regions.map(({ name, value }) => h('option', { key: value, value }, name))
        ),
}

const meta = {
    title: 'Shared/Common/UiSelect',
    args: {
        label: 'Место',
        modelValue: 'novogorod',
        border: 'border-017',
        focusRing: true,
        disabled: false,
        required: false,
        invalid: false,
        optionsSlot: 'example',
        onValueUpdate: fn().mockName('update:modelValue'),
    },
    argTypes: {
        label: { control: 'text' },
        modelValue: { control: 'text' },
        border: {
            control: 'select',
            options: Array.from(
                { length: 32 },
                (_, index) => `border-${String(index).padStart(3, '0')}`
            ),
        },
        borderWidth: { control: { type: 'number', min: 1, step: 1 } },
        focusRing: { control: 'boolean' },
        disabled: { control: 'boolean' },
        required: { control: 'boolean' },
        invalid: { control: 'boolean' },
        optionsSlot: {
            name: 'Содержимое списка (default)',
            control: {
                type: 'select',
                labels: { empty: 'Пустой цветной пункт', text: 'Текст', example: 'Группа мест' },
            },
            options: ['empty', 'text', 'example'],
        },
        onValueUpdate: { control: false, table: { disable: true } },
    },
    render({ label, modelValue, optionsSlot, onValueUpdate, ...props }) {
        const host = renderVueStory(
            {
                setup() {
                    const value = ref(modelValue)
                    return () =>
                        h(
                            UiSelect<string>,
                            {
                                ...props,
                                'aria-label': label,
                                modelValue: value.value,
                                'onUpdate:modelValue': (next: string) => {
                                    value.value = next
                                    onValueUpdate(next)
                                },
                            },
                            samples[optionsSlot]
                        )
                },
            },
            {}
        )
        host.style.maxWidth = '460px'
        return host
    },
} satisfies Meta<SelectArgs>

export default meta
type Story = StoryObj<SelectArgs>

export const Default: Story = {}
export const Invalid: Story = { args: { invalid: true } }
export const Disabled: Story = { args: { disabled: true } }
