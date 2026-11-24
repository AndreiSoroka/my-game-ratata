<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'

defineProps<{ accepted: boolean; name: string }>()
</script>
<template>
    <span
        class="exchange-consent"
        :class="{ 'exchange-consent--ready': accepted }"
        role="img"
        :aria-label="`${name}: ${accepted ? tGame('game.trade.confirmedLower') : tGame('game.trade.unconfirmedLower')}`"
        :title="
            accepted ? tGame('game.trade.termsConfirmed') : tGame('game.trade.termsUnconfirmed')
        "
    >
        <svg viewBox="0 0 48 32" aria-hidden="true" shape-rendering="crispEdges">
            <template v-if="accepted">
                <path
                    class="hand-outline"
                    d="M2 10h5V7h7V5h7v2h7V5h7v3h6v3h5v13h-7v3h-7v3h-5v-2h-5v2h-5v-3h-5v-3H7v-2H2z"
                />
                <path
                    class="hand-left"
                    d="M8 11h5V8h7v2h7l8 8v5h-3v3h-4v-3h-4v-3h-4v-3h-4l-3-3H8z"
                />
                <path class="hand-right" d="M40 12h-6V9h-7l-6 5v3h4l4-3 7 7h4z" />
                <path
                    class="hand-light"
                    d="M14 8h6v3h7v2h-8l-4 3-3-3H8v-2h6zM29 9h5v3h6v3h-7l-5-3h-3z"
                />
                <path
                    class="hand-fingers"
                    d="M15 18h4v3h4v3h4v3h-4v-3h-4v-3h-4zM12 21h3v3h4v3h-4v-3h-3zM28 18h3v3h3v3h-3v-3h-3z"
                />
                <path class="hand-cuff" d="M2 11h5v11H2zM41 12h5v11h-5z" />
                <path class="hand-cuff-light" d="M3 11h3v3H3zM42 12h3v3h-3z" />
            </template>
            <template v-else>
                <g>
                    <path
                        class="hand-outline"
                        d="M1 10h5V7h5V5h5v3h3v4h3v7h-4v7h-5v2H8v-4H4v-2H1z"
                    />
                    <path class="hand-left" d="M6 11h5V8h4v4h3v2h2v3h-5v7h-3v2H9v-5H6z" />
                    <path class="hand-light" d="M6 11h5V8h3v4h-3v5H8v-3H6z" />
                    <path class="hand-fingers" d="M12 17h2v7h-2zM8 18h2v5H8z" />
                    <path class="hand-cuff" d="M1 11h5v11H1z" />
                    <path class="hand-cuff-light" d="M2 11h3v3H2z" />
                </g>
                <g transform="translate(48 0) scale(-1 1)">
                    <path
                        class="hand-outline"
                        d="M1 10h5V7h5V5h5v3h3v4h3v7h-4v7h-5v2H8v-4H4v-2H1z"
                    />
                    <path class="hand-right" d="M6 11h5V8h4v4h3v2h2v3h-5v7h-3v2H9v-5H6z" />
                    <path class="hand-light" d="M6 11h5V8h3v4h-3v5H8v-3H6z" />
                    <path class="hand-fingers" d="M12 17h2v7h-2zM8 18h2v5H8z" />
                    <path class="hand-cuff" d="M1 11h5v11H1z" />
                    <path class="hand-cuff-light" d="M2 11h3v3H2z" />
                </g>
            </template>
        </svg>
    </span>
</template>
<style scoped>
.exchange-consent {
    display: inline-grid;
    flex: 0 0 42px;
    width: 42px;
    height: 32px;
    place-items: center;
    --hand-shadow: #17251c;
    --hand-main: #8c987d;
    --hand-other: #737f69;
    --hand-light: #aeb69a;
    --hand-cuff: #465644;
    --hand-cuff-light: #73846a;
}
svg {
    display: block;
    width: 42px;
    height: 30px;
    overflow: visible;
}
.hand-outline {
    fill: var(--hand-shadow);
}
.hand-left {
    fill: var(--hand-main);
}
.hand-right {
    fill: var(--hand-other);
}
.hand-light {
    fill: var(--hand-light);
}
.hand-fingers {
    fill: var(--hand-shadow);
}
.hand-cuff {
    fill: var(--hand-cuff);
}
.hand-cuff-light {
    fill: var(--hand-cuff-light);
}
.exchange-consent--ready {
    --hand-main: #c4bd79;
    --hand-other: #a8ae68;
    --hand-light: #eee0a0;
    --hand-cuff: #657847;
    --hand-cuff-light: #a6bc72;
}
</style>
