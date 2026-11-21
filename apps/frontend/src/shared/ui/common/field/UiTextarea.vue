<script setup lang="ts">
import './uiField.css'

import { useTemplateRef } from 'vue'

import { FantasyBorder } from '@/shared/ui/external/fantasy-ui-borders/border'

import type { UiFieldProps } from './uiField'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<UiFieldProps>(), { border: 'border-017' })
const model = defineModel<string>({ default: '' })
const element = useTemplateRef<HTMLTextAreaElement>('element')

defineExpose({
    element,
    focus: (options?: FocusOptions) => element.value?.focus(options),
    select: () => element.value?.select(),
})
</script>

<template>
    <FantasyBorder
        class="ui-field ui-textarea"
        :border="border"
        :border-width="8"
        color="var(--ui-field-border)"
    >
        <textarea
            ref="element"
            v-bind="invalid ? { ...$attrs, 'aria-invalid': true } : $attrs"
            v-model="model"
            class="ui-field__control"
        />
    </FantasyBorder>
</template>
