<script setup lang="ts">
import { FantasyPanel } from '@/shared/ui/external/fantasy-ui-borders/panel'
</script>

<template>
    <FantasyPanel
        class="character-hud-frame"
        panel="panel-028"
        color="var(--character-hud-border, var(--ui-dark-panel-border))"
    >
        <slot />
    </FantasyPanel>
</template>

<style scoped>
.character-hud-frame {
    --character-hud-text: var(--ui-dark-panel-text);
    --character-hud-positive: var(--ui-dark-panel-positive);
    --character-hud-warning: var(--ui-dark-panel-warning);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    container-type: inline-size;
    min-width: 0;
    min-height: 0;
    outline: 2px solid var(--ui-dark-panel-outline);
    background: var(--character-hud-surface, var(--ui-dark-panel-surface)) border-box;
    color: var(--character-hud-text);
}
</style>
