<script setup lang="ts">
import { FantasyPanel } from '@/shared/ui/external/fantasy-ui-borders/panel'
import { lightUiColors } from '@/shared/ui/theme'
</script>

<template>
    <FantasyPanel
        class="character-hud-frame"
        panel="panel-028"
        :color="lightUiColors.panel.parchment"
    >
        <slot />
    </FantasyPanel>
</template>

<style scoped>
.character-hud-frame {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    container-type: inline-size;
    min-width: 0;
    min-height: 0;
    outline: 2px solid var(--ui-light-border-wood);
    background:
        linear-gradient(var(--ui-light-panel-parchment), var(--ui-light-panel-parchment))
            padding-box,
        linear-gradient(var(--ui-light-border-wood), var(--ui-light-border-wood)) border-box;
}
</style>
