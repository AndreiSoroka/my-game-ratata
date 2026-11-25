<script setup lang="ts">
import { UiButton, UiFrame } from '@/shared/ui/common'
defineProps<{ name: string; enabled: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>
<template>
    <div class="build-status game-frame-host">
        <UiFrame variant="panel" />
        <span>{{ enabled ? 'Звезда включена в набор' : 'Звезда не включена' }}</span>
        <UiButton
            size="compact"
            role="switch"
            data-testid="selected-star-toggle"
            :aria-label="`В наборе: ${name}`"
            :aria-checked="enabled"
            @click="emit('toggle')"
        >
            {{ enabled ? 'Отключить' : 'Включить' }}
        </UiButton>
    </div>
</template>
<style scoped>
.build-status {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-bottom: 0;
    color: #b8cbd3;
    font-size: 12px;
}
button {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid transparent;
    cursor: pointer;
}
</style>
