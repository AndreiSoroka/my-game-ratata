<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { ref } from 'vue'

import JoinGamePanel from '../ui/JoinGamePanel.vue'

const nickname = ref('Андрей Сорока')
const heroClass = ref<HeroClass>('vanguard')
</script>

<template>
    <JoinGamePanel
        v-model:nickname="nickname"
        v-model:hero-class="heroClass"
        :can-join="true"
        error-message=""
    />
</template>
