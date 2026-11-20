<script setup lang="ts">
import { type PlayerEffectsData, PlayerEffectsView } from '@/entities/character'

defineProps<PlayerEffectsData>()
</script>

<template>
    <PlayerEffectsView v-bind="$props" />
</template>
