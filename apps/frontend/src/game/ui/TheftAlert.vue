<script setup lang="ts">
import { type CharacterSnapshot, type ClientMessage, THEFT_RULES } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'

const props = defineProps<{ player: CharacterSnapshot; serverTime: number }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const accusations = computed(
    () =>
        props.player.theft?.accusations.filter(
            (accusation) => accusation.expiresAt > props.serverTime && !accusation.reported
        ) ?? []
)
const hasAssault = computed(() => accusations.value.some((proof) => proof.offense === 'attack'))
const hasTheft = computed(() => accusations.value.some((proof) => proof.offense !== 'attack'))
</script>
<template>
    <aside
        v-if="accusations.length"
        class="theft-alert game-frame-host"
        role="region"
        :aria-label="
            tGame(
                hasAssault
                    ? 'game.world.assaultEvidenceAvailable'
                    : 'game.world.attemptedTheftSpotted'
            )
        "
    >
        <GameFrame variant="panel" />
        <strong role="alert">{{
            tGame(
                hasAssault
                    ? 'game.world.assaultEvidenceAvailable'
                    : 'game.world.youSpottedAttemptedTheft'
            )
        }}</strong>
        <div v-for="accusation in accusations" :key="accusation.thiefId">
            <p>
                {{ accusation.thiefName }}
                {{
                    tGame(
                        accusation.offense === 'attack'
                            ? 'game.world.assaultEvidence'
                            : 'game.world.evidence'
                    )
                }}
                {{ Math.ceil((accusation.expiresAt - serverTime) / 1000) }}
                {{ tGame('game.knowledge.s') }}
            </p>
            <GameButton
                v-if="accusation.canCallGuards"
                :disabled="!player.alive"
                @click="emit('command', { type: 'call_guards', targetId: accusation.thiefId })"
            >
                {{ tGame('game.world.callGuardsNow') }}
            </GameButton>
        </div>
        <small>
            {{ tGame('game.world.forFormalReportApproachGuard') }}
            <template v-if="hasTheft">
                {{ tGame('game.world.emergencyGuardCallWindow') }}
                {{ THEFT_RULES.accusationMs / 1000 }}
                {{ tGame('game.world.secondsEvidenceLastsFor') }}
                {{ THEFT_RULES.evidenceMs / 60_000 }} {{ tGame('game.world.minutes') }}
            </template>
        </small>
    </aside>
</template>
<style scoped>
.theft-alert {
    position: absolute;
    z-index: 8;
    left: 16px;
    bottom: 76px;
    width: min(320px, calc(100% - 32px));
    box-sizing: border-box;
    max-height: 40dvh;
    overflow: auto;
    padding: 12px;
    color: #f8e3c2;
    border: 1px solid transparent;
    font:
        13px/1.5 system-ui,
        sans-serif;
}
.theft-alert p {
    margin: 8px 0 4px;
}
.theft-alert button {
    width: 100%;
    text-align: left;
}
.theft-alert small {
    display: block;
    color: #c6b99d;
    margin-top: 8px;
}
@media (max-width: 740px) {
    .theft-alert {
        left: 12px;
        bottom: 164px;
        max-height: 40dvh;
        overflow: auto;
    }
}
</style>
