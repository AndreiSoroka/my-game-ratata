<script setup lang="ts">
import './gameUi.css'

withDefaults(defineProps<{ variant?: 'window' | 'panel' | 'inset' | 'speech' }>(), {
    variant: 'panel',
})
</script>

<template>
    <span class="game-frame" :class="`game-frame--${variant}`" aria-hidden="true" />
</template>
