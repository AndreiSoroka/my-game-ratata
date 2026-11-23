<script setup lang="ts">
import { type CharacterSnapshot, MOVEMENT_RULES } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'

const props = defineProps<{ character: CharacterSnapshot }>()
const label = computed(() =>
    props.character.movement?.dashing
        ? tGame('game.world.dash')
        : {
              walking: tGame('game.world.walk'),
              sneaking: tGame('game.world.sneak'),
          }[props.character.movement?.mode ?? 'walking']
)
const cooldown = computed(() =>
    Math.ceil((props.character.movement?.dashCooldownMsLeft ?? 0) / 1000)
)
</script>
<template>
    <div class="movement-status" :aria-label="tGame('game.world.movementMode')">
        <span>{{ label }}</span>
        <span
            :class="{
                unavailable: cooldown > 0 || character.resourceChecks?.dash !== 'ready',
            }"
        >
            {{
                cooldown > 0
                    ? tGame('game.world.dashCooldown', { seconds: cooldown })
                    : tGame('game.world.dashCost', { energy: MOVEMENT_RULES.dashEnergy })
            }}
        </span>
        <small>{{ tGame('game.world.cSneakSpaceDashFor') }}</small>
    </div>
</template>
<style scoped>
.movement-status {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 5px 8px;
    color: #3b4136;
    font:
        11px/1.5 system-ui,
        sans-serif;
}
.movement-status small {
    width: 100%;
    color: #61674f;
    font-size: 10px;
}
.unavailable {
    color: #925c40;
}
@media (max-width: 740px) {
    .movement-status {
        font-size: 9px;
    }
    .movement-status small {
        display: none;
    }
}
</style>
