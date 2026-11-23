<script setup lang="ts">
import { type CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { abilityName, tGame } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'

const props = defineProps<{ player: CharacterSnapshot; serverTime?: number }>()
const emit = defineEmits<{ cancelPrayer: []; cancelMagic: []; cancelRoute: [] }>()
const stunned = computed(() => props.player.cooldowns.stunMsLeft > 0)
const casting = computed(() => props.player.abilities?.casting)
const magicChannel = computed(() => props.player.abilities?.magicChannel)
const magicSeconds = computed(() => {
    const channel = magicChannel.value
    return channel
        ? Math.max(
              0,
              Math.ceil((channel.completesAt - (props.serverTime ?? channel.startedAt)) / 1000)
          )
        : 0
})
const blockedRoute = computed(() => {
    const control = props.player.control
    return props.player.alive && control?.mode === 'route' && control.route?.waiting === 'blocked'
        ? control.route
        : undefined
})
const remainingSeconds = computed(() => {
    const remaining = blockedRoute.value?.remainingFailureMs
    return remaining === undefined ? undefined : Math.ceil(Math.max(0, remaining) / 1000)
})
</script>
<template>
    <div
        v-if="!stunned && magicChannel"
        class="control-status control-status--magic rpg-panel game-frame-host"
    >
        <GameFrame variant="panel" />
        <span role="status"
            >{{ abilityName(magicChannel.abilityId) }} · {{ magicSeconds }}
            {{ tGame('game.knowledge.s') }}</span
        >
        <GameButton :aria-label="tGame('game.world.interruptSpell')" @click="emit('cancelMagic')">{{
            tGame('game.world.interruptEsc')
        }}</GameButton>
    </div>
    <GameButton
        v-else-if="!stunned && casting && !casting.uninterruptible"
        class="prayer-cancel"
        icon
        :aria-label="tGame('game.world.interruptPrayer')"
        @keydown.esc.stop.prevent="emit('cancelPrayer')"
        @click="emit('cancelPrayer')"
    >
        ×
    </GameButton>
    <div
        v-else-if="!stunned && !casting && blockedRoute?.points[0]"
        class="control-status control-status--route rpg-panel game-frame-host"
        role="status"
    >
        <GameFrame variant="panel" />
        {{ tGame('game.world.point') }} {{ blockedRoute.points[0].number
        }}{{ tGame('game.world.pathBlocked')
        }}<template v-if="remainingSeconds !== undefined">
            {{ tGame('game.world.cancellingIn') }} {{ remainingSeconds }}
            {{ tGame('game.knowledge.s') }}</template
        >
        {{ tGame('game.world.escStop') }}
        <GameButton @click="emit('cancelRoute')">{{ tGame('game.world.stopRoute') }}</GameButton>
    </div>
</template>
<style scoped>
.control-status,
.prayer-cancel {
    position: absolute;
    left: 50%;
    top: 42%;
    transform: translateX(-50%);
    z-index: 9;
}
.control-status {
    padding: 10px;
    color: var(--rpg-focus);
}
.control-status button {
    display: block;
    margin: 8px auto 0;
    padding: 6px 12px;
    border: 1px solid transparent;
    cursor: pointer;
}
.prayer-cancel {
    display: none;
}
@media (max-width: 640px), (pointer: coarse) {
    .prayer-cancel {
        display: inline-grid;
        min-width: 44px;
        min-height: 44px;
    }
}
.control-status--route,
.control-status--magic {
    width: max-content;
    max-width: calc(100% - 32px);
    box-sizing: border-box;
    text-align: center;
}
</style>
