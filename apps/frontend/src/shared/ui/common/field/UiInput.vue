<script setup lang="ts">
import './uiField.css'

import { useTemplateRef } from 'vue'

import { FantasyBorder } from '@/shared/ui/external/fantasy-ui-borders/border'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import type { UiInputProps } from './uiField'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<UiInputProps>(), {
    border: 'border-017',
    borderWidth: 8,
    type: 'text',
    focusRing: true,
    framed: true,
})
const model = defineModel<string>({ default: '' })
const theme = useDarkPanelTheme()
const element = useTemplateRef<HTMLInputElement>('element')

defineExpose({
    element,
    focus: (options?: FocusOptions) => element.value?.focus(options),
    select: () => element.value?.select(),
})
</script>

<template>
    <component
        :is="framed ? FantasyBorder : 'div'"
        class="ui-field ui-input"
        :data-focus-ring="focusRing"
        :style="framed ? darkPanelThemeStyle(theme) : undefined"
        v-bind="
            framed
                ? { border: theme?.border ?? border, borderWidth, color: 'var(--ui-field-border)' }
                : {}
        "
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
    </component>
</template>
