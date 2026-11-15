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
import { combatKeyBlocked, nextTarget, relation } from './combatTargeting'
import PartyPanel from './PartyPanel.vue'
import SelectedTargetPanel from './SelectedTargetPanel.vue'
import SpeechBubbles from './SpeechBubbles.vue'
import { useEscapeOwner } from './uiEscapeOwners'
import { useGraveSelection } from './useGraveSelection'

const props = defineProps<{
    game?: RatataGame
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    blocked: boolean
}>()
const emit = defineEmits<{ interact: [id: string]; plant: [] }>()
const selectedId = ref<string>()
const { selectedGraveId, grave, selectGrave, clearGrave } = useGraveSelection(
    props,
    selectedId,
    () => cancel(),
    () => release()
)
const hotbar = ref<InstanceType<typeof ActionHotbar>>()
const speech = ref<InstanceType<typeof SpeechBubbles>>()
const unavailable = computed(() => !props.player.alive || props.player.cooldowns.stunMsLeft > 0)
const target = computed(() => props.characters.find((actor) => actor.id === selectedId.value))
function send(command: ClientMessage): void {
    props.game?.sendCommand(command)
}
function cancel(clear = false): void {
    hotbar.value?.resetGesture()
    send({ type: 'cancel_control' })
    if (clear) {
        selectedId.value = undefined
        clearGrave()
    }
}
function release(): void {
    hotbar.value?.resetGesture()
    send({ type: 'release_input' })
}
function selectTarget(id: string | undefined): void {
    if (id !== selectedId.value) cancel()
    selectedId.value = id
}
function select(id: string, open = false): void {
    const character = props.characters.find((actor) => actor.id === id)
    if (!character || character.tags.includes('offline')) return
    selectTarget(id)
    if (open && !character.trainingTarget && relation(character, props.player) !== 'hostile')
        emit('interact', id)
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
    if (!['KeyT', 'KeyF'].includes(event.code) && !digit) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    if (unavailable.value) return
    if (digit) {
        activateSlot(Number(digit[1]) - 1, event.shiftKey)
        return
    }
    const actions: Record<string, () => void> = {
        KeyF: () => {
            selectTarget(props.player.id)
        },
        KeyT: () => {
            selectTarget(
                nextTarget(props.characters, props.player, selectedId.value, event.shiftKey)
            )
        },
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
            selectedId.value ||
            selectedGraveId.value ||
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
        selectedId.value = undefined
        speech.value?.clear()
    }
)
watch(
    () => props.snapshot.location?.id,
    () => {
        selectedId.value = undefined
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
watch(
    () => props.characters,
    () => {
        if (selectedId.value && !target.value) {
            selectedId.value = undefined
            if (props.player.control?.mode !== 'follow') release()
        }
        if (
            target.value &&
            !target.value.alive &&
            relation(target.value, props.player) === 'hostile'
        ) {
            selectedId.value = undefined
            release()
        }
    }
)
watch([target, grave], ([character, selectedGrave]) =>
    props.game?.setCombatTarget(
        character
            ? {
                  key: `character:${character.id}`,
                  kind: 'character',
                  position: character.position,
                  relationship: relation(character, props.player),
              }
            : selectedGrave
              ? {
                    key: `grave:${selectedGrave.id}`,
                    kind: 'object',
                    position: selectedGrave.position,
                }
              : undefined
    )
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
    props.game?.setCombatTarget(undefined)
    release()
})
defineExpose({ selectedId, selectedGraveId, select, selectGrave, receive, cancel, assignItem })
</script>
<template>
    <PartyPanel
        v-if="snapshot.party"
        :party="snapshot.party"
        :current-location-id="snapshot.location?.id"
        :selected-id="selectedId"
        @select="select"
    />
    <SelectedTargetPanel
        :target="target"
        :grave="grave"
        :player="player"
        :server-time="snapshot.serverTime"
    />
    <ActionChannelStatus
        :player="player"
        :server-time="snapshot.serverTime"
        @cancel-prayer="send({ type: 'cancel_prayer' })"
    />
    <ActionHotbar
        ref="hotbar"
        :player="player"
        :target="target"
        :grave="grave"
        :graves="snapshot.graves"
        :can-reach-grave="
            (selected) =>
                game?.isInteractionVisible(
                    selected.position,
                    undefined,
                    player.abilities?.prayer?.radius ?? 48
                ) ?? false
        "
        :characters="characters"
        :can-reach="
            (target) =>
                game?.isInteractionVisible(
                    target.position,
                    undefined,
                    player.abilities?.prayer?.radius ?? 48
                ) ?? false
        "
        :blocked="blocked"
        @command="send"
        @plant="emit('plant')"
        @cancel="cancel()"
        @preview-change="game?.setPrayerPreview?.($event)"
        @shot-preview-change="game?.setShotPreview?.($event)"
    />
    <SpeechBubbles ref="speech" :game="game" :snapshot="snapshot" :player="player" />
    <span class="target-help">T враги · Shift+T союзники · F себя · Дважды 1–4: повтор</span>
</template>
<style scoped>
.target-help {
    position: absolute;
    left: 50%;
    bottom: 92px;
    transform: translateX(-50%);
    z-index: 4;
    color: var(--rpg-text);
    font: 10px system-ui;
    text-shadow: 1px 1px #101c13;
    white-space: nowrap;
}
@media (max-width: 740px) {
    .target-help {
        font-size: 9px;
    }
}
</style>
