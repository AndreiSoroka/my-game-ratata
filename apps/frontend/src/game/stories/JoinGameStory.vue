<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { ref } from 'vue'

import JoinGamePanel from '../ui/JoinGamePanel.vue'

const props = defineProps<{ initialHeroClass: HeroClass }>()
const nickname = ref('Андрей Сорока')
const heroClass = ref(props.initialHeroClass)
</script>

<template>
    <JoinGamePanel
        v-model:nickname="nickname"
        v-model:hero-class="heroClass"
        :can-join="true"
        error-message=""
    />
</template>
