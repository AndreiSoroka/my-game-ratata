<script setup lang="ts">
import type { DeityId } from '@my-game-ratata/contracts'
import { computed, reactive, watch } from 'vue'

import { HudRow } from '@/shared/ui/common'
import { FantasyDivider } from '@/shared/ui/external'

import type { PatronStatusEntry } from '../model/patronStatus'
import FaithStatus from './FaithStatus.vue'

const props = defineProps<{ patrons: readonly PatronStatusEntry[] }>()
const sortedPatrons = computed(() =>
    props.patrons
        .filter((patron) => patron.name.trim())
        .sort((left, right) => (right.level ?? 0) - (left.level ?? 0))
)
const moodChanges = reactive(new Map<DeityId, number>())

watch(
    () => sortedPatrons.value.map(({ id, omen }) => [id, omen] as const),
    (omens, previousOmens) => {
        const current = new Map(omens)
        for (const [id, previousOmen] of previousOmens) {
            const omen = current.get(id)
            if (!omen) {
                moodChanges.delete(id)
            } else if (previousOmen && previousOmen !== omen) {
                moodChanges.set(id, (moodChanges.get(id) ?? 0) + 1)
            }
        }
    }
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
            :mood-change-id="moodChanges.get(patron.id)"
            :prayer-chances="patron.prayerChances"
            :changes-in-ms="patron.changesInMs"
        />
    </div>
</template>

<style scoped>
.faith-status-list {
    --faith-status-icon-size: 10px;
    --faith-status-font-size: 10px;
    --faith-status-text-inset: 20px;
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
    font-size: var(--faith-status-font-size);
}

.faith-status-list__divider {
    height: 4px;
    min-height: 4px;
}
</style>
