<script setup lang="ts">
import './gameUi.css'

withDefaults(
    defineProps<{
        variant?: 'secondary' | 'primary' | 'success' | 'danger' | 'slot'
        skin?: 'default' | 'fantasy'
        size?: 'default' | 'compact'
        icon?: boolean
        disabled?: boolean
        type?: 'button' | 'submit' | 'reset'
    }>(),
    {
        variant: 'secondary',
        skin: 'default',
        size: 'default',
        icon: false,
        disabled: false,
        type: 'button',
    }
)
</script>

<template>
    <button
        :type="type"
        :disabled="disabled"
        class="game-button"
        :class="[
            `game-button--${variant}`,
            `game-button--${size}`,
            { 'game-button--icon': icon, 'game-button--fantasy': skin === 'fantasy' },
        ]"
    >
        <slot />
    </button>
</template>
