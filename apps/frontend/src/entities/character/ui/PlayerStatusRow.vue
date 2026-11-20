<script setup lang="ts">
withDefaults(defineProps<{ align?: 'start' | 'center' }>(), { align: 'center' })
</script>

<template>
    <div
        class="player-status-row"
        :class="{ 'player-status-row--with-trailing': $slots.trailing }"
        :data-align="align"
    >
        <div class="player-status-row__leading"><slot name="leading" /></div>
        <div class="player-status-row__content"><slot /></div>
        <div v-if="$slots.trailing" class="player-status-row__trailing">
            <slot name="trailing" />
        </div>
    </div>
</template>

<style scoped>
.player-status-row {
    --player-status-row-leading-width: 26px;
    display: grid;
    grid-template-columns: var(--player-status-row-leading-width) minmax(0, 1fr);
    align-items: center;
    column-gap: 7px;
    font-size: 12px;
}

.player-status-row--with-trailing {
    grid-template-columns: var(--player-status-row-leading-width) minmax(0, 1fr) max-content;
}

.player-status-row[data-align='start'] {
    align-items: start;
}

.player-status-row__leading,
.player-status-row__trailing {
    display: flex;
    align-items: center;
}

.player-status-row__leading {
    justify-content: flex-end;
}

.player-status-row__content {
    min-width: 0;
}

@container (max-width: 180px) {
    .player-status-row {
        --player-status-row-leading-width: 16px;
        column-gap: 4px;
        font-size: 9px;
    }
}

@container (max-width: 110px) {
    .player-status-row {
        --player-status-row-leading-width: 10px;
        column-gap: 2px;
    }
}
</style>
