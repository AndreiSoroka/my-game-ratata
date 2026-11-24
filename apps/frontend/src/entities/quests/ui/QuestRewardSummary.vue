<script setup lang="ts">
import type { QuestRewardMode, QuestRewardShare } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'

const props = defineProps<{
    total: number
    mode?: QuestRewardMode
    shares?: QuestRewardShare[]
    playerId?: string
    completed?: boolean
}>()
const ownShare = computed(() => props.shares?.find((share) => share.characterId === props.playerId))
</script>

<template>
    <div class="quest-reward-summary">
        <p>
            {{ tGame('game.quests.totalReward') }}
            <strong>{{ total }} {{ tGame('game.conversation.gold') }}</strong>
        </p>
        <template v-if="mode">
            <p class="quest-reward-distribution">
                {{
                    mode === 'submitter'
                        ? tGame('game.quests.allToSubmitter')
                        : tGame('game.quests.equalSplit')
                }}
            </p>
            <small v-if="mode === 'party_equal' && !completed">
                {{ tGame('game.quests.splitAmongPartyMembersAt') }}
            </small>
            <small v-if="!completed">{{ tGame('game.quests.rewardDistributionWasFixedAt') }}</small>
        </template>
        <p v-if="completed && shares">
            {{ tGame('game.quests.youReceived') }}
            <strong>{{ ownShare?.gold ?? 0 }} {{ tGame('game.conversation.gold') }}</strong>
        </p>
    </div>
</template>

<style scoped>
.quest-reward-summary {
    display: grid;
    gap: 3px;
    min-inline-size: 0;
    font:
        13px/1.45 system-ui,
        sans-serif;
    margin-block-start: 12px;
    color: var(--quest-panel-text, var(--ui-dark-panel-text));
    overflow-wrap: anywhere;
}
.quest-reward-summary p {
    margin: 0;
}
.quest-reward-summary strong {
    color: var(--quest-panel-title, var(--ui-dark-panel-title));
    font-weight: 650;
    font-variant-numeric: tabular-nums;
}
.quest-reward-distribution {
    font-weight: 550;
}
.quest-reward-summary small {
    color: var(
        --quest-panel-muted,
        color-mix(in srgb, var(--ui-dark-panel-text) 78%, var(--ui-dark-panel-surface))
    );
    font-size: 12px;
}
</style>
