<script setup lang="ts" generic="T = string">
import './gameUi.css'

import { computed, getCurrentInstance, ref, useAttrs, useSlots } from 'vue'

import { nativeField } from './nativeField'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue?: T }>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
const model = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value as T),
})
const instance = getCurrentInstance()
const attrs = useAttrs()
const slots = useSlots()
const element = ref<HTMLSelectElement>()
function NativeSelect() {
    return nativeField({
        tag: 'select',
        attrs,
        model,
        modifiers: (attrs.modelModifiers as Partial<Record<'number', boolean>>) ?? {},
        modeled: Object.hasOwn(instance?.vnode.props ?? {}, 'modelValue'),
        children: slots.default?.(),
        bind: (value) => {
            element.value = value as HTMLSelectElement | undefined
        },
    })
}
defineExpose({ focus: () => element.value?.focus(), element })
</script>

<template><NativeSelect /></template>
