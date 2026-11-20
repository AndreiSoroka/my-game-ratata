<script setup lang="ts">
import { FantasyBorder } from '@/shared/ui/external/fantasy-ui-borders/border'

defineProps<{ compact?: boolean }>()
</script>

<template>
    <div class="character-hud-frame">
        <FantasyBorder
            class="character-hud-frame__border"
            border="border-017"
            :border-width="compact ? 8 : undefined"
            color="var(--character-hud-border, var(--ui-dark-panel-border))"
        >
            <slot />
        </FantasyBorder>
    </div>
</template>

<style scoped>
.character-hud-frame {
    --character-hud-fill: var(--character-hud-surface, var(--ui-dark-panel-surface));
    --character-hud-text: var(--ui-dark-panel-text);
    --character-hud-positive: var(--ui-dark-panel-positive);
    --character-hud-warning: var(--ui-dark-panel-warning);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    padding: 7px;
    background: linear-gradient(
        155deg,
        color-mix(in srgb, var(--character-hud-fill) 78%, #708067f2),
        var(--character-hud-fill) 58%,
        color-mix(in srgb, var(--character-hud-fill) 66%, #070f0bf2)
    );
    box-shadow:
        inset 0 1px #f2e3bf26,
        inset 0 -1px #070f0bbf;
    color: var(--character-hud-text);
}

.character-hud-frame__border {
    display: flex;
    flex: 1;
    flex-direction: column;
    container-type: inline-size;
    min-width: 0;
    min-height: 0;
}
</style>
