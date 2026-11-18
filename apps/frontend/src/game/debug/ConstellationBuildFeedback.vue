<script setup lang="ts">
import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import GameButton from '../ui/primitives/GameButton.vue'
import GameFrame from '../ui/primitives/GameFrame.vue'
import type { BuildCascade, BuildFeedback, BuildNoticePause } from './useConstellationBuild'

const props = defineProps<{
    feedback?: BuildFeedback
    cascade?: BuildCascade
    nodes: ConstellationNodeSnapshot[]
}>()
const emit = defineEmits<{
    inspect: [id: string]
    pause: [reason: BuildNoticePause]
    resume: [reason: BuildNoticePause]
}>()
const notice = ref<HTMLElement>()
const cascadeNames = computed(() =>
    props.cascade?.ids
        .slice(0, 3)
        .map((id) => props.nodes.find((node) => node.id === id)?.name ?? id)
        .join(', ')
)
function focusOut(event: FocusEvent): void {
    if (!(event.relatedTarget instanceof Node) || !notice.value?.contains(event.relatedTarget))
        emit('resume', 'focus')
}
watch(
    () => props.feedback?.id ?? props.cascade?.id,
    async () => {
        await nextTick()
        if (notice.value?.matches(':hover')) emit('pause', 'pointer')
        if (document.activeElement && notice.value?.contains(document.activeElement))
            emit('pause', 'focus')
    }
)
</script>
<template>
    <section
        v-if="feedback || cascade"
        ref="notice"
        class="build-feedback game-frame-host"
        :class="{ 'build-feedback--info': !feedback }"
        aria-live="polite"
        aria-atomic="true"
        data-testid="debug-build-feedback"
        @pointerenter="emit('pause', 'pointer')"
        @pointerleave="emit('resume', 'pointer')"
        @focusin="emit('pause', 'focus')"
        @focusout="focusOut"
    >
        <GameFrame variant="panel" />
        <div
            v-if="feedback"
            :key="feedback.id"
            class="build-blocked"
            role="status"
            data-testid="debug-build-blocked"
        >
            <p>{{ feedback.text }}</p>
            <GameButton
                size="compact"
                v-for="id in feedback.missingParents"
                :key="id"
                :data-find-parent="id"
                @click="emit('inspect', id)"
            >
                Показать «{{ nodes.find((node) => node.id === id)?.name ?? id }}»
            </GameButton>
        </div>
        <div v-else-if="cascade" :key="cascade.id" role="status" data-testid="debug-build-cascade">
            <strong>Отключено звёзд: {{ cascade.ids.length }}</strong>
            <p>
                {{ cascadeNames
                }}<template v-if="cascade.ids.length > 3">
                    и ещё {{ cascade.ids.length - 3 }}</template
                >.
            </p>
        </div>
    </section>
</template>
<style scoped>
.build-feedback {
    position: fixed;
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
    z-index: 30;
    box-sizing: border-box;
    width: min(360px, calc(100vw - 32px));
    padding: 12px 16px;
    border: 1px solid transparent;
    color: #f4dfae;
    font-size: 12px;
    line-height: 1.5;
}
.build-feedback--info {
    pointer-events: none;
}
p {
    margin: 0;
}
strong + p {
    margin-top: 4px;
}
.build-blocked {
    display: grid;
    gap: 8px;
}
button {
    min-height: 44px;
    border: 1px solid transparent;
    padding: 8px 10px;
    text-align: left;
    cursor: pointer;
}
</style>
