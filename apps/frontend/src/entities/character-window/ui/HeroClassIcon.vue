<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'

defineProps<{ heroClass: HeroClass }>()
</script>

<template>
    <svg
        class="hero-class-icon"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        focusable="false"
    >
        <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <template v-if="heroClass === 'vanguard'">
                <path d="M24 5 39 11v12c0 9-7 15-15 20C16 38 9 32 9 23V11L24 5Z" />
                <path d="M24 13v21M17 21h14" />
            </template>
            <template v-else-if="heroClass === 'ranger'">
                <path d="M14 6c22 9 22 27 0 36L26 24 14 6Z" />
                <path d="M7 24h34m-7-6 7 6-7 6" />
            </template>
            <template v-else-if="heroClass === 'arcanist'">
                <path d="m24 4 5 14 14 6-14 5-5 15-5-15-14-5 14-6 5-14Z" />
                <path d="m38 5 1 4 4 1-4 2-1 4-2-4-4-2 4-1 2-4Z" />
            </template>
            <template v-else>
                <path d="M19 7h10v11h11v10H29v13H19V28H8V18h11V7Z" />
                <path d="M24 14v20M14 23h20" />
            </template>
        </g>
    </svg>
</template>

<style scoped>
.hero-class-icon {
    width: var(--hero-class-icon-size, 48px);
    height: var(--hero-class-icon-size, 48px);
}
</style>
