<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { GRID_SIZE, REGION_NAME } from '@my-game-ratata/contracts'

import HeroClassIcon from './HeroClassIcon.vue'

const nickname = defineModel<string>('nickname', { required: true })
const heroClass = defineModel<HeroClass>('heroClass', { required: true })
defineProps<{ canJoin: boolean; errorMessage: string }>()
defineEmits<{ join: [] }>()
const classes: { id: HeroClass; label: string; description: string }[] = [
    {
        id: 'vanguard',
        label: 'Авангард',
        description: 'Опыт передовой: стойкость и уверенный ближний бой.',
    },
    {
        id: 'ranger',
        label: 'Следопыт',
        description: 'Опыт странствий: подвижность и привычка держать дистанцию.',
    },
    {
        id: 'arcanist',
        label: 'Арканист',
        description: 'Опыт изучения чар: большой запас маны и тяга к тайнам.',
    },
    {
        id: 'cleric',
        label: 'Клирик',
        description: 'Опыт служения: чудеса и спасение павших союзников.',
    },
]
</script>

<template>
    <section class="join-screen" aria-labelledby="join-title">
        <div class="join-lore">
            <p class="join-lore__eyebrow">
                {{ REGION_NAME.toUpperCase() }} · {{ GRID_SIZE * GRID_SIZE }} ЛОКАЦИЙ
            </p>
            <h2>Новогород<br />и дальние земли</h2>
            <p class="join-lore__story">
                За стенами Новогорода сходятся торговые пути. В городе ждут ремесленники, учёные и
                попутчики. Чем дальше от ворот, тем опаснее становятся земли.
            </p>
            <p class="join-lore__invitation">
                Искра живёт в персонаже, пока с ним связан разум. Эхо следует привычкам и повторяет
                знакомые дела. Собирайте свои сценарии и договаривайтесь о помощи.
            </p>
        </div>
        <form class="join-panel" @submit.prevent="$emit('join')">
            <h1 id="join-title">Ratata</h1>
            <label for="nickname">Nickname</label>
            <div class="join-row">
                <input
                    id="nickname"
                    v-model="nickname"
                    autocomplete="nickname"
                    maxlength="24"
                    minlength="1"
                    required
                    type="text"
                />
                <button :disabled="!canJoin" type="submit">Enter</button>
            </div>
            <fieldset class="class-choices" aria-describedby="class-description class-hint">
                <legend>Прошлое героя</legend>
                <div class="class-grid">
                    <label v-for="option in classes" :key="option.id" class="class-card">
                        <input
                            :id="heroClass === option.id ? 'hero-class' : `hero-class-${option.id}`"
                            v-model="heroClass"
                            type="radio"
                            name="hero-class"
                            :value="option.id"
                        />
                        <span class="class-card__content">
                            <HeroClassIcon :hero-class="option.id" />
                            <span>{{ option.label }}</span>
                        </span>
                    </label>
                </div>
            </fieldset>
            <p id="class-description" class="class-description" aria-live="polite">
                {{ classes.find((option) => option.id === heroClass)?.description }}
            </p>
            <p id="class-hint" class="class-hint">
                Прошлое даёт первые преимущества. Любой герой может освоить меч, чудеса и магию
                через обучение и практику. Новая жизнь начинается без золота.
            </p>
            <p v-if="errorMessage" class="join-error">{{ errorMessage }}</p>
        </form>
    </section>
</template>

<style scoped>
.join-screen {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
    gap: clamp(32px, 8vw, 140px);
    padding: clamp(24px, 6vw, 96px);
    min-height: 100dvh;
    box-sizing: border-box;
    background:
        linear-gradient(90deg, #080e0dd9 0%, #080e0d55 55%, #080e0d99 100%),
        url('/game/assets/ash-border.png') center / cover;
}
.join-panel {
    width: 100%;
    box-sizing: border-box;
    background: #0f1614f2;
    border-color: #9f89635e;
    backdrop-filter: blur(8px);
}
.join-lore {
    justify-self: start;
    max-width: 620px;
    text-shadow: 0 2px 20px #000c;
}
.join-lore__eyebrow {
    margin: 0 0 24px;
    color: #d5ba7d;
    font:
        11px/1.6 system-ui,
        sans-serif;
    letter-spacing: 3px;
}
.join-lore h2 {
    margin: 0 0 24px;
    color: #fff1cf;
    font-size: clamp(36px, 4.5vw, 68px);
    font-weight: 600;
    line-height: 1.15;
}
.join-lore__story {
    max-width: 470px;
    color: #efe6d1;
    font:
        17px/1.7 system-ui,
        sans-serif;
}
.join-lore__invitation {
    max-width: 440px;
    margin-top: 20px;
    color: #b8c5b5;
    font:
        14px/1.7 system-ui,
        sans-serif;
}
@media (max-width: 820px) {
    .join-screen {
        grid-template-columns: minmax(0, 1fr);
        gap: 28px;
        padding: 32px 20px;
        background-position: 60% center;
    }
    .join-lore {
        max-width: 440px;
        justify-self: center;
        text-align: center;
    }
    .join-lore h2 {
        font-size: 36px;
        margin-bottom: 16px;
    }
    .join-lore__eyebrow {
        font-size: 9px;
        margin-bottom: 16px;
    }
    .join-lore__story {
        font-size: 14px;
    }
    .join-lore__invitation {
        display: none;
    }
    .join-panel {
        max-width: 440px;
        justify-self: center;
    }
}

.class-choices {
    min-width: 0;
    margin: 20px 0 0;
    padding: 0;
    border: 0;
}
.class-choices legend {
    margin-bottom: 10px;
    color: #e3cd9d;
}
.class-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}
.class-card {
    position: relative;
    cursor: pointer;
}
.class-card input {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
}
.class-card__content {
    display: flex;
    min-height: 86px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    padding: 8px 2px;
    box-sizing: border-box;
    border: 1px solid #647265;
    border-radius: 6px;
    background: #17211c;
    color: #bec9ba;
    font:
        12px/1.4 system-ui,
        sans-serif;
}
.class-card__content svg {
    width: 34px;
    height: 34px;
}
.class-card:hover .class-card__content {
    border-color: #b6a073;
}
.class-card input:checked + .class-card__content {
    border-color: #e2bd75;
    background: #2c3020;
    color: #ffe0a1;
    box-shadow: inset 0 0 0 1px #e2bd75;
}
.class-card input:focus-visible + .class-card__content {
    outline: 2px solid #f4e3b5;
    outline-offset: 3px;
}
@media (max-width: 820px) {
    .class-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
.class-description {
    margin: 10px 0;
    color: #e3cd9d;
    font:
        14px/1.5 system-ui,
        sans-serif;
}
.class-hint {
    margin: 18px 0 0;
    color: #9faa9c;
    font:
        12px/1.5 system-ui,
        sans-serif;
}
</style>
