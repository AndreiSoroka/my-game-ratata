<script setup lang="ts">
import {
    ABILITY_DEFINITIONS,
    type CharacterSnapshot,
    type ClientMessage,
    type ProjectilePath,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'
import { nextTick, ref, watch } from 'vue'

import { itemAssetCatalog } from '../assets/itemCatalog'
import type { PrayerPreviewHighlight } from '../runtime/prayerPreviewPresentation'
import { dialogActionKeys } from './dialogActionKeys'
import { type HotbarBinding as Binding, hotbarGlyphs as glyphs } from './hotbarBindings'
import { activateFocusedButton, stopButtonConfirmation } from './uiKeyboard'
import { useDialogEscape } from './useDialogEscape'
import { useHotbarActions } from './useHotbarActions'
import { useShotPreview } from './useShotPreview'
const props = defineProps<{
    player: CharacterSnapshot
    target?: CharacterSnapshot
    grave?: WorldGraveSnapshot
    canReachGrave?: (grave: WorldGraveSnapshot) => boolean
    characters: CharacterSnapshot[]
    canReach?: (target: CharacterSnapshot) => boolean
    blocked: boolean
}>()
const emit = defineEmits<{
    command: [message: ClientMessage]
    cancel: []
    previewChange: [preview: PrayerPreviewHighlight | undefined]
    shotPreviewChange: [path: ProjectilePath | undefined]
}>()
const {
    bindings,
    food,
    count,
    known,
    prayerAssigned,
    label,
    cooldown,
    unavailable,
    tooltip,
    prayerTooltip,
    activate,
    active,
    waiting,
    resetGesture,
} = useHotbarActions(props, emit)
useShotPreview(props, bindings, emit)
const editing = ref<number>()
watch(
    () => props.player.id,
    () => {
        editing.value = undefined
    }
)
const bar = ref<HTMLElement>()
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
function assignItem(index: number, itemId: 'food'): void {
    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= bindings.value.length ||
        itemId !== 'food' ||
        !food.value.length
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
        class="hotbar rpg-panel"
        aria-label="Быстрые действия"
        @keydown="activateFocusedButton($event, bar)"
        @keyup="stopButtonConfirmation($event, bar)"
    >
        <div v-for="(binding, index) in bindings" :key="index" class="hotbar-cell">
            <button
                type="button"
                class="hotbar-slot"
                :class="{ active: active(binding, index) }"
                :aria-pressed="active(binding, index)"
                :aria-disabled="blocked || !player.alive"
                :aria-label="`${index + 1}: ${label(binding)}. Shift+${index + 1} — назначить`"
                :title="`${unavailable(binding) ?? tooltip(binding)} · Shift+${index + 1}: назначить`"
                :aria-description="unavailable(binding) ?? tooltip(binding)"
                @click="binding ? activate(index) : edit(index)"
                @contextmenu.prevent="edit(index)"
            >
                <kbd>{{ index + 1 }}</kbd
                ><span
                    v-if="active(binding, index)"
                    class="hotbar-auto"
                    :title="waiting"
                    aria-label="Автоповтор"
                    >↻</span
                >
                <img
                    v-if="binding?.kind === 'item'"
                    class="hotbar-item"
                    :src="itemAssetCatalog.food.src"
                    alt=""
                />
                <span v-else-if="binding">{{
                    binding.kind === 'attack' ? '⚔' : glyphs[binding.id]
                }}</span>
                <small v-if="binding?.kind === 'item'">{{ count }}</small>
                <b v-if="cooldown(binding) > 0" class="hotbar-cooldown">{{
                    (cooldown(binding) / 1000).toFixed(1)
                }}</b>
            </button>
            <button
                v-if="binding"
                type="button"
                class="hotbar-clear"
                :aria-label="`Очистить слот ${index + 1}`"
                :title="`Очистить слот ${index + 1}`"
                @click.stop="clearSlot(index)"
            >
                ×
            </button>
        </div>
        <p>1–4 · Дважды: повтор · Shift: назначить</p>
        <p v-if="player.control?.mode === 'action'" class="hotbar-waiting" role="status">
            {{ waiting }}
        </p>
    </div>
    <p v-if="prayerAssigned" class="prayer-preview rpg-panel" role="status">
        {{ prayerTooltip() }}
    </p>
    <section
        v-if="editing !== undefined"
        ref="picker"
        class="hotbar-picker rpg-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="`Назначить слот ${editing + 1}`"
        @keydown.stop="dialogActionKeys($event, picker, close)"
        @keyup.stop
    >
        <h2>Слот {{ editing + 1 }}</h2>
        <button
            v-for="ability in known"
            :key="ability"
            data-dialog-action
            type="button"
            @click="assign({ kind: 'ability', id: ability })"
        >
            {{ glyphs[ability] }} {{ ABILITY_DEFINITIONS[ability].name }}
            <small
                >{{ ABILITY_DEFINITIONS[ability].mana }} MP ·
                {{ ABILITY_DEFINITIONS[ability].energy }} EN</small
            >
        </button>
        <button data-dialog-action type="button" @click="assign({ kind: 'attack' })">
            ⚔ Базовая атака
        </button>
        <button data-dialog-action type="button" @click="assign({ kind: 'item', id: 'food' })">
            Яблоко · {{ count }}
        </button>
        <button data-dialog-action type="button" @click="assign(null)">Очистить слот</button>
        <button data-dialog-action type="button" @click="close">Закрыть · Esc</button>
    </section>
</template>
<style scoped src="./actionHotbar.css"></style>
