<script setup lang="ts">
import GameFrame from '../ui/primitives/GameFrame.vue'

defineProps<{ state: 'closed' | 'open' }>()
</script>

<template>
    <section
        class="chest-preview game-frame-host"
        :aria-label="state === 'open' ? 'Open chest' : 'Closed chest'"
    >
        <GameFrame variant="panel" />
        <span
            class="chest-preview__sprite"
            :class="{ 'chest-preview__sprite--open': state === 'open' }"
            aria-hidden="true"
        />
        <strong>{{ state === 'open' ? 'Открытый сундук' : 'Закрытый сундук' }}</strong>
    </section>
</template>

<style scoped>
.chest-preview {
    position: relative;
    display: grid;
    width: 200px;
    gap: 12px;
    padding: 24px;
    justify-items: center;
    color: var(--game-ui-text);
}
.chest-preview__sprite {
    width: 64px;
    height: 64px;
    image-rendering: pixelated;
    background: url('/game/map/assets/MysticWoods/objects/chest_01.png') 0 0 / 256px 64px;
}
.chest-preview__sprite--open {
    background-position: -192px 0;
}
</style>
