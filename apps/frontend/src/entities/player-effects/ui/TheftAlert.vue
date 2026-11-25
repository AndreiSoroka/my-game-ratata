<script setup lang="ts">
import { THEFT_RULES, type TheftAccusation } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { darkPanelButtonColors, HudFrame, UiButton } from '@/shared/ui/common'

const props = defineProps<{
    evidence: readonly TheftAccusation[]
    alive: boolean
    serverTime: number
}>()
const emit = defineEmits<{ callGuards: [targetId: string] }>()
const accusations = computed(() =>
    props.evidence.filter(
        (accusation) => accusation.expiresAt > props.serverTime && !accusation.reported
    )
)
const hasAssault = computed(() => accusations.value.some((proof) => proof.offense === 'attack'))
const hasTheft = computed(() => accusations.value.some((proof) => proof.offense !== 'attack'))
</script>
<template>
    <HudFrame
        v-if="accusations.length"
        class="theft-alert"
        role="region"
        :aria-label="
            tGame(
                hasAssault
                    ? 'game.world.assaultEvidenceAvailable'
                    : 'game.world.attemptedTheftSpotted'
            )
        "
    >
        <div class="theft-alert__content">
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
                <UiButton
                    v-if="accusation.canCallGuards"
                    size="small"
                    :colors="darkPanelButtonColors"
                    :disabled="!alive"
                    @click="emit('callGuards', accusation.thiefId)"
                >
                    {{ tGame('game.world.callGuardsNow') }}
                </UiButton>
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
        </div>
    </HudFrame>
</template>
<style scoped>
.theft-alert__content {
    padding: 5px;
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
    color: var(--ui-dark-panel-muted, var(--ui-dark-panel-text));
    margin-top: 8px;
}
</style>
