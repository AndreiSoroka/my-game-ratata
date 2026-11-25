<script setup lang="ts">
import './gameNotice.css'

import { UiFrame } from '@/shared/ui/common'
defineProps<{ text: string }>()
</script>

<template>
    <p class="game-notice game-frame-host" role="status" aria-live="polite">
        <UiFrame variant="panel" />{{ text }}
    </p>
</template>
