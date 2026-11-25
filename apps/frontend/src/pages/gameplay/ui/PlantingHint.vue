<script setup lang="ts">
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'
import { UiFrame } from '@/shared/ui/common'
const props = defineProps<{
    anchor: { x: number; y: number; width: number; height: number }
    available: boolean
    approaching: boolean
    status: string
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const style = computed(() => ({
    left: `${Math.max(8, Math.min(props.anchor.width - Math.min(264, props.anchor.width - 16) - 8, props.anchor.x + 18))}px`,
    top: `${Math.max(8, Math.min(props.anchor.height - 112, props.anchor.y + 18))}px`,
}))
</script>
<template>
    <section
        class="planting-hint game-frame-host"
        :class="{ available }"
        :style="style"
        role="region"
        :aria-label="tGame('game.world.treePlanting')"
        data-world-pointer-owner
    >
        <UiFrame variant="panel" />
        <strong>{{
            approaching ? tGame('game.world.treePlanting') : tGame('game.world.choosePlot')
        }}</strong>
        <p role="status">{{ status }}</p>
        <div>
            <UiButton
                size="small"
                v-if="!approaching"
                :data-available="available"
                @click="emit('confirm')"
            >
                {{ tGame('game.world.plantFEnter') }}
            </UiButton>
            <UiButton size="small" @click="emit('cancel')">{{
                tGame('game.world.cancelEsc')
            }}</UiButton>
        </div>
        <small v-if="!approaching">{{ tGame('game.world.arrowKeysTapChooseTap') }}</small>
    </section>
</template>
<style scoped>
.planting-hint {
    position: absolute;
    z-index: 20;
    padding: 8px 10px;
    width: min(264px, calc(100% - 16px));
    box-sizing: border-box;
    border: 1px solid transparent;
    color: var(--ui-dark-panel-text);
    font: 11px/1.4 system-ui;
    pointer-events: auto;
}
.planting-hint.available {
    border-color: var(--ui-dark-panel-positive);
}
p {
    margin: 3px 0 6px;
}
small {
    display: block;
    margin-top: 5px;
    opacity: 0.8;
}
div {
    display: flex;
    gap: 6px;
}
</style>
