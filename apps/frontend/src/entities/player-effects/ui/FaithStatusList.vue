<script setup lang="ts">
import { computed } from 'vue'

import { HudRow } from '@/shared/ui/common/hud-row'
import { FantasyDivider } from '@/shared/ui/external/fantasy-ui-borders/divider'

import type { PatronStatusEntry } from '../model/patronStatus'
import FaithStatus from './FaithStatus.vue'

const props = defineProps<{ patrons: readonly PatronStatusEntry[] }>()
const sortedPatrons = computed(() =>
    props.patrons
        .filter((patron) => patron.name.trim())
        .sort((left, right) => (right.level ?? 0) - (left.level ?? 0))
)
</script>

<template>
    <div v-if="sortedPatrons.length" class="faith-status-list">
        <HudRow>
            <FantasyDivider
                class="faith-status-list__divider"
                divider="divider-002"
                ends="right"
                fade
                color="var(--ui-dark-panel-divider)"
                aria-hidden="true"
            />
        </HudRow>
        <FaithStatus
            v-for="patron in sortedPatrons"
            :key="patron.id"
            :patron-name="patron.name"
            :patron-mastery-level="patron.level"
            :patron-mood="patron.mood"
        />
    </div>
</template>

<style scoped>
.faith-status-list {
    --faith-status-icon-size: 10px;
    display: grid;
    flex: none;
    gap: 3px;
    min-width: 0;
    margin-block-start: 4px;
    font-family: var(--ratata-font-family, sans-serif);
}

.faith-status-list :deep(.hud-row) {
    --hud-row-leading-width: 16px;
    column-gap: 4px;
    font-size: 10px;
}

.faith-status-list__divider {
    height: 4px;
    min-height: 4px;
}
</style>
