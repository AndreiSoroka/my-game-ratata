<script setup lang="ts">
import { type GameLocale, type HeroClass, heroClasses } from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue'

import { ChatComposerFrame } from '@/entities/chats'
import { RegionLore } from '@/entities/region-lore'
import {
    backgroundDescription,
    backgroundName,
    gameLocale,
    gameLocaleNames,
    gameLocales,
    setGameLocale,
    tGame,
} from '@/shared/lib/i18n'
import { UiButton, UiInput } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { darkPanelThemeStyle, provideDarkPanelTheme } from '@/shared/ui/theme'

import HeroBackgroundSummary from './HeroBackgroundSummary.vue'
import HeroClassIcon from './HeroClassIcon.vue'
import { heroClassTheme } from './heroClassThemes'
import JoinAssetCredits from './JoinAssetCredits.vue'
import GameFrame from './primitives/GameFrame.vue'
import GameInput from './primitives/GameInput.vue'
import GameSelect from './primitives/GameSelect.vue'
import RefreshIcon from './RefreshIcon.vue'

const nickname = defineModel<string>('nickname', { required: true })
const heroClass = defineModel<HeroClass>('heroClass', { required: true })
const frameWidth = 16
const transitionDuration = 260
const form = useTemplateRef<HTMLFormElement>('form')
const theme = computed(() => heroClassTheme(heroClass.value, 'form'))
provideDarkPanelTheme(() => {
    const currentTheme = theme.value
    return (
        currentTheme && {
            ...currentTheme,
            surface: 'var(--join-panel-surface)',
            accent: 'var(--join-panel-accent)',
        }
    )
})
defineProps<{ canJoin: boolean; errorMessage: string }>()
defineEmits<{ join: []; 'nickname-edited': []; 'regenerate-name': [] }>()
const selectedLocale = computed<GameLocale>({ get: () => gameLocale.value, set: setGameLocale })
const classes = heroClasses.map((id) => ({
    id,
    theme: heroClassTheme(id, 'form'),
}))
function selectNickname({ currentTarget }: MouseEvent): void {
    if (currentTarget instanceof HTMLInputElement) currentTarget.select()
}

let heightAnimation: Animation | undefined
watch(heroClass, async (_, __, invalidate) => {
    const panel = form.value
    if (!panel?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        heightAnimation?.cancel()
        return
    }
    const from = panel.getBoundingClientRect().height
    let stale = false
    invalidate(() => {
        stale = true
    })
    await nextTick()
    if (stale) return

    heightAnimation?.cancel()
    const to = panel.getBoundingClientRect().height
    if (Math.abs(from - to) < 1) return
    heightAnimation = panel.animate(
        [from, to].map((height) => ({ height: `${height}px`, overflow: 'clip' })),
        { duration: transitionDuration, easing: 'ease-out' }
    )
})
onBeforeUnmount(() => heightAnimation?.cancel())
</script>

<template>
    <section class="join-screen" aria-labelledby="join-title">
        <div class="join-screen__lore">
            <RegionLore />
            <slot name="settings" />
        </div>
        <form
            ref="form"
            class="join-panel game-frame-host"
            :style="{
                '--join-panel-surface': theme?.surface,
                '--join-panel-accent': theme?.accent,
                '--join-panel-duration': `${transitionDuration}ms`,
                '--fantasy-border-min-slice': frameWidth,
            }"
            autocomplete="off"
            @submit.prevent="$emit('join')"
        >
            <GameFrame variant="window" :border-width="frameWidth" />
            <div class="join-heading">
                <h1 id="join-title">Ratata</h1>
                <GameSelect v-model="selectedLocale" :aria-label="tGame('game.menu.language')">
                    <option
                        v-for="locale in gameLocales"
                        :key="locale"
                        :lang="locale"
                        :value="locale"
                    >
                        {{ gameLocaleNames[locale] }}
                    </option>
                </GameSelect>
            </div>
            <label for="nickname">{{ tGame('game.join.heroName') }}</label>
            <div class="join-row">
                <ChatComposerFrame :border-width="frameWidth">
                    <UiInput
                        id="nickname"
                        v-model="nickname"
                        :focus-ring="false"
                        :framed="false"
                        autocomplete="off"
                        maxlength="24"
                        minlength="1"
                        required
                        @click="selectNickname"
                        @input="$emit('nickname-edited')"
                    />
                </ChatComposerFrame>
                <UiButton
                    appearance="panel"
                    panel="panel-001"
                    class="join-regenerate"
                    :aria-label="tGame('game.join.regenerateName')"
                    :title="tGame('game.join.regenerateName')"
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
                    {{ tGame('game.join.enter') }}
                </UiButton>
            </div>
            <slot name="readiness" />
            <fieldset class="class-choices" aria-describedby="class-description class-hint">
                <legend>{{ tGame('game.join.background') }}</legend>
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
                            :class="{
                                'class-card__content--selected': heroClass === option.id,
                                'class-card__content--stone': option.id === 'vanguard',
                            }"
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
                            <span>{{ backgroundName(option.id) }}</span>
                        </span>
                    </label>
                </div>
            </fieldset>
            <p id="class-description" class="class-description" aria-live="polite">
                {{ backgroundDescription(heroClass) }}
            </p>
            <HeroBackgroundSummary
                :hero-class="heroClass"
                :show-title="false"
                :border-width="frameWidth"
            />
            <p id="class-hint" class="class-hint">
                {{ tGame('game.join.backgroundHint') }}
            </p>
            <p v-if="errorMessage" class="join-error" role="alert">{{ errorMessage }}</p>
        </form>
        <JoinAssetCredits class="join-screen__credits" />
    </section>
</template>

<style scoped src="./joinGamePanel.css" />
