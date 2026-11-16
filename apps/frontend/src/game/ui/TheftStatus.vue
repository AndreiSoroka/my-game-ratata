<script setup lang="ts">
import { type CharacterTheftSnapshot, THEFT_RULES } from '@my-game-ratata/contracts'

defineProps<{ theft: CharacterTheftSnapshot | undefined }>()
</script>
<template>
    <div
        v-if="theft && (theft.cooldownMsLeft > 0 || theft.wantedMsLeft > 0 || theft.blacklisted)"
        class="theft-status"
        aria-label="Кража и розыск"
    >
        <span v-if="theft.cooldownMsLeft > 0"
            >Кража · {{ Math.ceil(theft.cooldownMsLeft / 1000) }} с</span
        >
        <strong v-if="theft.wantedMsLeft > 0"
            >Розыск · {{ Math.ceil(theft.wantedMsLeft / 1000) }} с</strong
        >
        <div v-if="theft.blacklisted" class="theft-blacklist" role="status">
            <strong>В чёрном списке Новогорода</strong>
            <span
                >Стража нападёт, торговцы откажут. Отпущение у клирика —
                {{ THEFT_RULES.absolutionGold }} золотых.</span
            >
        </div>
    </div>
</template>
<style scoped>
.theft-status {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    color: #66593c;
    font:
        11px/1.4 system-ui,
        sans-serif;
}
.theft-blacklist {
    display: grid;
    gap: 2px;
    flex-basis: 100%;
}
.theft-status strong {
    color: #9e3e2c;
}
@media (max-width: 740px) {
    .theft-status {
        font-size: 9px;
    }
}
</style>
