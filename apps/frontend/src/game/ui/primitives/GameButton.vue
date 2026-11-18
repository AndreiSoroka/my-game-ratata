<script setup lang="ts">
import './gameUi.css'

withDefaults(
    defineProps<{
        variant?: 'secondary' | 'primary' | 'success' | 'danger' | 'slot'
        size?: 'default' | 'compact'
        icon?: boolean
        disabled?: boolean
        type?: 'button' | 'submit' | 'reset'
    }>(),
    { variant: 'secondary', size: 'default', icon: false, disabled: false, type: 'button' }
)
</script>

<template>
    <button
        :type="type"
        :disabled="disabled"
        class="game-button"
        :class="[`game-button--${variant}`, `game-button--${size}`, { 'game-button--icon': icon }]"
    >
        <slot />
    </button>
</template>
