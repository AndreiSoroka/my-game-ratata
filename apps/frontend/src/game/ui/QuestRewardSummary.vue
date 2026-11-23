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
        <p class="quest-reward-total">
            {{ tGame('game.quests.totalReward') }} {{ total }} {{ tGame('game.conversation.gold') }}
        </p>
        <template v-if="mode">
            <p>
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
        <p v-if="completed && shares" class="quest-reward-received">
            {{ tGame('game.quests.youReceived') }} {{ ownShare?.gold ?? 0 }}
            {{ tGame('game.conversation.gold') }}
        </p>
    </div>
</template>

<style scoped>
.quest-reward-summary {
    font:
        12px/1.5 system-ui,
        sans-serif;
    margin-top: 12px;
}
.quest-reward-summary p {
    margin: 4px 0;
}
.quest-reward-total,
.quest-reward-received {
    color: var(--quest-panel-title, #e9cf8d);
}
.quest-reward-summary small {
    display: block;
    color: var(--quest-panel-muted, #b4c0ac);
}
</style>
