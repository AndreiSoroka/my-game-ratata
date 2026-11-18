<script setup lang="ts">
import './gameUi.css'

import { computed, getCurrentInstance, ref, useAttrs } from 'vue'

import { nativeField } from './nativeField'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const model = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value ?? ''),
})
const instance = getCurrentInstance()
const attrs = useAttrs()
const element = ref<HTMLTextAreaElement>()
function NativeTextarea() {
    return nativeField({
        tag: 'textarea',
        attrs,
        model,
        modifiers: (attrs.modelModifiers as Partial<Record<'trim' | 'lazy', boolean>>) ?? {},
        modeled: Object.hasOwn(instance?.vnode.props ?? {}, 'modelValue'),
        bind: (value) => {
            element.value = value as HTMLTextAreaElement | undefined
        },
    })
}
defineExpose({
    focus: () => element.value?.focus(),
    select: () => element.value?.select(),
    element,
})
</script>

<template><NativeTextarea /></template>
