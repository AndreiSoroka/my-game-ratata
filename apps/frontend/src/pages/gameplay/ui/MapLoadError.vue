<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'
import { UiButton, UiFrame } from '@/shared/ui/common'

import type { GraphicsRecoveryState } from '../../../game/runtime/runtimeGraphicsRecovery'

defineProps<{ message: string; status: string; graphics?: GraphicsRecoveryState | undefined }>()
const emit = defineEmits<{ retry: []; retryGraphics: [] }>()
</script>
<template>
    <div
        v-if="graphics"
        class="game-error game-frame-host graphics-recovery"
        :role="graphics === 'recovering' ? 'status' : 'alert'"
    >
        <UiFrame variant="panel" />
        <strong>{{ tGame('game.canvas.graphicsLost') }}</strong>
        <span>
            {{
                tGame(
                    graphics === 'recovering'
                        ? 'game.canvas.graphicsRecovering'
                        : 'game.canvas.graphicsRecoveryFailed'
                )
            }}
        </span>
        <UiButton v-if="graphics === 'failed'" size="small" @click="emit('retryGraphics')">
            {{ tGame('game.canvas.retryGraphics') }}
        </UiButton>
    </div>
    <p v-else-if="message" class="game-error game-frame-host" role="alert">
        <UiFrame variant="panel" />
        {{ status === 'Map loading failed' ? tGame('game.world.mapLoadFailed') : message }}
        <UiButton size="small" v-if="status === 'Map loading failed'" @click="emit('retry')">
            {{ tGame('game.world.retryMapLoading') }}
        </UiButton>
    </p>
</template>
<style scoped>
.game-error {
    z-index: 150;
    top: 50%;
    right: auto;
    bottom: auto;
    left: 50%;
    display: grid;
    gap: 12px;
    width: min(420px, calc(100vw - 28px));
    margin: 0;
    overflow-wrap: anywhere;
    transform: translate(-50%, -50%);
}

.graphics-recovery {
    color: var(--game-ui-text);
}
</style>
