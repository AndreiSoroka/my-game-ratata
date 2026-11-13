<script setup lang="ts">
import {
    ABILITY_DEFINITIONS,
    type CharacterSnapshot,
    type ClientMessage,
    type LearnAbilityId,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'
const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const learnable: LearnAbilityId[] = ['pray', 'spark', 'barrier', 'shot']
const known = computed(() => props.player.abilities?.known ?? [])
function teacher(ability: LearnAbilityId): CharacterSnapshot | undefined {
    return props.characters.find(
        (actor) =>
            actor.id !== props.player.id &&
            actor.alive &&
            actor.faction === props.player.faction &&
            Math.hypot(
                actor.position.x - props.player.position.x,
                actor.position.y - props.player.position.y
            ) <= 64 &&
            teaches(actor, ability)
    )
}
function teaches(actor: CharacterSnapshot, ability: LearnAbilityId): boolean {
    if (ability === 'pray')
        return (
            actor.heroClass === 'cleric' ||
            actor.tags.includes('cleric') ||
            actor.tags.includes('shrine')
        )
    if (ability === 'shot') return actor.id === 'npc_veteran_1' || actor.tags.includes('veteran')
    return actor.tags.includes('scholar')
}
function learn(abilityId: LearnAbilityId): void {
    const target = teacher(abilityId)
    if (target) emit('command', { type: 'learn_ability', abilityId, targetId: target.id })
}
</script>
<template>
    <section class="ability-knowledge" aria-label="Умения персонажа">
        <h3>Умения</h3>
        <p>Shift+1–4 назначает умение или еду. T выбирает врага, Shift+T — союзника, F — себя.</p>
        <p>
            Молитва помогает выбранной цели. Без цели выбирает нуждающегося рядом; описание слота
            показывает результат и цену перед нажатием. Воскрешение длится 3 секунды и прерывается
            движением или уроном.
        </p>
        <ul>
            <li v-for="id in known" :key="id">
                <strong>{{ ABILITY_DEFINITIONS[id].name }}</strong> ·
                {{ ABILITY_DEFINITIONS[id].mana }} MP · {{ ABILITY_DEFINITIONS[id].energy }} EN ·
                {{ ABILITY_DEFINITIONS[id].cooldownMs / 1000 }} с
            </li>
        </ul>
        <div v-for="id in learnable.filter((ability) => !known.includes(ability))" :key="id">
            <button type="button" :disabled="!player.alive || !teacher(id)" @click="learn(id)">
                Изучить: {{ ABILITY_DEFINITIONS[id].name }}</button
            ><small
                >{{
                    id === 'pray'
                        ? 'Учитель: клирик'
                        : id === 'shot'
                          ? 'Учитель: ветеран'
                          : 'Учитель: учёный'
                }}
                · подойдите ближе</small
            >
        </div>
    </section>
</template>
<style scoped>
.ability-knowledge {
    border-bottom: 1px solid #8b8058;
    padding-bottom: 12px;
}
.ability-knowledge p,
small {
    font:
        14px/1.45 system-ui,
        sans-serif;
}
.ability-knowledge li {
    margin: 5px 0;
}
.ability-knowledge button {
    margin: 4px 8px 4px 0;
}
small {
    display: block;
}
</style>
