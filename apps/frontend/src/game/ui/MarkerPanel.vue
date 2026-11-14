<script setup lang="ts">
import './automationControls.css'

import { getWorldLocationDefinition, type MarkerDefinition } from '@my-game-ratata/contracts'
import { ref, watch } from 'vue'

import AutomationWindow from './AutomationWindow.vue'

const props = defineProps<{ markers: MarkerDefinition[]; available: boolean }>()
const emit = defineEmits<{
    close: []
    create: [name?: string]
    rename: [markerId: string, name: string]
    delete: [markerId: string]
}>()
const name = ref('')
const names = ref<Record<string, string>>({})
watch(
    () => props.markers,
    (markers) => {
        for (const marker of markers) names.value[marker.id] ??= marker.name
    },
    { immediate: true }
)
function create(): void {
    emit('create', name.value.trim() || undefined)
    name.value = ''
}
function rename(markerId: string): void {
    const value = names.value[markerId]?.trim()
    if (value) emit('rename', markerId, value)
}
</script>

<template>
    <AutomationWindow title="Метки" @close="emit('close')">
        <div class="automation-form">
            <p class="automation-muted">
                N ставит метку там, где стоит персонаж. Метки видны только вам и остаются до конца
                жизни персонажа.
            </p>
            <form class="automation-row" @submit.prevent="create">
                <label>
                    Название новой метки
                    <input v-model="name" maxlength="80" placeholder="Следующий номер" />
                </label>
                <button type="submit" :disabled="!available || markers.length >= 64">
                    Поставить здесь
                </button>
            </form>
            <p v-if="!markers.length" class="automation-muted">Метки пока не поставлены.</p>
            <ol v-else class="automation-list marker-list">
                <li v-for="marker in markers" :key="marker.id" class="automation-card">
                    <div class="automation-row">
                        <strong class="marker-number">{{ marker.number }}</strong>
                        <label>
                            Название метки {{ marker.number }}
                            <input v-model="names[marker.id]" maxlength="80" />
                        </label>
                    </div>
                    <p class="automation-muted">
                        {{
                            getWorldLocationDefinition(marker.locationId)?.name ?? marker.locationId
                        }}
                        · {{ Math.round(marker.position.x) }}, {{ Math.round(marker.position.y) }}
                    </p>
                    <div class="automation-row">
                        <button
                            type="button"
                            :disabled="!available || !names[marker.id]?.trim()"
                            :aria-label="`Переименовать метку ${marker.number}`"
                            @click="rename(marker.id)"
                        >
                            Переименовать
                        </button>
                        <button
                            type="button"
                            :disabled="!available"
                            :aria-label="`Удалить метку ${marker.number}`"
                            @click="emit('delete', marker.id)"
                        >
                            Удалить
                        </button>
                    </div>
                </li>
            </ol>
        </div>
    </AutomationWindow>
</template>

<style scoped>
.marker-list {
    padding: 0;
    margin: 0;
    list-style: none;
}
.marker-number {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    background: #d6b56d;
    color: #1a211c;
    border-radius: 50%;
}
</style>
