<script setup lang="ts">
import {
    ABILITY_DEFINITIONS,
    type CharacterSnapshot,
    type ClientMessage,
    previewPrayerFromSnapshots,
} from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { itemAssetCatalog } from '../assets/itemCatalog'
import {
    createPrayerPreviewHighlight,
    type PrayerPreviewHighlight,
} from '../runtime/prayerPreviewPresentation'
import { relation } from './combatTargeting'
import { dialogActionKeys } from './dialogActionKeys'
import {
    type HotbarBinding as Binding,
    hotbarGlyphs as glyphs,
    prayerDescription,
} from './hotbarBindings'
import { useDialogEscape } from './useDialogEscape'

const props = defineProps<{
    player: CharacterSnapshot
    target?: CharacterSnapshot
    characters: CharacterSnapshot[]
    canReach?: (target: CharacterSnapshot) => boolean
    blocked: boolean
}>()
const emit = defineEmits<{
    command: [message: ClientMessage]
    cancel: []
    previewChange: [preview: PrayerPreviewHighlight | undefined]
}>()
const bindings = ref<(Binding | null)[]>([null, null, null, null])
const prayerAssigned = computed(() =>
    bindings.value.some((binding) => binding?.kind === 'ability' && binding.id === 'pray')
)
const editing = ref<number>()
const picker = ref<HTMLElement>()
const food = computed(() => props.player.inventory.filter((item) => item.itemId === 'food'))
const count = computed(() => food.value.reduce((sum, item) => sum + (item.quantity ?? 1), 0))
const known = computed(() => props.player.abilities?.known ?? [])

watch(
    () => props.player.id,
    () => {
        bindings.value = [null, null, null, null]
        editing.value = undefined
    }
)
function label(binding: Binding | null): string {
    return !binding
        ? 'Пусто'
        : binding.kind === 'item'
          ? 'Яблоко'
          : ABILITY_DEFINITIONS[binding.id].name
}
function cooldown(binding: Binding | null): number {
    return binding?.kind === 'ability' ? (props.player.abilities?.cooldowns[binding.id] ?? 0) : 0
}
const prayerPreview = computed(() =>
    previewPrayerFromSnapshots(props.player, props.characters, props.target?.id, {
        canReach: props.canReach,
        canAid: (target) => relation(target, props.player) !== 'hostile',
    })
)
const worldPrayerPreview = computed(() => {
    if (!prayerAssigned.value || props.blocked) return undefined
    return createPrayerPreviewHighlight(props.player, props.characters, prayerPreview.value, {
        active: true,
        canReach: props.canReach ?? (() => true),
    })
})
watch(worldPrayerPreview, (preview) => emit('previewChange', preview), { immediate: true })
onBeforeUnmount(() => emit('previewChange', undefined))
function prayer(): ClientMessage | undefined {
    const preview = prayerPreview.value
    return preview.intent && !preview.unavailableReason
        ? { type: 'use_ability', abilityId: 'pray', intent: preview.intent }
        : undefined
}
function prayerTooltip(): string {
    return prayerDescription(prayerPreview.value, props.characters, props.player)
}
function unavailable(binding: Binding | null): string | undefined {
    if (!binding) return undefined
    if (binding.kind === 'item') return count.value === 0 ? 'Нет яблок' : undefined
    if (binding.id === 'pray') return prayerPreview.value.unavailableReason ?? undefined
    const ability = ABILITY_DEFINITIONS[binding.id]
    if (cooldown(binding) > 0) return 'Умение восстанавливается'
    if (props.player.resources.mana < ability.mana) return 'Недостаточно маны'
    if (props.player.resources.energy < ability.energy) return 'Недостаточно энергии'
    if (
        binding.id !== 'barrier' &&
        (!props.target || relation(props.target, props.player) !== 'hostile')
    )
        return 'Выберите врага: T'
    return undefined
}
function tooltip(binding: Binding | null): string {
    if (binding?.kind !== 'ability') return label(binding)
    if (binding.id === 'pray') return prayerTooltip()
    const ability = ABILITY_DEFINITIONS[binding.id]
    return `${ability.name} · ${ability.mana} MP · ${ability.energy} EN · ${ability.cooldownMs / 1000} с`
}
function canActivate(binding: Binding | null | undefined): binding is Binding {
    return (
        Boolean(binding) &&
        !props.blocked &&
        props.player.alive &&
        props.player.cooldowns.stunMsLeft <= 0 &&
        cooldown(binding ?? null) <= 0
    )
}
function activate(index: number): void {
    const binding = bindings.value[index]
    if (!canActivate(binding) || unavailable(binding)) return
    if (binding.kind === 'item') {
        const item = food.value[0]
        if (item)
            emit('command', {
                type: 'inventory_action',
                action: 'eat',
                itemInstanceId: item.instanceId,
            })
        return
    }
    if (!known.value.includes(binding.id)) return
    const ability = ABILITY_DEFINITIONS[binding.id]
    if (
        props.player.resources.mana < ability.mana ||
        props.player.resources.energy < ability.energy
    )
        return
    const command =
        binding.id === 'pray'
            ? prayer()
            : {
                  type: 'use_ability' as const,
                  abilityId: binding.id,
                  ...(props.target && binding.id !== 'barrier'
                      ? { targetId: props.target.id }
                      : {}),
              }
    if (command) emit('command', command)
}
async function edit(index: number): Promise<void> {
    if (props.blocked) return
    editing.value = index
    emit('cancel')
    await nextTick()
    picker.value?.querySelector<HTMLButtonElement>('button')?.focus()
}
function assign(binding: Binding | null): void {
    if (editing.value !== undefined) bindings.value[editing.value] = binding
    close()
}
function close(): void {
    editing.value = undefined
    document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
}
useDialogEscape(picker, close)
defineExpose({ activate, edit })
</script>
<template>
    <div class="hotbar rpg-panel" aria-label="Быстрые действия">
        <button
            v-for="(binding, index) in bindings"
            :key="index"
            type="button"
            class="hotbar-slot"
            :aria-disabled="Boolean(unavailable(binding))"
            :aria-label="`${index + 1}: ${label(binding)}. Shift+${index + 1} — назначить`"
            :title="`${unavailable(binding) ?? tooltip(binding)} · Shift+${index + 1}: назначить`"
            :aria-description="unavailable(binding) ?? tooltip(binding)"
            @click="binding ? activate(index) : edit(index)"
            @contextmenu.prevent="edit(index)"
        >
            <kbd>{{ index + 1 }}</kbd>
            <img
                v-if="binding?.kind === 'item'"
                class="hotbar-item"
                :src="itemAssetCatalog.food.src"
                alt=""
            />
            <span v-else-if="binding">{{ glyphs[binding.id] }}</span>
            <small v-if="binding?.kind === 'item'">{{ count }}</small>
            <b v-if="cooldown(binding) > 0" class="hotbar-cooldown">{{
                (cooldown(binding) / 1000).toFixed(1)
            }}</b>
        </button>
        <p>1–4 · Shift+1–4 назначить</p>
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
        <button data-dialog-action type="button" @click="assign({ kind: 'item', id: 'food' })">
            Яблоко · {{ count }}
        </button>
        <button data-dialog-action type="button" @click="assign(null)">Очистить слот</button>
        <button data-dialog-action type="button" @click="close">Закрыть · Esc</button>
    </section>
</template>
<style scoped src="./actionHotbar.css"></style>
