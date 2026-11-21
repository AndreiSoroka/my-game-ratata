<script setup lang="ts">
import {
    ABILITY_DEFINITIONS,
    type CharacterSnapshot,
    type ClientMessage,
    type ProjectilePath,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { hotbarGlyphs as glyphs, type QuickAction, QuickActionBar } from '@/entities/quick-actions'
import { HudFrame, UiButton, type UiButtonColors } from '@/shared/ui/common'

import { itemAssetCatalog } from '../assets/itemCatalog'
import type { PrayerPreviewHighlight } from '../runtime/prayerPreviewPresentation'
import { abilityUsage } from './abilityUsage'
import { dialogActionKeys } from './dialogActionKeys'
import { objectTargetUnavailable } from './hotbarActions'
import type { HotbarBinding as Binding } from './hotbarBindings'
import { activateFocusedButton, stopButtonConfirmation } from './uiKeyboard'
import { useDialogEscape } from './useDialogEscape'
import { useFooterHeight } from './useFooterHeight'
import { useHotbarActions } from './useHotbarActions'
import { useShotPreview } from './useShotPreview'
const props = defineProps<{
    player: CharacterSnapshot
    target?: CharacterSnapshot
    grave?: WorldGraveSnapshot
    graves?: WorldGraveSnapshot[]
    objectTarget?: boolean
    canReachGrave?: (grave: WorldGraveSnapshot) => boolean
    characters: CharacterSnapshot[]
    canReach?: (target: CharacterSnapshot) => boolean
    blocked: boolean
}>()
const emit = defineEmits<{
    command: [message: ClientMessage]
    cancel: []
    plant: []
    previewChange: [preview: PrayerPreviewHighlight | undefined]
    shotPreviewChange: [path: ProjectilePath | undefined]
}>()
const {
    bindings,
    count,
    saplings,
    known,
    label,
    cooldown,
    unavailable,
    tooltip,
    activate,
    active,
    waiting,
    resetGesture,
} = useHotbarActions(props, emit)
const actions = computed(() => bindings.value.map(describeAction))

function describeAction(binding: Binding | null, index: number): QuickAction | null {
    if (!binding) return null
    const reason = unavailable(binding)
    const isActive = active(binding, index)
    return {
        label: label(binding),
        description: reason ?? tooltip(binding),
        icon:
            binding.kind === 'item'
                ? { kind: 'image', src: itemAssetCatalog[binding.id].src }
                : { kind: 'glyph', text: binding.kind === 'attack' ? '⚔' : glyphs[binding.id] },
        quantity:
            binding.kind === 'item'
                ? binding.id === 'sapling'
                    ? saplings.value
                    : count.value
                : undefined,
        cooldownMs: cooldown(binding),
        active: isActive,
        repeat: isActive && !props.player.combat?.defensiveStance ? waiting.value : undefined,
        disabled: Boolean(objectTargetUnavailable(binding, props)),
        unavailable: reason !== undefined,
    }
}

const pickerButtonColors: UiButtonColors = {
    normal: {
        text: 'var(--ui-dark-panel-text)',
        border: 'var(--ui-dark-panel-divider)',
    },
    highlighted: {
        text: 'var(--ui-dark-panel-title)',
        border: 'var(--ui-dark-panel-border)',
        backgroundTop: 'var(--ui-dark-bar-track)',
        backgroundBottom: 'var(--ui-dark-panel-surface)',
    },
    focus: 'var(--ui-dark-panel-title)',
}

useShotPreview(props, bindings, emit)
const editing = ref<number>()
watch(
    () => props.player.id,
    () => {
        editing.value = undefined
    }
)
const bar = ref<HTMLElement>()
const dockContent = ref<HTMLElement>()
useFooterHeight(dockContent, '--ratata-hotbar-height')
const picker = ref<HTMLElement>()
async function edit(index: number): Promise<void> {
    if (props.blocked) return
    editing.value = index
    resetGesture()
    emit('cancel')
    await nextTick()
    picker.value?.querySelector<HTMLButtonElement>('button')?.focus()
}
function assign(binding: Binding | null): void {
    if (editing.value !== undefined) bindings.value[editing.value] = binding
    close()
}
function assignItem(index: number, itemId: 'food' | 'sapling'): void {
    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= bindings.value.length ||
        (itemId !== 'food' && itemId !== 'sapling') ||
        !props.player.inventory.some((item) => item.itemId === itemId)
    )
        return
    bindings.value[index] = { kind: 'item', id: itemId }
    resetGesture()
}
async function clearSlot(index: number): Promise<void> {
    if (active(bindings.value[index] ?? null, index)) emit('cancel')
    bindings.value[index] = null
    resetGesture()
    await nextTick()
    bar.value?.querySelectorAll<HTMLButtonElement>('.hotbar-slot')[index]?.focus()
}
function close(): void {
    editing.value = undefined
    document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
}
useDialogEscape(picker, close)
defineExpose({ activate, edit, assignItem, resetGesture })
</script>
<template>
    <div
        ref="bar"
        class="hotbar"
        @keydown="activateFocusedButton($event, bar)"
        @keyup="stopButtonConfirmation($event, bar)"
    >
        <div ref="dockContent" class="hotbar-content">
            <div
                v-if="
                    player.combat?.defensiveStance || player.combat?.combo?.stacks || $slots.guide
                "
                class="hotbar-context"
            >
                <HudFrame
                    v-if="player.combat?.defensiveStance"
                    class="hotbar-context__line"
                    role="status"
                >
                    Глухая оборона · Движение, атаки и колдовство недоступны
                </HudFrame>
                <HudFrame
                    v-if="player.combat?.combo?.stacks"
                    class="hotbar-context__line"
                    role="status"
                    aria-label="Серия ударов"
                >
                    Серия ударов: {{ player.combat.combo.stacks }} / {{ player.combat.combo.limit }}
                </HudFrame>
                <slot name="guide" />
            </div>
            <QuickActionBar
                class="hotbar__tray"
                :actions="actions"
                :blocked="blocked || !player.alive"
                :waiting="player.control?.mode === 'action' ? waiting : undefined"
                @activate="activate"
                @assign="edit"
                @clear="clearSlot"
            />
        </div>
        <section
            v-if="editing !== undefined"
            ref="picker"
            class="hotbar-picker"
            role="dialog"
            aria-modal="true"
            :aria-label="`Назначить слот ${editing + 1}`"
            @keydown.stop="dialogActionKeys($event, picker, close)"
            @keyup.stop
        >
            <HudFrame>
                <h2>Слот {{ editing + 1 }}</h2>
                <div class="hotbar-picker__actions">
                    <UiButton
                        v-for="ability in known"
                        :key="ability"
                        appearance="ghost"
                        border="border-015"
                        :colors="pickerButtonColors"
                        data-dialog-action
                        @click="assign({ kind: 'ability', id: ability })"
                    >
                        {{ glyphs[ability] }} {{ ABILITY_DEFINITIONS[ability].name }}
                        <small
                            >{{ abilityUsage(player, ability).mana }} MP ·
                            {{ abilityUsage(player, ability).energy }} EN</small
                        >
                    </UiButton>
                    <UiButton
                        appearance="ghost"
                        border="border-015"
                        :colors="pickerButtonColors"
                        data-dialog-action
                        @click="assign({ kind: 'attack' })"
                    >
                        ⚔ {{ label({ kind: 'attack' }) }}
                    </UiButton>
                    <UiButton
                        appearance="ghost"
                        border="border-015"
                        :colors="pickerButtonColors"
                        data-dialog-action
                        @click="assign({ kind: 'item', id: 'food' })"
                    >
                        Яблоко · {{ count }}
                    </UiButton>
                    <UiButton
                        appearance="ghost"
                        border="border-015"
                        :colors="pickerButtonColors"
                        data-dialog-action
                        @click="assign({ kind: 'item', id: 'sapling' })"
                    >
                        Саженец · {{ saplings }}
                    </UiButton>
                    <UiButton
                        appearance="ghost"
                        border="border-015"
                        :colors="pickerButtonColors"
                        data-dialog-action
                        @click="assign(null)"
                    >
                        Очистить слот
                    </UiButton>
                    <UiButton
                        appearance="ghost"
                        border="border-015"
                        :colors="pickerButtonColors"
                        data-dialog-action
                        @click="close"
                    >
                        Закрыть · Esc
                    </UiButton>
                </div>
            </HudFrame>
        </section>
    </div>
</template>
<style scoped src="./actionHotbar.css"></style>
