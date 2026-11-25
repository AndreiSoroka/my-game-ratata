<script setup lang="ts">
import { type HeroClass } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { UiFrame } from '@/shared/ui/common'

import { describeConstellationUnlock } from '../model/constellationDebugUnlock'
import { constellationRequirementProgress } from '../model/constellationRequirementProgress'

const props = defineProps<{
    nodeId: string
    activeIds?: ReadonlySet<string>
    heroClass?: HeroClass
}>()
const details = computed(() => describeConstellationUnlock(props.nodeId, props.heroClass))
const requirements = computed(() =>
    constellationRequirementProgress(props.nodeId, props.activeIds, props.heroClass)
)
const levelSatisfied = computed(() => requirements.value?.every((entry) => entry.satisfied))
</script>
<template>
    <div class="debug-unlock-wrap">
        <section
            class="debug-minimum game-frame-host"
            data-testid="debug-star-minimum"
            aria-label="Требования к уровню"
        >
            <UiFrame variant="inset" />
            <template v-if="requirements">
                <ul class="level-requirements">
                    <li
                        v-for="requirement in requirements"
                        :key="requirement.id"
                        data-testid="debug-star-level-requirement"
                        :data-mastery="requirement.id"
                        :data-required="requirement.required"
                        :data-current="requirement.current"
                        :data-required-path="requirement.id"
                        :data-level-satisfied="requirement.satisfied"
                    >
                        {{ requirement.name }}: требуется
                        <strong>{{ requirement.required }}</strong> · сейчас
                        <strong>{{ requirement.current }}</strong>
                    </li>
                </ul>
                <p
                    class="level-status"
                    :class="{ 'level-insufficient': !levelSatisfied }"
                    data-testid="debug-star-level-status"
                    role="status"
                >
                    {{
                        levelSatisfied
                            ? 'Требование к уровню выполнено.'
                            : 'Недостаточно уровня: звезда пока не может открыться.'
                    }}
                </p>
            </template>
            <p v-else>Требования к звезде неизвестны.</p>
        </section>
        <details
            class="debug-unlock game-frame-host"
            data-testid="debug-unlock-conditions"
            aria-label="Условия открытия"
        >
            <summary><UiFrame variant="panel" />Условия открытия</summary>
            <ul v-if="details.conditions.length">
                <li v-for="condition in details.conditions" :key="condition">{{ condition }}</li>
            </ul>
            <p v-else>Особых условий нет.</p>
            <section
                v-if="details.chanceBoosts.length"
                data-testid="debug-chance-actions"
                aria-label="Повышают шанс открытия"
            >
                <h3>Повышают шанс открытия</h3>
                <ul>
                    <li v-for="hint in details.chanceBoosts" :key="hint">{{ hint }}</li>
                </ul>
            </section>
        </details>
    </div>
</template>
<style scoped>
.debug-unlock {
    padding: 16px;
    border: 1px solid transparent;
    border-top: 0;
    font-size: 12px;
    line-height: 1.55;
}
summary,
h3,
p,
ul {
    margin: 0;
}
h2,
h3 {
    color: #d4e3df;
    font-size: 13px;
}
ul {
    display: grid;
    gap: 4px;
    padding-left: 18px;
}
summary + ul,
h3 + ul,
summary + p {
    margin-top: 8px;
}
section > section {
    margin-top: 16px;
}
.debug-minimum {
    padding: 10px 14px;
    border: 1px solid transparent;
    border-top: 0;
    color: #e8d6aa;
    font-size: 12px;
}
.level-requirements {
    padding: 0;
    list-style: none;
}
.level-status {
    margin-top: 5px;
    color: #b7cbd3;
}
.level-insufficient {
    color: #f4c6a1;
}
summary {
    cursor: pointer;
}
summary:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: 3px;
}
</style>
