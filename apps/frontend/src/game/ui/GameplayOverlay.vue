<script setup lang="ts">
import './rpgControls.css'

import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
import ActionHotbar from './ActionHotbar.vue'
import { combatKeyBlocked, nextTarget, relation } from './combatTargeting'
import PartyPanel from './PartyPanel.vue'

const props = defineProps<{
    game?: RatataGame
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    blocked: boolean
}>()
const emit = defineEmits<{ interact: [id: string] }>()
const selectedId = ref<string>()
const hotbar = ref<InstanceType<typeof ActionHotbar>>()
const unavailable = computed(() => !props.player.alive || props.player.cooldowns.stunMsLeft > 0)
const target = computed(() => props.characters.find((actor) => actor.id === selectedId.value))
function send(command: ClientMessage): void {
    props.game?.sendCommand(command)
}
function cancel(clear = false): void {
    send({ type: 'cancel_control' })
    if (clear) selectedId.value = undefined
}
function select(id: string, open = false): void {
    const character = props.characters.find((actor) => actor.id === id)
    if (!character || character.tags.includes('offline')) return
    selectedId.value = id
    if (open && relation(character, props.player) !== 'hostile') emit('interact', id)
}
function key(event: KeyboardEvent): void {
    if (combatKeyBlocked(event, props.blocked)) return
    const digit = /^Digit([1-4])$/.exec(event.code)
    if (!['KeyT', 'KeyF', 'KeyQ', 'Escape'].includes(event.code) && !digit) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    if (event.code !== 'Escape' && unavailable.value) return
    if (digit) {
        const slot = Number(digit[1]) - 1
        if (event.shiftKey) void hotbar.value?.edit(slot)
        else hotbar.value?.activate(slot)
        return
    }
    const actions: Record<string, () => void> = {
        Escape: () => cancel(true),
        KeyF: () => {
            selectedId.value = props.player.id
        },
        KeyT: () => {
            selectedId.value = nextTarget(
                props.characters,
                props.player,
                selectedId.value,
                event.shiftKey
            )
        },
        KeyQ: attack,
    }
    actions[event.code]?.()
}
function attack(): void {
    if (target.value && relation(target.value, props.player) === 'hostile' && target.value.alive)
        send({
            type: 'auto_attack',
            targetId:
                props.player.control?.mode === 'attack' &&
                props.player.control.targetId === target.value.id
                    ? null
                    : target.value.id,
        })
    else if (!target.value || relation(target.value, props.player) !== 'hostile')
        send({ type: 'attack' })
}
function blur(): void {
    cancel()
}
watch(
    () => props.player.id,
    () => {
        selectedId.value = undefined
    }
)
watch(
    () => props.snapshot.location?.id,
    () => {
        selectedId.value = undefined
        if (props.player.control?.mode !== 'follow') cancel()
    }
)
watch(
    () => props.blocked,
    (blocked) => {
        if (blocked) cancel()
    }
)
watch(
    () => !props.player.alive || props.player.cooldowns.stunMsLeft > 0,
    (disrupted) => {
        if (disrupted) cancel()
    }
)
watch(
    () => props.characters,
    () => {
        if (selectedId.value && !target.value) {
            selectedId.value = undefined
            if (props.player.control?.mode !== 'follow') cancel()
        }
        if (
            target.value &&
            !target.value.alive &&
            relation(target.value, props.player) === 'hostile'
        )
            cancel(true)
    }
)
watch(target, (character) =>
    props.game?.setCombatTarget(
        character
            ? {
                  key: `character:${character.id}`,
                  kind: 'character',
                  position: character.position,
                  relationship: relation(character, props.player),
              }
            : undefined
    )
)
onMounted(() => {
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', blur)
})
onBeforeUnmount(() => {
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('blur', blur)
    props.game?.setCombatTarget(undefined)
})
defineExpose({ selectedId, select, cancel })
</script>
<template>
    <PartyPanel
        v-if="snapshot.party"
        :party="snapshot.party"
        :current-location-id="snapshot.location?.id"
        :selected-id="selectedId"
        @select="select"
    />
    <aside v-if="target" class="target-panel rpg-panel" aria-label="Выбранная цель">
        <strong>{{ target.nickname }}</strong
        ><span>{{ Math.round((target.hp / Math.max(1, target.maxHp)) * 100) }}%</span>
        <small>{{
            target.id === player.id
                ? 'Вы'
                : relation(target, player) === 'hostile'
                  ? 'Враг · Q автоатака'
                  : 'Союзник · E действия'
        }}</small>
    </aside>
    <p v-if="player.cooldowns.stunMsLeft > 0" class="control-status rpg-panel" role="status">
        СТАН · {{ (player.cooldowns.stunMsLeft / 1000).toFixed(1) }} с
    </p>
    <p v-else-if="player.abilities?.casting" class="control-status rpg-panel" role="status">
        Воскрешение ·
        {{
            (
                Math.max(0, player.abilities.casting.completesAt - snapshot.serverTime) / 1000
            ).toFixed(1)
        }}
        с
    </p>
    <ActionHotbar
        ref="hotbar"
        :player="player"
        :target="target"
        :characters="characters"
        :can-reach="(target) => game?.isInteractionVisible(target.position, undefined, 48) ?? false"
        :blocked="blocked"
        @command="send"
        @cancel="cancel()"
        @preview-change="game?.setPrayerPreview?.($event)"
    />
    <span class="target-help">T враги · Shift+T союзники · F себя · Q автоатака</span>
</template>
<style scoped>
.target-panel {
    position: absolute;
    top: 58px;
    left: 50%;
    transform: translateX(-50%);
    width: 220px;
    z-index: 4;
    padding: 9px 12px;
    box-sizing: border-box;
}
.target-panel strong {
    font-size: 13px;
}
.target-panel > span {
    float: right;
}
.target-panel small {
    display: block;
    color: #b9c7a4;
    font-size: 10px;
}
.control-status {
    position: absolute;
    left: 50%;
    top: 42%;
    transform: translateX(-50%);
    padding: 10px;
    z-index: 9;
    color: var(--rpg-focus);
}
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
    .target-panel {
        top: 54px;
        width: 164px;
    }
    .target-help {
        font-size: 9px;
    }
}
</style>
