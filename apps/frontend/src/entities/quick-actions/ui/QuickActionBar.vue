<script setup lang="ts">
import { HudFrame } from '@/shared/ui/common'

import type { QuickAction } from '../model/quickAction'
import QuickActionSlot from './QuickActionSlot.vue'

defineProps<{
    actions: readonly (QuickAction | null)[]
    blocked?: boolean
    waiting?: string | undefined
    buttonAttrs?: Record<string, unknown>
}>()
const emit = defineEmits<{
    activate: [index: number]
    assign: [index: number]
    clear: [index: number]
}>()
</script>

<template>
    <div
        class="quick-action-bar"
        :class="{ 'quick-action-bar--with-trailing': $slots.trailing }"
        role="group"
        aria-label="Быстрые действия"
    >
        <p v-if="waiting" class="hotbar-waiting" role="status">{{ waiting }}</p>
        <HudFrame>
            <div class="quick-action-bar__slots">
                <QuickActionSlot
                    v-for="(action, index) in actions"
                    :key="index"
                    :action="action"
                    :number="index + 1"
                    :blocked="blocked"
                    :button-attrs="buttonAttrs"
                    @activate="emit('activate', index)"
                    @assign="emit('assign', index)"
                    @clear="emit('clear', index)"
                />
                <div v-if="$slots.trailing" class="quick-action-bar__trailing">
                    <slot name="trailing" />
                </div>
            </div>
        </HudFrame>
    </div>
</template>

<style scoped>
.quick-action-bar {
    --quick-action-size: 50px;
    --quick-action-gap: 7px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
    inline-size: 272px;
    max-inline-size: 100%;
    color: var(--ui-dark-panel-title);
}

.quick-action-bar--with-trailing {
    inline-size: 329px;
}

.quick-action-bar__slots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 9px var(--quick-action-gap);
    min-inline-size: 0;
}

.quick-action-bar--with-trailing .quick-action-bar__slots {
    --quick-action-size: min(50px, calc((100cqi - 4 * var(--quick-action-gap)) / 5));
}

.quick-action-bar__trailing {
    display: grid;
    flex: none;
    inline-size: var(--quick-action-size);
    aspect-ratio: 1;
}

.hotbar-waiting {
    margin: 0;
    text-align: center;
    line-height: 1.2;
    justify-self: center;
    border: 1px solid var(--ui-dark-panel-divider);
    padding: 3px 6px;
    background: var(--ui-dark-panel-surface);
    font-size: 13px;
}
</style>
