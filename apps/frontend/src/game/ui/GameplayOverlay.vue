<script setup lang="ts">
import './rpgControls.css'

import type {
    CharacterSnapshot,
    ClientMessage,
    GameEventPayload,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
import ActionChannelStatus from './ActionChannelStatus.vue'
import ActionHotbar from './ActionHotbar.vue'
import { combatKeyBlocked } from './combatTargeting'
import PartyPanel from './PartyPanel.vue'
import SelectedTargetPanel from './SelectedTargetPanel.vue'
import SpeechBubbles from './SpeechBubbles.vue'
import { useEscapeOwner } from './uiEscapeOwners'
import { useWorldTargetSelection } from './useWorldTargetSelection'

const props = defineProps<{
    game?: RatataGame
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    blocked: boolean
    interactionPrompt?: string
}>()
const emit = defineEmits<{ interact: [id: string]; requestInteract: []; openMenu: []; plant: [] }>()
const hotbar = ref<InstanceType<typeof ActionHotbar>>()
const speech = ref<InstanceType<typeof SpeechBubbles>>()
const unavailable = computed(() => !props.player.alive || props.player.cooldowns.stunMsLeft > 0)
const {
    selectedKey,
    selectedTarget,
    selectedId,
    selectedGraveId,
    target,
    grave,
    selectKey,
    select,
    selectGrave,
    selectSelf,
    acquireAttackTarget,
    cycle,
    validateSelection,
} = useWorldTargetSelection(props, {
    cancel: () => cancel(),
    resetGesture: () => hotbar.value?.resetGesture(),
    hasPendingAttack: (targetId) => hotbar.value?.hasPendingAttack(targetId) ?? false,
    interact: (id) => emit('interact', id),
})
function send(command: ClientMessage): void {
    props.game?.sendCommand(command)
}
function cancel(clear = false): void {
    hotbar.value?.resetGesture()
    send({ type: 'cancel_control' })
    if (clear) selectedKey.value = undefined
}
function release(): void {
    hotbar.value?.resetGesture()
    send({ type: 'release_input' })
}
function key(event: KeyboardEvent): void {
    if (
        [
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'Space',
        ].includes(event.code)
    )
        hotbar.value?.resetGesture()
    if (combatKeyBlocked(event, props.blocked)) return
    const digit = /^Digit([1-4])$/.exec(event.code)
    if (!['KeyQ', 'KeyE'].includes(event.code) && !digit) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    if (unavailable.value) return
    if (digit) {
        if (!validateSelection()) return
        activateSlot(Number(digit[1]) - 1, event.shiftKey)
        return
    }
    const actions: Record<string, () => void> = {
        KeyQ: selectSelf,
        KeyE: () => cycle(event.shiftKey),
    }
    actions[event.code]?.()
}
useEscapeOwner({
    priority: 0,
    active: () =>
        !props.blocked &&
        Boolean(
            props.player.abilities?.casting ||
            props.snapshot.automation?.run?.status === 'running' ||
            selectedKey.value ||
            (props.player.control && props.player.control.mode !== 'none')
        ),
    escape: () => {
        if (props.player.abilities?.casting) send({ type: 'cancel_prayer' })
        cancel(true)
    },
})
function activateSlot(slot: number, edit: boolean): void {
    if (edit) void hotbar.value?.edit(slot)
    else hotbar.value?.activate(slot)
}
function visibility(): void {
    if (document.hidden) release()
}
function blur(): void {
    release()
}
function receive(event: GameEventPayload): void {
    speech.value?.receive(event)
}
function assignItem(slot: number, itemId: 'food' | 'sapling'): void {
    hotbar.value?.assignItem(slot, itemId)
}
let closingDialogue: string | undefined
watch([() => props.snapshot.adventure?.dialogue, () => props.characters], () => {
    const dialogue = props.snapshot.adventure?.dialogue
    if (!dialogue || dialogue.kind === 'sign') {
        closingDialogue = undefined
        return
    }
    const speaker = props.characters.find((actor) => actor.id === dialogue.npcId)
    const valid =
        speaker?.alive &&
        props.player.alive &&
        props.game?.isInteractionVisible(speaker.position, undefined, 48)
    if (!valid && closingDialogue !== dialogue.npcId) {
        closingDialogue = dialogue.npcId
        send({ type: 'dialogue_choice', choiceId: 'close' })
    }
})
watch(
    () => props.player.id,
    () => {
        selectedKey.value = undefined
        speech.value?.clear()
    }
)
watch(
    () => props.snapshot.location?.id,
    () => {
        selectedKey.value = undefined
        if (props.player.control?.mode !== 'follow') release()
        speech.value?.clear()
    }
)
watch(
    () => props.blocked,
    (blocked) => {
        if (blocked) release()
    }
)
watch(
    () => !props.player.alive || props.player.cooldowns.stunMsLeft > 0,
    (disrupted) => {
        if (disrupted) release()
    }
)
onMounted(() => {
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
})
onBeforeUnmount(() => {
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('blur', blur)
    document.removeEventListener('visibilitychange', visibility)
    release()
})
defineExpose({
    selectedKey,
    selectedId,
    selectedGraveId,
    select,
    selectKey,
    selectGrave,
    receive,
    cancel,
    assignItem,
})
</script>
<template>
    <PartyPanel
        v-if="snapshot.party"
        :party="snapshot.party"
        :current-location-id="snapshot.location?.id"
        :selected-id="selectedId"
        @select="select"
        @leave="send({ type: 'party_leave' })"
    />
    <SelectedTargetPanel
        :target="target"
        :grave="grave"
        :object="
            selectedTarget?.kind !== 'character' && selectedTarget?.kind !== 'grave'
                ? selectedTarget
                : undefined
        "
        :player="player"
        :server-time="snapshot.serverTime"
    />
    <ActionChannelStatus
        :player="player"
        @cancel-prayer="send({ type: 'cancel_prayer' })"
        @cancel-route="cancel(true)"
    />
    <ActionHotbar
        ref="hotbar"
        :player="player"
        :target="target"
        :grave="grave"
        :graves="snapshot.graves"
        :acquire-attack-target="acquireAttackTarget"
        :can-reach-grave="
            (selected) =>
                game?.isInteractionVisible(selected.position, undefined, Infinity) ?? false
        "
        :object-target="
            Boolean(
                selectedTarget &&
                selectedTarget.kind !== 'character' &&
                selectedTarget.kind !== 'grave'
            )
        "
        :characters="characters"
        :can-reach="
            (target) => game?.isInteractionVisible(target.position, undefined, Infinity) ?? false
        "
        :blocked="blocked"
        @command="send"
        @open-menu="emit('openMenu')"
        @plant="emit('plant')"
        @cancel="cancel()"
        @preview-change="game?.setPrayerPreview?.($event)"
        @shot-preview-change="game?.setShotPreview?.($event)"
    >
        <template #guide>
            <button
                v-if="interactionPrompt"
                type="button"
                class="target-help nearby-prompt"
                @click="emit('requestInteract')"
            >
                {{ interactionPrompt }}
            </button>
            <span v-else class="target-help">Q себя · E цель · Shift+E назад · F действие</span>
        </template>
    </ActionHotbar>
    <SpeechBubbles ref="speech" :game="game" :snapshot="snapshot" :player="player" />
</template>
<style scoped>
.target-help {
    display: grid;
    place-content: center;
    min-height: 20px;
    color: var(--rpg-text);
    font: 10px system-ui;
    text-align: center;
    text-shadow: 1px 1px #101c13;
}
.nearby-prompt {
    display: block;
    justify-self: center;
    border: 0;
    padding: 0 4px;
    background: transparent;
    cursor: pointer;
    pointer-events: auto;
}
.nearby-prompt:focus-visible {
    outline: 1px solid var(--rpg-focus);
}
@media (max-width: 740px) {
    .target-help {
        font-size: 9px;
        min-height: 24px;
    }
}
</style>
