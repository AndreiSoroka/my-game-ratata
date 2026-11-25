<script setup lang="ts" generic="T = string">
import './uiField.css'

import { computed, getCurrentInstance, ref, useAttrs } from 'vue'

import { FantasyBorder } from '@/shared/ui/external/fantasy-ui-borders/border'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import { nativeField } from './nativeField'
import type { UiInputProps } from './uiField'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<UiInputProps & { modelValue?: T }>(), {
    border: 'border-017',
    type: 'text',
    focusRing: true,
    framed: true,
})
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
const model = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value as T),
})
const instance = getCurrentInstance()
const attrs = useAttrs()
const theme = useDarkPanelTheme()
const element = ref<HTMLInputElement | null>(null)
const choice = computed(() => props.type === 'checkbox' || props.type === 'radio')
const decorated = computed(() => props.framed && !choice.value && props.type !== 'range')

function NativeInput() {
    return nativeField({
        tag: 'input',
        attrs: {
            ...attrs,
            ...(choice.value ? { 'data-focus-ring': props.focusRing } : {}),
            ...(props.invalid ? { 'aria-invalid': true } : {}),
        },
        model,
        modifiers:
            (attrs.modelModifiers as Partial<Record<'number' | 'trim' | 'lazy', boolean>>) ?? {},
        modeled: Object.hasOwn(instance?.vnode.props ?? {}, 'modelValue'),
        type: props.type,
        controlClass: choice.value ? 'ui-input__choice-control' : undefined,
        bind: (control) => {
            element.value = control as HTMLInputElement | null
        },
    })
}

defineExpose({
    element,
    focus: (options?: FocusOptions) => element.value?.focus(options),
    select: () => element.value?.select(),
})
</script>

<template>
    <NativeInput v-if="choice && !$slots.leading && !$slots.trailing" />
    <component
        v-else
        :is="decorated ? FantasyBorder : 'span'"
        class="ui-field ui-input"
        :class="{ 'ui-input--choice': choice }"
        :data-focus-ring="focusRing"
        :style="decorated ? darkPanelThemeStyle(theme) : undefined"
        v-bind="
            decorated
                ? {
                      as: 'span',
                      border: theme?.border ?? border,
                      borderWidth,
                      color: 'var(--ui-field-border)',
                  }
                : {}
        "
    >
        <span v-if="$slots.leading" class="ui-field__adornment"><slot name="leading" /></span>
        <NativeInput />
        <span v-if="$slots.trailing" class="ui-field__adornment"><slot name="trailing" /></span>
    </component>
</template>
