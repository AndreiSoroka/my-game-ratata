<script setup lang="ts">
defineProps<{ name: string; enabled: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>
<template>
    <div class="build-status">
        <span>{{ enabled ? 'Звезда включена в набор' : 'Звезда не включена' }}</span>
        <button
            type="button"
            role="switch"
            data-testid="selected-star-toggle"
            :aria-label="`В наборе: ${name}`"
            :aria-checked="enabled"
            @click="emit('toggle')"
        >
            {{ enabled ? 'Отключить' : 'Включить' }}
        </button>
    </div>
</template>
<style scoped>
.build-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid #425f6d;
    border-bottom: 0;
    background: #10232d;
    color: #b8cbd3;
    font-size: 12px;
}
button {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid #68818b;
    background: #0b202b;
    color: #eee6d2;
    font: inherit;
    cursor: pointer;
}
button[aria-checked='true'] {
    border-color: #d7b96f;
    color: #f0d89c;
}
button:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: 2px;
}
</style>
