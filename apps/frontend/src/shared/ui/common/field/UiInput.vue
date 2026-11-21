<script setup lang="ts">
import './uiField.css'

import { useTemplateRef } from 'vue'

import { FantasyBorder } from '@/shared/ui/external/fantasy-ui-borders/border'

import type { UiInputProps } from './uiField'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<UiInputProps>(), { border: 'border-017', type: 'text' })
const model = defineModel<string>({ default: '' })
const element = useTemplateRef<HTMLInputElement>('element')

defineExpose({
    element,
    focus: (options?: FocusOptions) => element.value?.focus(options),
    select: () => element.value?.select(),
})
</script>

<template>
    <FantasyBorder
        class="ui-field ui-input"
        :border="border"
        :border-width="8"
        color="var(--ui-field-border)"
    >
        <span v-if="$slots.leading" class="ui-field__adornment"><slot name="leading" /></span>
        <input
            ref="element"
            v-bind="invalid ? { ...$attrs, 'aria-invalid': true } : $attrs"
            v-model="model"
            :type="type"
            class="ui-field__control"
        />
        <span v-if="$slots.trailing" class="ui-field__adornment"><slot name="trailing" /></span>
    </FantasyBorder>
</template>
