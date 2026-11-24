<script setup lang="ts">
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { darkPanelButtonColors, UiButton } from '@/shared/ui/common'

import type { DialogueNeighbors } from '../model/dialogue'

const props = withDefaults(
    defineProps<{ neighbors: DialogueNeighbors; tabbable?: boolean; disabled?: boolean }>(),
    { tabbable: true, disabled: false }
)
const emit = defineEmits<{ switchTarget: [key: string] }>()
const directions = ['left', 'right'] as const
const labels = {
    left: 'game.conversation.switchTargetLeft',
    right: 'game.conversation.switchTargetRight',
} as const
const targets = computed(() =>
    directions.flatMap((direction) => {
        const neighbor = props.neighbors[direction]
        return neighbor ? [{ ...neighbor, direction }] : []
    })
)
</script>

<template>
    <div v-if="targets.length" class="dialogue-target-switcher">
        <UiButton
            v-for="{ direction, key, name } in targets"
            :key="direction"
            class="dialogue-target-switcher__button"
            :class="`dialogue-target-switcher__button--${direction}`"
            appearance="panel"
            panel="panel-001"
            :colors="darkPanelButtonColors"
            :data-dialogue-target-switch="key"
            :aria-label="tGame(labels[direction], { name })"
            :title="name"
            :tabindex="tabbable ? undefined : -1"
            :disabled="disabled"
            @click="emit('switchTarget', key)"
        >
            <span aria-hidden="true" class="dialogue-target-switcher__arrow">
                {{ direction === 'left' ? '←' : '→' }}
            </span>
            <span class="dialogue-target-switcher__name">{{ name }}</span>
        </UiButton>
    </div>
</template>

<style scoped>
.dialogue-target-switcher {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-inline-size: 0;
    gap: 6px;
}

.dialogue-target-switcher__button {
    --ui-button-panel-padding: 4px 6px;
    min-inline-size: 0;
    min-block-size: 36px;
    font-size: 12px;
}

.dialogue-target-switcher__button--left {
    grid-column: 1;
}

.dialogue-target-switcher__button--right {
    grid-column: 2;
}

.dialogue-target-switcher__button :deep(.ui-button__panel) {
    min-inline-size: 0;
}

.dialogue-target-switcher__button :deep(.ui-button__content) {
    display: flex;
    align-items: center;
    gap: 4px;
}

.dialogue-target-switcher__button--right .dialogue-target-switcher__arrow {
    order: 1;
}

.dialogue-target-switcher__arrow {
    flex: none;
    font:
        600 16px/1 system-ui,
        sans-serif;
}

.dialogue-target-switcher__name {
    min-inline-size: 0;
    overflow-wrap: anywhere;
}
</style>
