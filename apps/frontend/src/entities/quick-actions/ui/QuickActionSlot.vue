<script setup lang="ts">
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton, type UiButtonColors } from '@/shared/ui/common'

import type { QuickAction } from '../model/quickAction'

const props = defineProps<{
    number: number
    action: QuickAction | null
    blocked?: boolean
    buttonAttrs?: Record<string, unknown>
}>()
const emit = defineEmits<{ activate: []; assign: []; clear: [] }>()

const label = computed(() => props.action?.label ?? tGame('game.world.emptyQuickSlot'))
const description = computed(() => props.action?.description ?? label.value)
const coolingDown = computed(() => (props.action?.cooldownMs ?? 0) > 0)
const cooldownLabel = computed(() => ((props.action?.cooldownMs ?? 0) / 1000).toFixed(1))
const accessibleDescription = computed(() => {
    const quantity = props.action?.quantity
    return [
        description.value,
        quantity === undefined ? undefined : tGame('game.world.quantityAvailable', { quantity }),
        coolingDown.value
            ? tGame('game.world.actionCooldown', { seconds: cooldownLabel.value })
            : undefined,
    ]
        .filter(Boolean)
        .join(' · ')
})
const disabled = computed(() => Boolean(props.blocked || props.action?.disabled))

function activate(): void {
    if (disabled.value) return
    if (props.action) emit('activate')
    else emit('assign')
}

const slotColors: UiButtonColors = {
    normal: {
        text: 'var(--quick-action-ink)',
        border: 'var(--quick-action-rail)',
        backgroundTop: 'var(--quick-action-face)',
        backgroundBottom: 'var(--quick-action-base)',
    },
    highlighted: {
        text: 'var(--quick-action-ink)',
        border: 'var(--quick-action-highlight)',
        backgroundTop: 'var(--quick-action-hover)',
    },
    focus: 'var(--ui-dark-panel-title)',
    shadow: 'var(--quick-action-surface)',
}

const clearColors: UiButtonColors = {
    normal: {
        text: 'var(--ui-dark-panel-title)',
        border: 'transparent',
        backgroundTop: 'var(--quick-action-track)',
        backgroundBottom: 'var(--quick-action-surface)',
    },
    highlighted: {
        text: 'var(--ui-dark-panel-title)',
        border: 'var(--quick-action-ornament)',
        backgroundTop: 'var(--quick-action-track)',
    },
    edge: 'var(--quick-action-divider)',
    focus: 'var(--ui-dark-panel-title)',
}
</script>

<template>
    <div class="quick-action-slot">
        <UiButton
            v-bind="buttonAttrs"
            class="hotbar-slot"
            appearance="panel"
            panel="panel-007"
            :colors="slotColors"
            :class="{ active: action?.active, 'hotbar-slot--empty': !action }"
            :data-unavailable="action?.unavailable || undefined"
            :aria-pressed="action?.active ?? false"
            :aria-disabled="disabled"
            :aria-label="
                tGame('game.world.assignActionHint', {
                    number: number,
                    label: label,
                    shortcut: number,
                })
            "
            :aria-description="accessibleDescription"
            :title="
                tGame('game.world.assignActionDescription', {
                    description: description,
                    number: number,
                })
            "
            @click="activate"
            @contextmenu.prevent="!blocked && emit('assign')"
        >
            <kbd aria-hidden="true">{{ number }}</kbd>
            <span
                class="quick-action-slot__icon"
                :class="{ 'quick-action-slot__icon--recovering': coolingDown }"
                aria-hidden="true"
            >
                <img
                    v-if="action?.icon.kind === 'image'"
                    class="hotbar-item"
                    :src="action.icon.src"
                    alt=""
                />
                <span v-else>{{ action?.icon.text ?? '+' }}</span>
            </span>
            <span
                v-if="action?.repeat !== undefined"
                class="hotbar-auto"
                :title="action.repeat"
                :aria-label="tGame('game.world.autoRepeat')"
                >↻</span
            >
            <small v-if="action?.quantity !== undefined" class="quick-action-slot__quantity">{{
                action.quantity
            }}</small>
            <b v-if="coolingDown" class="hotbar-cooldown">{{ cooldownLabel }}</b>
        </UiButton>
        <UiButton
            v-if="action"
            v-bind="buttonAttrs"
            class="hotbar-clear"
            border="border-015"
            :colors="clearColors"
            :aria-label="tGame('game.world.clearSlotNumber', { number: number })"
            :title="tGame('game.world.clearSlotNumber', { number: number })"
            @click.stop="emit('clear')"
        >
            ×
        </UiButton>
    </div>
</template>

<style scoped>
.quick-action-slot {
    --quick-action-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    --quick-action-ornament: var(--ui-themed-panel-accent, var(--ui-dark-panel-ornament));
    --quick-action-border: var(--ui-themed-panel-accent, var(--ui-dark-panel-border));
    --quick-action-track: color-mix(
        in srgb,
        var(--ui-themed-panel-surface, var(--ui-dark-bar-track)) 70%,
        var(--ui-dark-bar-track)
    );
    --quick-action-divider: color-mix(
        in srgb,
        var(--ui-themed-panel-accent, var(--ui-dark-panel-divider)) 50%,
        var(--ui-themed-panel-surface, var(--ui-dark-panel-divider))
    );
    position: relative;
    inline-size: var(--quick-action-size, 50px);
    aspect-ratio: 1;
    flex: none;
}

.hotbar-slot {
    --quick-action-ink: var(--ui-dark-panel-title);
    --quick-action-rail: var(--quick-action-ornament);
    --quick-action-face: var(--quick-action-track);
    --quick-action-base: var(--quick-action-surface);
    --quick-action-hover: color-mix(
        in srgb,
        var(--quick-action-face) 80%,
        var(--quick-action-border)
    );
    --quick-action-highlight: var(--ui-dark-panel-title);
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
    text-shadow: none;
}

.hotbar-slot.active {
    --quick-action-ink: var(--quick-action-surface);
    --quick-action-rail: var(--ui-themed-panel-accent, var(--ui-light-panel-parchment));
    --quick-action-face: var(--ui-light-panel-parchment);
    --quick-action-base: var(--quick-action-border);
    --quick-action-highlight: var(--ui-light-border-white);
}

.hotbar-slot--empty {
    --quick-action-ink: var(--quick-action-ornament);
    --quick-action-rail: var(--quick-action-divider);
    --quick-action-face: var(--quick-action-surface);
    --quick-action-base: var(--quick-action-surface);
}

.hotbar-slot[data-unavailable='true']:not(.active) {
    --quick-action-ink: var(--ui-dark-panel-text);
    --quick-action-rail: var(--quick-action-divider);
    --quick-action-face: color-mix(in srgb, var(--quick-action-track), var(--quick-action-surface));
}

.hotbar-slot kbd {
    position: absolute;
    inset-block-start: calc(4px - var(--fantasy-panel-size));
    inset-inline-start: calc(13px - var(--fantasy-panel-size));
    font: 11px/1 var(--ratata-font-family, sans-serif);
}

.quick-action-slot__icon {
    position: absolute;
    inset: -2px;
    display: grid;
    place-items: center;
    font-size: 25px;
    line-height: 1;
}

.hotbar-slot--empty .quick-action-slot__icon {
    font-size: 16px;
}

.quick-action-slot__icon--recovering {
    opacity: 0.4;
}

.hotbar-item {
    inline-size: 26px;
    block-size: 26px;
    object-fit: contain;
    image-rendering: pixelated;
}

.quick-action-slot__quantity,
.hotbar-cooldown,
.hotbar-auto {
    position: absolute;
    z-index: 1;
    background: var(--quick-action-surface);
    color: var(--ui-dark-panel-title);
}

.quick-action-slot__quantity,
.hotbar-cooldown {
    inset-inline-start: 50%;
    transform: translateX(-50%);
    padding: 0 3px;
    font: 13px/1.05 var(--ratata-font-family, sans-serif);
    white-space: nowrap;
}

.quick-action-slot__quantity {
    inset-block-end: calc(-4px - var(--fantasy-panel-size));
}

.hotbar-cooldown {
    inset-block-start: 50%;
    transform: translate(-50%, -50%);
}

.hotbar-auto {
    inset-inline-end: calc(3px - var(--fantasy-panel-size));
    inset-block-end: calc(3px - var(--fantasy-panel-size));
    font-size: 12px;
    line-height: 1;
}

.hotbar-clear {
    position: absolute;
    z-index: 1;
    inset-block-start: -3px;
    inset-inline-end: -3px;
    inline-size: 19px;
    block-size: 19px;
    min-inline-size: 0;
    min-block-size: 0;
    padding: 0;
    font-size: 13px;
    line-height: 1;
    text-shadow: none;
}

@media (pointer: coarse) {
    .hotbar-clear {
        inline-size: 22px;
        block-size: 22px;
    }
}
</style>
