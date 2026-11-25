<script setup lang="ts">
import './automationControls.css'

import { getWorldLocationDefinition, type MarkerDefinition } from '@my-game-ratata/contracts'
import { ref, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'
import { UiFrame } from '@/shared/ui/common'
import { UiInput } from '@/shared/ui/common'

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
    <AutomationWindow :title="tGame('game.automation.markers')" @close="emit('close')">
        <div class="automation-form">
            <p class="automation-muted">
                {{ tGame('game.automation.nPlacesMarkerWhereYour') }}
            </p>
            <form class="automation-row" @submit.prevent="create">
                <label>
                    {{ tGame('game.automation.newMarkerName') }}
                    <UiInput
                        :border-width="4"
                        v-model="name"
                        maxlength="80"
                        :placeholder="tGame('game.automation.nextNumber')"
                    />
                </label>
                <UiButton
                    variant="primary"
                    type="submit"
                    :disabled="!available || markers.length >= 64"
                >
                    {{ tGame('game.automation.placeHere') }}
                </UiButton>
            </form>
            <p v-if="!markers.length" class="automation-muted">
                {{ tGame('game.automation.noMarkersPlacedYet') }}
            </p>
            <ol v-else class="automation-list marker-list">
                <li
                    v-for="marker in markers"
                    :key="marker.id"
                    class="automation-card game-frame-host"
                >
                    <UiFrame variant="panel" />
                    <div class="automation-row">
                        <strong class="marker-number">{{ marker.number }}</strong>
                        <label>
                            {{ tGame('game.automation.markerName') }} {{ marker.number }}
                            <UiInput :border-width="4" v-model="names[marker.id]" maxlength="80" />
                        </label>
                    </div>
                    <p class="automation-muted">
                        {{
                            getWorldLocationDefinition(marker.locationId)?.name ?? marker.locationId
                        }}
                        · {{ Math.round(marker.position.x) }}, {{ Math.round(marker.position.y) }}
                    </p>
                    <div class="automation-row">
                        <UiButton
                            :disabled="!available || !names[marker.id]?.trim()"
                            :aria-label="
                                tGame('game.automation.renameMarker', { number: marker.number })
                            "
                            @click="rename(marker.id)"
                        >
                            {{ tGame('game.automation.rename') }}
                        </UiButton>
                        <UiButton
                            variant="danger"
                            :disabled="!available"
                            :aria-label="
                                tGame('game.automation.deleteMarker', { number: marker.number })
                            "
                            @click="emit('delete', marker.id)"
                        >
                            {{ tGame('game.automation.delete') }}
                        </UiButton>
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
    background: var(--ui-light-panel-parchment);
    color: var(--ui-light-panel-title);
    border-radius: 50%;
}
</style>
