<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { GRID_SIZE, REGION_NAME } from '@my-game-ratata/contracts'

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
            <label for="hero-class" class="class-label">Прошлое героя</label>
            <select id="hero-class" v-model="heroClass" class="class-select">
                <option v-for="option in classes" :key="option.id" :value="option.id">
                    {{ option.label }}
                </option>
            </select>
            <p class="class-description">
                {{ classes.find((option) => option.id === heroClass)?.description }}
            </p>
            <p class="class-hint">
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

.class-label {
    display: block;
    margin-top: 20px;
}
.class-select {
    width: 100%;
    color: #f0e4bf;
    background: #1b231d;
    border: 1px solid #938462;
    border-radius: 4px;
    padding: 10px;
    font: inherit;
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
