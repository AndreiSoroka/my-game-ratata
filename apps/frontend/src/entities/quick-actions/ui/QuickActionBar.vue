<script setup lang="ts">
import { HudFrame } from '@/shared/ui/common'

import type { QuickAction } from '../model/quickAction'
import QuickActionSlot from './QuickActionSlot.vue'

defineProps<{
    actions: readonly (QuickAction | null)[]
    blocked?: boolean
    waiting?: string | undefined
}>()
const emit = defineEmits<{
    activate: [index: number]
    assign: [index: number]
    clear: [index: number]
}>()
</script>

<template>
    <div class="quick-action-bar" role="group" aria-label="Быстрые действия">
        <p v-if="waiting" class="hotbar-waiting" role="status">{{ waiting }}</p>
        <HudFrame>
            <div class="quick-action-bar__slots">
                <QuickActionSlot
                    v-for="(action, index) in actions"
                    :key="index"
                    :action="action"
                    :number="index + 1"
                    :blocked="blocked"
                    @activate="emit('activate', index)"
                    @assign="emit('assign', index)"
                    @clear="emit('clear', index)"
                />
            </div>
        </HudFrame>
        <p class="quick-action-bar__hint">1–4 · Дважды: повтор · Shift: назначить</p>
    </div>
</template>

<style scoped>
.quick-action-bar {
    --quick-action-size: 50px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
    inline-size: 272px;
    max-inline-size: 100%;
    color: var(--ui-dark-panel-title);
}

.quick-action-bar__slots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 9px 7px;
    min-inline-size: 0;
}

.quick-action-bar__hint,
.hotbar-waiting {
    margin: 0;
    text-align: center;
    line-height: 1.2;
}

.quick-action-bar__hint {
    font-size: 10px;
    text-shadow: 0 1px var(--ui-dark-panel-surface);
}

.hotbar-waiting {
    justify-self: center;
    border: 1px solid var(--ui-dark-panel-divider);
    padding: 3px 6px;
    background: var(--ui-dark-panel-surface);
    font-size: 13px;
}
</style>
