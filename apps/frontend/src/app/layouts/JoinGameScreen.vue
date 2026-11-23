<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'

import JoinGamePanel from '@/game/ui/JoinGamePanel.vue'
import {
    StartGameReadiness,
    StartGameSettings,
    type StartGameStatus,
    useWorldAdministration,
} from '@/pages/start-game'

const nickname = defineModel<string>('nickname', { required: true })
const heroClass = defineModel<HeroClass>('heroClass', { required: true })
const props = defineProps<{ joining: boolean; readiness: StartGameStatus; errorMessage: string }>()
const emit = defineEmits<{ join: []; 'nickname-edited': []; 'regenerate-name': [] }>()
const { access, busy, error, mode, open, enterCode, openPanel, saveMode } = useWorldAdministration(
    () => props.readiness !== 'connection_error'
)
</script>

<template>
    <JoinGamePanel
        v-model:nickname="nickname"
        v-model:hero-class="heroClass"
        :can-join="readiness === 'ready' && !joining"
        :error-message="errorMessage"
        @join="emit('join')"
        @nickname-edited="emit('nickname-edited')"
        @regenerate-name="emit('regenerate-name')"
    >
        <template #settings>
            <StartGameSettings
                :access="access"
                :busy="busy"
                :error="error"
                :mode="mode"
                :open="open"
                @close="open = false"
                @code="enterCode"
                @open="openPanel"
                @save="saveMode"
            />
        </template>
        <template #readiness><StartGameReadiness :status="readiness" /></template>
    </JoinGamePanel>
</template>
