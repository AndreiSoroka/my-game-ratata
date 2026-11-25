<script setup lang="ts">
import { ref } from 'vue'

import { GameplayScreen } from '@/pages/gameplay'
import { JoinGameScreen, useStartGameReadiness } from '@/pages/start-game'

const started = ref(false)
const { status: readiness, canEnter } = useStartGameReadiness(() => !started.value)
</script>

<template>
    <GameplayScreen v-model:started="started" :can-enter-world="canEnter">
        <template #start="start">
            <JoinGameScreen
                :nickname="start.nickname"
                :hero-class="start.heroClass"
                :joining="start.joining"
                :readiness="readiness"
                :error-message="start.errorMessage"
                @update:nickname="start.setNickname"
                @update:hero-class="start.setHeroClass"
                @join="start.join"
                @nickname-edited="start.editNickname"
                @regenerate-name="start.regenerateName"
            />
        </template>
    </GameplayScreen>
</template>
