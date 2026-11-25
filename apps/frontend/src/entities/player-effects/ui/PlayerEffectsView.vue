<script setup lang="ts">
import { computed, useId } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { HudFrame, HudRow } from '@/shared/ui/common'

import { createPlayerEffectsDisclosure } from '../model/playerEffectsSelection'
import { presentPlayerEffects } from './playerEffectPresentation'
import type { PlayerEffectsData } from './playerEffectsViewProps'

const props = defineProps<PlayerEffectsData>()
defineSlots<{ identity?(props: { class: string }): unknown }>()
const listId = useId()

const activeEffects = computed(() => presentPlayerEffects(props.effects))
const hasActiveEffects = computed(() => activeEffects.value.length > 0)
const { expanded, toggle } = createPlayerEffectsDisclosure(() => hasActiveEffects.value)
</script>

<template>
    <component
        :is="compact ? 'section' : HudFrame"
        class="player-effects"
        :class="{ 'player-effects--compact': compact }"
        role="region"
        :aria-label="tGame('game.world.playerEffects')"
    >
        <div class="player-effects__layout">
            <h2 v-if="!compact" class="player-effects__title">
                {{ tGame('game.world.playerStatus') }}
            </h2>
            <div class="player-effects__summary">
                <slot name="identity" class="player-effects__identity" />
                <button
                    v-if="compact && hasActiveEffects"
                    class="player-effects__toggle"
                    type="button"
                    :aria-label="tGame('game.world.activeEffects')"
                    :aria-description="
                        tGame('game.world.effectCount', { count: activeEffects.length })
                    "
                    :aria-controls="listId"
                    :aria-expanded="expanded"
                    @click="toggle"
                >
                    <span class="player-effects__preview" aria-hidden="true">
                        <span
                            v-for="effect in activeEffects"
                            :key="effect.kind"
                            class="player-effects__preview-chip"
                            :data-effect-preview="effect.kind"
                            :data-tone="effect.tone"
                            :title="effect.text"
                        >
                            <svg
                                class="player-effects__icon"
                                viewBox="0 0 12 12"
                                shape-rendering="crispEdges"
                                focusable="false"
                            >
                                <path :d="effect.path" fill="currentColor" fill-rule="evenodd" />
                            </svg>
                            {{ effect.timer }}
                        </span>
                    </span>
                    <span class="player-effects__count" aria-hidden="true">{{
                        activeEffects.length
                    }}</span>
                </button>
                <p v-else-if="compact" class="player-effects__empty">
                    {{ tGame('game.world.allClear') }}
                </p>
            </div>
            <ul
                v-if="hasActiveEffects"
                v-show="!compact || expanded"
                :id="compact ? listId : undefined"
                class="player-effects__list"
                role="list"
            >
                <li
                    v-for="effect in activeEffects"
                    :key="effect.kind"
                    :data-player-effect="effect.kind"
                >
                    <HudRow align="start">
                        <template #leading>
                            <svg
                                class="player-effects__icon"
                                viewBox="0 0 12 12"
                                shape-rendering="crispEdges"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <path :d="effect.path" fill="currentColor" fill-rule="evenodd" />
                            </svg>
                        </template>
                        <span class="player-effects__label" :data-tone="effect.tone">
                            {{ effect.text }}
                        </span>
                    </HudRow>
                </li>
            </ul>
            <p v-else-if="!compact" class="player-effects__empty">
                {{ tGame('game.world.allClear') }}
            </p>
        </div>
    </component>
</template>

<style scoped src="./playerEffectsView.css"></style>
