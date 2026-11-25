<script setup lang="ts" generic="T = string">
import './uiField.css'

import { computed, getCurrentInstance, ref, useAttrs, useSlots } from 'vue'

import { FantasyBorder } from '@/shared/ui/external/fantasy-ui-borders/border'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import { nativeField } from './nativeField'
import type { UiSelectProps } from './uiField'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<UiSelectProps & { modelValue?: T }>(), {
    border: 'border-017',
    focusRing: true,
})
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
const model = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value as T),
})
const instance = getCurrentInstance()
const attrs = useAttrs()
const slots = useSlots()
const theme = useDarkPanelTheme()
const element = ref<HTMLSelectElement | null>(null)

function NativeSelect() {
    return nativeField({
        tag: 'select',
        attrs: props.invalid ? { ...attrs, 'aria-invalid': true } : attrs,
        model,
        modifiers: (attrs.modelModifiers as Partial<Record<'number', boolean>>) ?? {},
        modeled: Object.hasOwn(instance?.vnode.props ?? {}, 'modelValue'),
        children: slots.default?.(),
        bind: (control) => {
            element.value = control as HTMLSelectElement | null
        },
    })
}

defineExpose({ element, focus: (options?: FocusOptions) => element.value?.focus(options) })
</script>

<template>
    <FantasyBorder
        as="span"
        class="ui-field ui-select"
        :border="theme?.border ?? border"
        :border-width="borderWidth"
        :data-focus-ring="focusRing"
        :style="darkPanelThemeStyle(theme)"
        color="var(--ui-field-border)"
    >
        <NativeSelect />
    </FantasyBorder>
</template>
