<script setup lang="ts">
import type {
    AdventureMaterial,
    AdventureRecipe,
    AdventureSnapshot,
    ClientMessage,
} from '@my-game-ratata/contracts'

const props = defineProps<{ adventure: AdventureSnapshot; alive: boolean }>()
defineEmits<{ close: []; command: [message: ClientMessage] }>()
const materials: { id: AdventureMaterial; label: string }[] = [
    { id: 'herbs', label: 'Травы' },
    { id: 'fiber', label: 'Волокно' },
    { id: 'scrap', label: 'Металл' },
    { id: 'wood', label: 'Древесина' },
    { id: 'grain', label: 'Зерно пшеницы' },
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
    <section class="adventure-crafting adventure-window" aria-label="Материалы и ремесло">
        <header class="adventure-window__header">
            <span>ПОЛЕВОЕ РЕМЕСЛО</span>
            <button type="button" aria-label="Закрыть ремесло" @click="$emit('close')">×</button>
        </header>
        <dl class="crafting-materials">
            <template v-for="material in materials" :key="material.id">
                <dt>{{ material.label }}</dt>
                <dd>{{ adventure.materials[material.id] }}</dd>
            </template>
        </dl>
        <p class="adventure-subtle">
            Ищите ресурсы в мире. Подойдите ближе и соберите их — первые вещи можно сделать самому.
        </p>
        <article v-for="recipe in adventure.recipes" :key="recipe.id" class="crafting-recipe">
            <div>
                <strong>{{ recipe.label }}</strong>
                <p>{{ costLabel(recipe) }}</p>
            </div>
            <button
                type="button"
                :disabled="!canCraft(recipe)"
                @click="$emit('command', { recipeId: recipe.id, type: 'craft' })"
            >
                Создать
            </button>
        </article>
    </section>
</template>
