<script setup lang="ts">
import type { ConstellationNodeSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
import { useTemplateRef } from 'vue'

import { ConstellationGraph, ConstellationStarCard } from '@/entities/constellations'

defineProps<{
    constellation: ConstellationSnapshot
    selectedStar?: ConstellationNodeSnapshot
    enabledStarIds?: ReadonlySet<string>
    mapId?: string
    mapKey?: number
}>()
const emit = defineEmits<{ select: [id: string]; activate: [id: string] }>()
defineSlots<{ sidebar?: (props: { node?: ConstellationNodeSnapshot }) => unknown }>()
const graph = useTemplateRef<InstanceType<typeof ConstellationGraph>>('graph')
defineExpose({ focusNode: (id: string) => graph.value?.focusNode(id) })
</script>

<template>
    <div>
        <ConstellationGraph
            :id="mapId"
            :key="mapKey"
            ref="graph"
            :constellation="constellation"
            :selected-id="selectedStar?.id"
            :enabled-star-ids="enabledStarIds"
            @select="emit('select', $event)"
            @activate="emit('activate', $event)"
        />
        <slot name="sidebar" :node="selectedStar">
            <ConstellationStarCard v-if="selectedStar" :node="selectedStar" />
        </slot>
    </div>
</template>
