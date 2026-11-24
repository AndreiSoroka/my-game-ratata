<script setup lang="ts">
import { type CharacterSnapshot, type QuestOfferSnapshot } from '@my-game-ratata/contracts'

import { characterName, tGame, tLocalized } from '@/shared/lib/i18n'

import ItemIcon from './ItemIcon.vue'
import { itemStackLabel } from './itemLabels'
import { questObjectiveText } from './questTermsText'

defineProps<{
    offer: QuestOfferSnapshot
    characters: CharacterSnapshot[]
    progress?: number[]
    detailsOnly?: boolean
}>()
</script>
<template>
    <p>
        {{ tGame('game.quests.questGiver') }}
        <strong>{{ characterName(offer.issuerId, offer.issuerName) }}</strong>
    </p>
    <h3>{{ tLocalized(offer.titleMessage, offer.title) }}</h3>
    <p>{{ tLocalized(offer.descriptionMessage, offer.description) }}</p>
    <ol class="quest-terms__objectives">
        <li v-for="(objective, index) in offer.objectives" :key="index">
            <ItemIcon
                v-if="!detailsOnly && objective.kind === 'deliver'"
                :item="{ itemId: objective.itemId, quantity: objective.quantity }"
            />
            <span
                >{{ questObjectiveText(offer, index, objective, characters) }}
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
        <li
            v-for="(label, index) in offer.objectiveLabels?.slice(offer.objectives.length)"
            :key="`extra-${index}`"
        >
            {{
                tLocalized(
                    offer.objectiveMessages?.[offer.objectives.length + index] ?? undefined,
                    label
                )
            }}
        </li>
    </ol>
    <template v-if="!detailsOnly">
        <p v-if="!offer.rewardGold && !offer.rewardItems.length">
            {{ tGame('game.quests.unpaidRequest') }}
        </p>
        <template v-else>
            <p>
                {{ tGame('game.quests.reward') }} {{ offer.rewardGold }}
                {{ tGame('game.quests.gold')
                }}{{
                    ['city', 'worker'].includes(offer.funding)
                        ? tGame('game.quests.fromCityFund')
                        : ''
                }}.
            </p>
            <ul v-if="offer.rewardItems.length">
                <li
                    v-for="item in offer.rewardItems"
                    :key="item.instanceId"
                    class="quest-item-reward"
                >
                    <ItemIcon :item="item" />
                    {{ itemStackLabel(item) }}
                </li>
            </ul>
            <p v-if="offer.rewardItems.length" class="social-muted">
                {{ tGame('game.quests.personWhoTurnsInContract') }}
            </p>
        </template>
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
