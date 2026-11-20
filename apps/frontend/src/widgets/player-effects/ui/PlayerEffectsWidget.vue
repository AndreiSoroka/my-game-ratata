<script setup lang="ts">
import { type PlayerEffect, PlayerEffectsView } from '@/entities/character'

defineProps<{ effects: readonly PlayerEffect[] }>()
</script>

<template>
    <PlayerEffectsView :effects="effects" />
</template>
