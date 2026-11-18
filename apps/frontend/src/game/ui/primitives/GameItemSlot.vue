<script setup lang="ts">
import './gameUi.css'

withDefaults(
    defineProps<{
        as?: 'span' | 'button'
        selected?: boolean
        empty?: boolean
        disabled?: boolean
        quantity?: number
    }>(),
    { as: 'span', selected: false, empty: false, disabled: false, quantity: undefined }
)
</script>

<template>
    <component
        :is="as"
        class="game-item-slot"
        :class="{
            'game-item-slot--selected': selected,
            'game-item-slot--empty': empty,
            'game-item-slot--disabled': disabled,
        }"
        :type="as === 'button' ? 'button' : undefined"
        :disabled="as === 'button' ? disabled : undefined"
        :aria-disabled="disabled || undefined"
    >
        <slot />
        <b
            v-if="quantity !== undefined && quantity > 1"
            class="game-item-slot__quantity"
            aria-hidden="true"
            >{{ quantity }}</b
        >
    </component>
</template>
