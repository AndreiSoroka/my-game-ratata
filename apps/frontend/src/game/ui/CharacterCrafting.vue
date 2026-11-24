<script setup lang="ts">
import type {
    AdventureMaterial,
    AdventureRecipe,
    AdventureSnapshot,
    ClientMessage,
} from '@my-game-ratata/contracts'

import { craftOrderPaymentText, craftOrderStatusLabels } from '@/entities/shops'
import { itemName, tGame, tLocalized } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'

const props = defineProps<{ adventure: AdventureSnapshot; alive: boolean }>()
defineEmits<{ command: [message: ClientMessage] }>()
const materials: { id: AdventureMaterial; label: string }[] = [
    {
        id: 'herbs',
        get label() {
            return tGame('game.character.herbs')
        },
    },
    {
        id: 'fiber',
        get label() {
            return tGame('game.character.fiber')
        },
    },
    {
        id: 'scrap',
        get label() {
            return tGame('game.character.metal')
        },
    },
    {
        id: 'wood',
        get label() {
            return tGame('game.character.timber')
        },
    },
    {
        id: 'grain',
        get label() {
            return tGame('game.character.wheatGrain')
        },
    },
]

function costLabel(recipe: AdventureRecipe): string {
    return materials
        .filter((material) => (recipe.cost[material.id] ?? 0) > 0)
        .map((material) => `${material.label}: ${String(recipe.cost[material.id])}`)
        .join(' · ')
}

function canCraft(recipe: AdventureRecipe): boolean {
    return (
        props.alive &&
        materials.every(
            (material) => props.adventure.materials[material.id] >= (recipe.cost[material.id] ?? 0)
        )
    )
}
</script>

<template>
    <section class="character-crafting" :aria-label="tGame('game.character.materialsAndCrafting')">
        <dl class="crafting-materials">
            <template v-for="material in materials" :key="material.id">
                <dt>{{ material.label }}</dt>
                <dd>{{ adventure.materials[material.id] }}</dd>
            </template>
        </dl>
        <p class="crafting-hint">
            {{ tGame('game.character.lookForResourcesInWorld') }}
        </p>
        <article v-for="recipe in adventure.recipes" :key="recipe.id" class="crafting-recipe">
            <div>
                <strong>{{ tLocalized(recipe.labelMessage, recipe.label) }}</strong>
                <p>{{ costLabel(recipe) }}</p>
            </div>
            <GameButton
                :disabled="!canCraft(recipe)"
                @click="$emit('command', { recipeId: recipe.id, type: 'craft' })"
            >
                {{ tGame('game.character.craft') }}
            </GameButton>
        </article>
        <section
            v-if="adventure.craftOrders?.length"
            :aria-label="tGame('game.quests.workshopOrders')"
        >
            <h3>{{ tGame('game.quests.workshopOrders') }}</h3>
            <p v-for="order in adventure.craftOrders" :key="order.id">
                <strong
                    >{{ itemName(order.itemId) }} —
                    {{ craftOrderStatusLabels[order.status] }}</strong
                ><br /><small>{{ craftOrderPaymentText(order) }}</small>
            </p>
        </section>
    </section>
</template>

<style scoped>
.character-crafting {
    max-inline-size: 640px;
}
.crafting-materials {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
    gap: 8px 12px;
    margin: 0 0 18px;
    font-size: 13px;
}
.crafting-materials dd {
    color: #eacf8b;
    margin: 0;
    font-variant-numeric: tabular-nums;
}
.crafting-hint,
.crafting-recipe p {
    color: #b3bdab;
}
.crafting-hint {
    margin: 0 0 12px;
}
.crafting-recipe {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 0;
    border-top: 1px solid #526049;
    font-size: 13px;
}
.crafting-recipe p {
    font-size: 11px;
    margin: 4px 0 0;
}
</style>
