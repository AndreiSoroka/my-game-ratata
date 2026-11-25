<script setup lang="ts">
import { type CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { abilityName, tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

const props = defineProps<{ player: CharacterSnapshot; serverTime?: number }>()
const emit = defineEmits<{ cancelPrayer: []; cancelMagic: []; cancelRoute: [] }>()
const theme = useDarkPanelTheme()
const stunned = computed(() => props.player.cooldowns.stunMsLeft > 0)
const casting = computed(() => props.player.abilities?.casting)
const ashCasting = computed(() => props.player.abilities?.ashCasting)
const timedCast = computed(() => ashCasting.value ?? props.player.abilities?.magicChannel)
const castSeconds = computed(() => {
    const channel = timedCast.value
    return channel
        ? Math.max(
              0,
              Math.ceil((channel.completesAt - (props.serverTime ?? channel.startedAt)) / 1000)
          )
        : 0
})
function cancelTimedCast(): void {
    if (ashCasting.value) emit('cancelPrayer')
    else emit('cancelMagic')
}
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
        v-if="!stunned && timedCast"
        class="control-status control-status--magic"
        :style="darkPanelThemeStyle(theme)"
    >
        <span role="status"
            >{{ abilityName(timedCast.abilityId) }} · {{ castSeconds }}
            {{ tGame('game.knowledge.s') }}</span
        >
        <UiButton
            size="small"
            :aria-label="
                tGame(ashCasting ? 'game.world.interruptPrayer' : 'game.world.interruptSpell')
            "
            @click="cancelTimedCast"
            >{{ tGame('game.world.interruptEsc') }}</UiButton
        >
    </div>
    <UiButton
        size="small"
        v-else-if="!stunned && casting && !casting.uninterruptible"
        class="prayer-cancel"
        icon
        :aria-label="tGame('game.world.interruptPrayer')"
        @keydown.esc.stop.prevent="emit('cancelPrayer')"
        @click="emit('cancelPrayer')"
    >
        ×
    </UiButton>
    <div
        v-else-if="!stunned && !casting && blockedRoute?.points[0]"
        class="control-status control-status--route"
        :style="darkPanelThemeStyle(theme)"
        role="status"
    >
        {{ tGame('game.world.point') }} {{ blockedRoute.points[0].number
        }}{{ tGame('game.world.pathBlocked')
        }}<template v-if="remainingSeconds !== undefined">
            {{ tGame('game.world.cancellingIn') }} {{ remainingSeconds }}
            {{ tGame('game.knowledge.s') }}</template
        >
        {{ tGame('game.world.escStop') }}
        <UiButton size="small" @click="emit('cancelRoute')">{{
            tGame('game.world.stopRoute')
        }}</UiButton>
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
    background: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    color: var(--rpg-focus);
    font:
        14px/1.45 system-ui,
        sans-serif;
}
.control-status button {
    display: block;
    margin: 8px auto 0;
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
