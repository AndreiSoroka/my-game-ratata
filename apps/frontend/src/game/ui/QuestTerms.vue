<script setup lang="ts">
import {
    type CharacterSnapshot,
    ITEM_DEFINITIONS,
    type QuestObjective,
    type QuestOfferSnapshot,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import ItemIcon from './ItemIcon.vue'
import { itemStackLabel } from './itemLabels'

const props = defineProps<{
    offer: QuestOfferSnapshot
    characters: CharacterSnapshot[]
    progress?: number[]
}>()
function name(id: string): string {
    return props.characters.find((character) => character.id === id)?.nickname ?? id
}
function place(id: string): string {
    return WORLD_LOCATION_DEFINITIONS.find((location) => location.id === id)?.name ?? id
}
function describe(objective: QuestObjective): string {
    if (objective.kind === 'deliver')
        return `Доставить: ${ITEM_DEFINITIONS[objective.itemId].name} × ${objective.quantity}. Получатель: ${name(objective.recipientId)}.`
    if (objective.kind === 'visit') return `Посетить: ${place(objective.locationId)}.`
    if (objective.kind === 'defeat')
        return `Победить: ${objective.archetype} × ${objective.quantity}. Место: ${place(objective.locationId)}.`
    return `Расспросить по поручению: ${name(objective.targetId)}.`
}
</script>
<template>
    <p>
        Заказчик: <strong>{{ offer.issuerName }}</strong>
    </p>
    <h3>{{ offer.title }}</h3>
    <p>{{ offer.description }}</p>
    <ol class="quest-terms__objectives">
        <li v-for="(objective, index) in offer.objectives" :key="index">
            <ItemIcon
                v-if="objective.kind === 'deliver'"
                :item="{ itemId: objective.itemId, quantity: objective.quantity }"
            />
            <span
                >{{ offer.objectiveLabels?.[index] ?? describe(objective) }}
                <span v-if="progress" class="social-status">
                    · {{ progress[index] ?? 0 }} /
                    {{
                        objective.kind === 'deliver' || objective.kind === 'defeat'
                            ? objective.quantity
                            : 1
                    }}</span
                ></span
            >
        </li>
    </ol>
    <p v-if="!offer.rewardGold && !offer.rewardItems.length">Просьба без награды.</p>
    <template v-else>
        <p>
            Награда: {{ offer.rewardGold }} золота{{
                ['city', 'worker'].includes(offer.funding) ? ' из городского фонда' : ''
            }}.
        </p>
        <ul v-if="offer.rewardItems.length">
            <li v-for="item in offer.rewardItems" :key="item.instanceId" class="quest-item-reward">
                <ItemIcon :item="item" />
                {{ itemStackLabel(item) }}
            </li>
        </ul>
        <p v-if="offer.rewardItems.length" class="social-muted">
            Предметную награду получает тот, кто сдаёт договор.
        </p>
    </template>
</template>
<style scoped>
.quest-terms__objectives {
    padding-left: 20px;
}
.quest-terms__objectives li {
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.quest-item-reward {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}
</style>
