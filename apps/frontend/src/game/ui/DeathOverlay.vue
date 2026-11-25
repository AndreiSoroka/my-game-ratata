<script setup lang="ts">
import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed, onMounted, ref, useId } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import { useEscapeOwner } from './uiEscapeOwners'
import { activateFocusedButton, navigatePanelFocus } from './uiKeyboard'

const props = withDefaults(
    defineProps<{
        character: CharacterSnapshot | undefined
        defeated: boolean
        pending?: boolean
        connected?: boolean
    }>(),
    { pending: false, connected: true }
)
const emit = defineEmits<{ newLife: []; abandonLife: []; openMenu: [] }>()
const panel = ref<HTMLElement>()
useEscapeOwner({
    active: () => true,
    element: panel,
    priority: 175,
    escape: () => emit('openMenu'),
})
const headingId = useId()
const detailId = useId()
const seconds = computed(() =>
    Math.max(
        0,
        Math.ceil(
            (props.character?.life?.reviveMsLeft ?? props.character?.cooldowns.respawnMsLeft ?? 0) /
                1000
        )
    )
)
const heartSeconds = computed(() =>
    props.character?.life?.lichReturnMsLeft === undefined
        ? undefined
        : Math.ceil(props.character.life.lichReturnMsLeft / 1000)
)
onMounted(() => panel.value?.focus())
function key(event: KeyboardEvent): void {
    if (event.code === 'Tab') {
        event.preventDefault()
        const button = panel.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ;(button ?? panel.value)?.focus()
        return
    }
    if (!activateFocusedButton(event, panel.value)) navigatePanelFocus(event, panel.value)
}
</script>

<template>
    <section
        class="death-overlay"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="headingId"
        :aria-describedby="detailId"
        :aria-busy="pending"
        @keydown.stop="key"
        @keyup.stop
    >
        <div ref="panel" class="death-overlay__card game-frame-host" tabindex="-1">
            <GameFrame variant="window" />
            <p class="death-overlay__eyebrow">
                {{
                    defeated
                        ? tGame('game.world.storyOver')
                        : tGame('game.world.betweenLifeAndDeath')
                }}
            </p>
            <h2 :id="headingId">
                {{ defeated ? tGame('game.world.heroDied') : tGame('game.world.youFell') }}
            </h2>
            <template v-if="!defeated">
                <template v-if="seconds > 0 || heartSeconds === undefined">
                    <p class="death-overlay__countdown">
                        {{ seconds }} <span>{{ tGame('game.world.seconds') }}</span>
                    </p>
                    <p>
                        {{ tGame('game.world.clericCanStillBringYou') }}
                    </p>
                </template>
                <p v-if="heartSeconds !== undefined">
                    {{
                        heartSeconds > 0
                            ? tGame('game.world.lichHeartCallsIn', { seconds: heartSeconds })
                            : tGame('game.world.lichHeartNeedsSpace')
                    }}
                </p>
                <p :id="detailId">
                    {{ tGame('game.world.startingOverMakesThisHero') }}
                </p>
                <GameButton
                    variant="danger"
                    :disabled="pending || !connected"
                    @click="$emit('abandonLife')"
                >
                    {{ pending ? tGame('game.world.endingLife') : tGame('game.world.startOver') }}
                </GameButton>
                <p v-if="!connected" role="status">
                    {{ tGame('game.world.disconnectedFromServer') }}
                </p>
            </template>
            <template v-else>
                <p :id="detailId">
                    {{ tGame('game.world.yourNextLifeStartsWith') }}
                </p>
                <GameButton variant="primary" @click="$emit('newLife')">{{
                    tGame('game.world.startNewLife')
                }}</GameButton>
            </template>
        </div>
    </section>
</template>

<style scoped>
.death-overlay {
    position: absolute;
    inset: 0;
    z-index: 15;
    display: grid;
    place-items: center;
    background: #090b13bf;
    backdrop-filter: grayscale(0.7);
    padding: clamp(12px, 4vw, 24px);
    overflow: auto;
    box-sizing: border-box;
}
.death-overlay__card {
    width: min(440px, 100%);
    padding: clamp(18px, 5vw, 30px);
    color: #eee2ce;
    border: 1px solid transparent;
    text-align: center;
    box-sizing: border-box;
}
.death-overlay__eyebrow {
    color: #b5a48e;
    font:
        10px/1.4 system-ui,
        sans-serif;
    letter-spacing: 2px;
}
.death-overlay h2 {
    color: #e1bf8d;
    font-size: 25px;
    margin: 15px 0;
}
.death-overlay p {
    font:
        14px/1.6 system-ui,
        sans-serif;
}
.death-overlay .death-overlay__countdown {
    color: #f2d2a3;
    font-size: 44px;
    font-variant-numeric: tabular-nums;
    margin: 14px 0;
}
.death-overlay__countdown span {
    font-size: 13px;
    display: block;
}
.death-overlay button {
    margin-top: 18px;
    padding: 12px 18px;
    border: 1px solid transparent;
    cursor: pointer;
}
.death-overlay button:disabled {
    opacity: 0.65;
    cursor: wait;
}
.death-overlay__card:focus {
    outline: none;
}
</style>
