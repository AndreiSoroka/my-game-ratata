<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { activeQuests, questStatusLabel } from './activeQuests'
import GuildQuestCard from './GuildQuestCard.vue'
import ItemIcon from './ItemIcon.vue'
import GameButton from './primitives/GameButton.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'
import QuestTerms from './QuestTerms.vue'

const props = defineProps<{
    snapshot?: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const entries = computed(() => activeQuests(props.snapshot))
const selectedKey = ref<string>()
const selected = computed(
    () => entries.value.find((entry) => entry.key === selectedKey.value) ?? entries.value[0]
)
watch(entries, () => {
    if (!entries.value.some((entry) => entry.key === selectedKey.value))
        selectedKey.value = entries.value[0]?.key
})
const leader = computed(
    () => !props.snapshot?.party?.leaderId || props.snapshot.party.leaderId === props.player.id
)
</script>
<template>
    <section class="character-quests" aria-label="Активные квесты">
        <p v-if="!entries.length" class="quests-empty">Активных квестов нет.</p>
        <template v-else>
            <nav class="quest-list" aria-label="Список активных квестов">
                <GameButton
                    v-for="entry in entries"
                    :key="entry.key"
                    :aria-current="selected?.key === entry.key ? 'true' : undefined"
                    @click="selectedKey = entry.key"
                >
                    <strong>{{ entry.quest.title }}</strong>
                    <small>{{ questStatusLabel(entry.quest.status) }}</small>
                </GameButton>
            </nav>
            <article v-if="selected" class="quest-detail" aria-label="Подробности квеста">
                <template v-if="selected.source === 'npc'">
                    <QuestTerms
                        :offer="selected.quest"
                        :characters="characters"
                        :progress="selected.quest.progress"
                    />
                    <p role="status">{{ questStatusLabel(selected.quest.status) }}</p>
                    <QuestRewardSummary
                        :total="selected.quest.rewardGold"
                        :mode="selected.quest.rewardMode"
                    />
                    <p v-if="selected.quest.notice" role="status">{{ selected.quest.notice }}</p>
                    <p class="quest-help">
                        Вернитесь к {{ selected.quest.issuerName }} и скажите «квест готов».
                    </p>
                    <GameButton
                        variant="danger"
                        :disabled="!leader || !player.alive"
                        @click="
                            emit('command', {
                                type: 'npc_quest_abandon',
                                instanceId: selected.quest.instanceId,
                            })
                        "
                    >
                        Отменить договор
                    </GameButton>
                </template>
                <template v-else-if="selected.source === 'guild'">
                    <GuildQuestCard
                        :job="selected.quest"
                        :player-id="player.id"
                        :can-abandon="leader && player.alive"
                        actions="abandon"
                        @command="emit('command', $event)"
                    />
                    <p class="quest-help">
                        Поговорите с распорядителем поручения о следующем шаге или скажите «квест
                        готов».
                    </p>
                </template>
                <template v-else>
                    <h2>{{ selected.quest.title }}</h2>
                    <p>{{ selected.quest.description }}</p>
                    <p class="quest-item-goal">
                        <ItemIcon
                            :item="{ itemId: selected.quest.requiredItemId ?? 'slime_heart' }"
                        />
                        <span>Собрано: {{ selected.trophies }} / {{ selected.quest.goal }}</span>
                    </p>
                    <progress
                        :value="selected.trophies"
                        :max="selected.quest.goal"
                        aria-label="Прогресс поручения"
                    />
                    <p>{{ questStatusLabel(selected.quest.status) }}</p>
                    <QuestRewardSummary
                        :total="selected.quest.rewardGold"
                        :mode="selected.quest.rewardMode"
                    />
                    <p class="quest-help">
                        Вернитесь к Мире в гильдию Новогорода и скажите «квест готов».
                    </p>
                </template>
            </article>
        </template>
    </section>
</template>
<style scoped>
.character-quests {
    display: grid;
    grid-template-columns: minmax(170px, 0.7fr) minmax(0, 1.5fr);
    gap: 22px;
}
.quests-empty {
    grid-column: 1 / -1;
    color: #b9c4c9;
}
.quest-list {
    display: grid;
    align-content: start;
    gap: 8px;
}
.quest-list button {
    text-align: left;
    border: 1px solid transparent;
    padding: 12px;
    overflow-wrap: anywhere;
}
.quest-list strong,
.quest-list small {
    display: block;
}
.quest-list small {
    margin-top: 5px;
    color: #b5c9aa;
}
.quest-detail {
    min-width: 0;
    overflow-wrap: anywhere;
}
.quest-detail h2 {
    font-size: 20px;
}
.quest-detail :deep(.quest-card) {
    border: 0;
    margin: 0;
    padding: 0;
}
.quest-detail button {
    padding: 8px 12px;
    border: 1px solid transparent;
}
.quest-detail button:disabled {
    opacity: 0.5;
}
.quest-help {
    color: #d8c996;
}
.quest-item-goal {
    display: flex;
    gap: 12px;
    align-items: center;
}
progress {
    width: 100%;
    accent-color: #a4c07c;
}
@media (max-width: 740px) {
    .character-quests {
        grid-template-columns: 1fr;
        gap: 16px;
    }
}
</style>
