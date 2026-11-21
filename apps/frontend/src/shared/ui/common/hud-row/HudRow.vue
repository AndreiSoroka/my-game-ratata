<script setup lang="ts">
withDefaults(defineProps<{ align?: 'start' | 'center' }>(), { align: 'center' })
</script>

<template>
    <div class="hud-row" :class="{ 'hud-row--with-trailing': $slots.trailing }" :data-align="align">
        <div class="hud-row__leading"><slot name="leading" /></div>
        <div class="hud-row__content"><slot /></div>
        <div v-if="$slots.trailing" class="hud-row__trailing">
            <slot name="trailing" />
        </div>
    </div>
</template>

<style scoped>
.hud-row {
    --hud-row-leading-width: 26px;
    display: grid;
    grid-template-columns: var(--hud-row-leading-width) minmax(0, 1fr);
    align-items: center;
    column-gap: 7px;
    font-size: 12px;
}

.hud-row--with-trailing {
    grid-template-columns: var(--hud-row-leading-width) minmax(0, 1fr) max-content;
}

.hud-row[data-align='start'] {
    align-items: start;
}

.hud-row__leading,
.hud-row__trailing {
    display: flex;
    align-items: center;
}

.hud-row__leading {
    justify-content: flex-end;
}

.hud-row__content {
    min-width: 0;
}

@container (max-width: 180px) {
    .hud-row {
        --hud-row-leading-width: 16px;
        column-gap: 4px;
        font-size: 9px;
    }
}

@container (max-width: 110px) {
    .hud-row {
        --hud-row-leading-width: 10px;
        column-gap: 2px;
    }
}
</style>
