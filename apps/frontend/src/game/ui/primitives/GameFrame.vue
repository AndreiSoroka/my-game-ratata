<script setup lang="ts">
import './gameUi.css'

withDefaults(
    defineProps<{
        variant?: 'window' | 'panel' | 'inset' | 'speech'
        skin?: 'default' | 'parchment'
    }>(),
    { variant: 'panel', skin: 'default' }
)
</script>

<template>
    <span
        class="game-frame"
        :class="[`game-frame--${variant}`, { 'game-frame--parchment': skin === 'parchment' }]"
        aria-hidden="true"
    />
</template>
