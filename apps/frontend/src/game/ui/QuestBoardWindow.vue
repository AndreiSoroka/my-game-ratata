<script setup lang="ts">
import type { QuestBoardEntry, QuestBoardSnapshot } from '@my-game-ratata/contracts'
import { onUnmounted } from 'vue'

import { tGame, tLocalized } from '@/shared/lib/i18n'

import { focusWorldInput } from './keyboardOwnership'
import SocialWindow from './SocialWindow.vue'

defineProps<{ board: QuestBoardSnapshot }>()
const emit = defineEmits<{ close: [] }>()

const statusKeys = {
    available: 'game.quests.boardAvailable',
    active: 'game.quests.inProgress',
    ready: 'game.quests.readyToTurnIn',
} as const satisfies Record<QuestBoardEntry['status'], string>

onUnmounted(() => {
    if (document.activeElement === document.body) focusWorldInput()
})
</script>

<template>
    <SocialWindow :title="tGame('game.quests.boardTitle')" modal @close="emit('close')">
        <p v-if="!board.entries.length">{{ tGame('game.quests.boardEmpty') }}</p>
        <template v-else>
            <p>{{ tGame('game.quests.boardHint') }}</p>
            <ul class="quest-board__orders" role="list" tabindex="0">
                <li v-for="entry in board.entries" :key="entry.id">
                    <h3>{{ tLocalized(entry.titleMessage, entry.title) }}</h3>
                    <p>{{ tLocalized(entry.descriptionMessage, entry.description) }}</p>
                    <ul v-if="entry.objectiveLabels?.length" class="quest-board__objectives">
                        <li v-for="(label, index) in entry.objectiveLabels" :key="index">
                            {{ tLocalized(entry.objectiveMessages?.[index] ?? undefined, label) }}
                        </li>
                    </ul>
                    <p class="quest-board__terms">
                        <strong>{{
                            tGame('game.quests.boardReward', { gold: entry.rewardGold })
                        }}</strong>
                        <span>{{ tGame(statusKeys[entry.status]) }}</span>
                    </p>
                </li>
            </ul>
        </template>
    </SocialWindow>
</template>

<style scoped>
.quest-board__orders {
    display: grid;
    padding: 0;
    margin: 12px 0 0;
    list-style: none;
}
.quest-board__orders > li {
    border-block-start: 1px solid var(--game-ui-brass-muted);
    padding-block: 12px;
}
.quest-board__orders h3,
.quest-board__orders p {
    margin-block: 0 6px;
}
.quest-board__objectives {
    margin-block: 0 8px;
    padding-inline-start: 24px;
}
.quest-board__terms {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
}
</style>
