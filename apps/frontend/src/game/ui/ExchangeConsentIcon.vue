<script setup lang="ts">
defineProps<{ accepted: boolean; name: string }>()
</script>
<template>
    <span
        class="exchange-consent"
        :class="{ 'exchange-consent--ready': accepted }"
        role="img"
        :aria-label="`${name}: ${accepted ? 'подтверждено' : 'не подтверждено'}`"
        :title="accepted ? 'Условия подтверждены' : 'Условия ещё не подтверждены'"
    >
        <svg viewBox="-4 0 56 32" aria-hidden="true">
            <g :transform="accepted ? 'translate(3 0)' : 'translate(-4 0)'">
                <path d="M2 11h7l5-4 5 1 5 5-3 3-4-3-3 2 8 7-3 3-6-3-5-5H2z" />
                <path class="exchange-consent__cuff" d="M1 10h6v15H1z" />
            </g>
            <g
                :transform="
                    accepted ? 'translate(45 0) scale(-1 1)' : 'translate(52 0) scale(-1 1)'
                "
            >
                <path d="M2 11h7l5-4 5 1 5 5-3 3-4-3-3 2 8 7-3 3-6-3-5-5H2z" />
                <path class="exchange-consent__cuff" d="M1 10h6v15H1z" />
            </g>
        </svg>
    </span>
</template>
<style scoped>
.exchange-consent {
    display: inline-grid;
    width: 42px;
    height: 32px;
    place-items: center;
    color: #8d9b88;
}
svg {
    width: 42px;
    height: 30px;
    overflow: visible;
}
path {
    fill: #4c5a4b;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
}
.exchange-consent__cuff {
    fill: #22362c;
}
.exchange-consent--ready {
    color: #c3d78b;
}
.exchange-consent--ready path {
    fill: #6e8754;
}
.exchange-consent--ready .exchange-consent__cuff {
    fill: #344d32;
}
</style>
