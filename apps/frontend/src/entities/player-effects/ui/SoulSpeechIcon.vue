<script setup lang="ts">
defineProps<{ isCanSpeak?: boolean | undefined }>()
</script>

<template>
    <svg class="soul-speech-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M21 4H3v13h5v4l5-4h8z" />
        <path v-if="isCanSpeak" d="M7 9h10M7 12h7" />
        <path v-else d="m3 2 19 20" />
    </svg>
</template>

<style scoped>
.soul-speech-icon {
    display: block;
    flex: none;
    width: 1em;
    height: 1em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
}
</style>
