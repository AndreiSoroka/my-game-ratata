<script setup lang="ts">
import { type CharacterSnapshot, type QuestOfferSnapshot } from '@my-game-ratata/contracts'

import { characterName, tGame, tLocalized } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { ItemSlot } from '@/shared/ui/common'

import { questObjectiveText } from '../model/questTermsText'
import QuestItemList from './QuestItemList.vue'

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
            <ItemSlot
                v-if="!detailsOnly && objective.kind === 'deliver'"
                size="compact"
                :src="itemAssetCatalog[objective.itemId].src"
                alt=""
            />
            <span
                >{{ questObjectiveText(offer, index, objective, characters) }}
                <span v-if="progress" class="quest-terms__progress">
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
            <QuestItemList
                :items="
                    offer.rewardItems.map((item) => ({
                        itemId: item.itemId,
                        quantity: item.quantity ?? 1,
                    }))
                "
                kind="reward"
                :show-heading="false"
            />
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
.quest-terms__progress {
    color: var(--quest-panel-muted, var(--ui-dark-panel-warning));
}
</style>
