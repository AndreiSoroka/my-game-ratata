<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import {
    GRID_SIZE,
    HERO_BACKGROUND_DEFINITIONS,
    heroClasses,
    REGION_NAME,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { UiButton, UiInput } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { darkPanelThemeStyle, provideDarkPanelTheme } from '@/shared/ui/theme'

import HeroBackgroundSummary from './HeroBackgroundSummary.vue'
import HeroClassIcon from './HeroClassIcon.vue'
import { heroClassTheme } from './heroClassThemes'
import GameFrame from './primitives/GameFrame.vue'
import GameInput from './primitives/GameInput.vue'
import RefreshIcon from './RefreshIcon.vue'

const nickname = defineModel<string>('nickname', { required: true })
const heroClass = defineModel<HeroClass>('heroClass', { required: true })
const frameWidth = 16
const theme = computed(() => heroClassTheme(heroClass.value, 'form'))
provideDarkPanelTheme(theme)
defineProps<{ canJoin: boolean; errorMessage: string }>()
defineEmits<{ join: []; 'nickname-edited': []; 'regenerate-name': [] }>()
const classes = heroClasses.map((id) => ({
    id,
    label: HERO_BACKGROUND_DEFINITIONS[id].name,
    description: HERO_BACKGROUND_DEFINITIONS[id].description,
    theme: heroClassTheme(id, 'form'),
}))
function selectNickname({ currentTarget }: MouseEvent): void {
    if (currentTarget instanceof HTMLInputElement) currentTarget.select()
}
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
        <form
            class="join-panel game-frame-host"
            :style="darkPanelThemeStyle(theme)"
            autocomplete="off"
            @submit.prevent="$emit('join')"
        >
            <GameFrame variant="window" :border-width="frameWidth" />
            <h1 id="join-title">Ratata</h1>
            <label for="nickname">Имя героя</label>
            <div class="join-row">
                <UiInput
                    id="nickname"
                    v-model="nickname"
                    :border-width="frameWidth"
                    autocomplete="off"
                    maxlength="24"
                    minlength="1"
                    required
                    @click="selectNickname"
                    @input="$emit('nickname-edited')"
                />
                <UiButton
                    appearance="panel"
                    panel="panel-001"
                    class="join-regenerate"
                    aria-label="Сгенерировать другое имя"
                    title="Сгенерировать другое имя"
                    @click="$emit('regenerate-name')"
                >
                    <RefreshIcon />
                </UiButton>
                <UiButton
                    variant="primary"
                    class="join-submit"
                    :disabled="!canJoin || nickname.trim().length === 0"
                    type="submit"
                >
                    Войти
                </UiButton>
            </div>
            <fieldset class="class-choices" aria-describedby="class-description class-hint">
                <legend>Прошлое героя</legend>
                <div class="class-grid">
                    <label v-for="option in classes" :key="option.id" class="class-card">
                        <GameInput
                            :id="heroClass === option.id ? 'hero-class' : `hero-class-${option.id}`"
                            v-model="heroClass"
                            type="radio"
                            name="hero-class"
                            :value="option.id"
                        />
                        <span
                            class="class-card__content"
                            :class="{ 'class-card__content--selected': heroClass === option.id }"
                            :style="darkPanelThemeStyle(option.theme)"
                        >
                            <FantasyBorder
                                as="span"
                                class="class-card__frame"
                                :border="option.theme?.border"
                                :border-width="frameWidth"
                                color="var(--ui-themed-panel-accent)"
                                aria-hidden="true"
                            />
                            <HeroClassIcon :hero-class="option.id" />
                            <span>{{ option.label }}</span>
                        </span>
                    </label>
                </div>
            </fieldset>
            <p id="class-description" class="class-description" aria-live="polite">
                {{ classes.find((option) => option.id === heroClass)?.description }}
            </p>
            <HeroBackgroundSummary
                :hero-class="heroClass"
                :show-title="false"
                :border-width="frameWidth"
            />
            <p id="class-hint" class="class-hint">
                Прошлое даёт первые преимущества. Любой герой может освоить меч, чудеса и магию
                через обучение и практику. Новая жизнь начинается без золота.
            </p>
            <p v-if="errorMessage" class="join-error" role="alert">{{ errorMessage }}</p>
        </form>
    </section>
</template>

<style scoped src="./joinGamePanel.css" />
