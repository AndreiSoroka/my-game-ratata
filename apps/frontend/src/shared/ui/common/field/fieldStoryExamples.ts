import { type Component, h, ref, type VNode } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'

export interface FieldStoryArgs {
    label: string
    modelValue: string
    placeholder: string
    border: FantasyBorderVariant
    disabled: boolean
    readonly: boolean
    required: boolean
    invalid: boolean
    maxlength?: number
    onValueUpdate: (value: string) => void
}

export const fieldStoryArgTypes = {
    label: { control: 'text' },
    modelValue: { control: 'text' },
    placeholder: { control: 'text' },
    border: {
        control: 'select',
        options: Array.from(
            { length: 32 },
            (_, index) => `border-${String(index).padStart(3, '0')}`
        ),
    },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    required: { control: 'boolean' },
    invalid: { control: 'boolean' },
    maxlength: { control: { type: 'number', min: 1, step: 1 } },
    onValueUpdate: { control: false, table: { disable: true } },
} as const

type FieldSlots = (value: string) => Record<string, (() => VNode) | undefined>

function fieldPreview(component: Component, args: FieldStoryArgs, slots?: FieldSlots) {
    const { label, onValueUpdate, ...props } = args
    const value = ref(props.modelValue)
    return () =>
        h(
            component,
            {
                ...props,
                'aria-label': label,
                modelValue: value.value,
                'onUpdate:modelValue': (text: string) => {
                    value.value = text
                    onValueUpdate(text)
                },
            },
            slots?.(value.value)
        )
}

export function renderFieldStory(
    component: Component,
    args: FieldStoryArgs,
    slots?: FieldSlots
): HTMLElement {
    const host = renderVueStory({ setup: () => fieldPreview(component, args, slots) }, {})
    host.style.maxWidth = '460px'
    return host
}

export function renderFieldStates(component: Component, args: FieldStoryArgs): HTMLElement {
    const states = [
        { ...args, label: 'Пустое', modelValue: '' },
        { ...args, label: 'Ошибка', modelValue: 'Значение не принято', invalid: true },
        { ...args, label: 'Только чтение', modelValue: 'Сохранённый текст', readonly: true },
        { ...args, label: 'Недоступно', modelValue: 'Ввод недоступен', disabled: true },
    ]
    const host = renderVueStory(
        {
            setup() {
                const previews = states.map((state) => ({
                    label: state.label,
                    render: fieldPreview(component, state),
                }))
                return () =>
                    h(
                        'div',
                        {
                            'data-testid': 'ui-field-states',
                            style: {
                                display: 'grid',
                                gridTemplateColumns:
                                    'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                                gap: '20px',
                                maxWidth: '560px',
                            },
                        },
                        previews.map(({ label, render }) =>
                            h(
                                'div',
                                { key: label, style: { display: 'grid', gap: '8px', minWidth: 0 } },
                                [h('span', label), render()]
                            )
                        )
                    )
            },
        },
        {}
    )
    return host
}
