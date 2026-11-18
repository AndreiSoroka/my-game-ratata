<script setup lang="ts" generic="T = string">
import './gameUi.css'

import { computed, getCurrentInstance, ref, useAttrs } from 'vue'

import { nativeField } from './nativeField'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ modelValue?: T; type?: string }>(), { type: 'text' })
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
const model = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value as T),
})
const instance = getCurrentInstance()
const attrs = useAttrs()
const element = ref<HTMLInputElement>()
function NativeInput() {
    return nativeField({
        tag: 'input',
        attrs,
        model,
        modifiers:
            (attrs.modelModifiers as Partial<Record<'number' | 'trim' | 'lazy', boolean>>) ?? {},
        modeled: Object.hasOwn(instance?.vnode.props ?? {}, 'modelValue'),
        type: props.type,
        bind: (value) => {
            element.value = value as HTMLInputElement | undefined
        },
    })
}
defineExpose({
    focus: () => element.value?.focus(),
    select: () => element.value?.select(),
    element,
})
</script>

<template><NativeInput /></template>
