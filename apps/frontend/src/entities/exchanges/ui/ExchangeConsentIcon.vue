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
            <path
                class="hand-outline"
                d="M2 8H3V6H4V5H5V3H6V2H7V1H8V0H10V1H11V2H12V3H14V4H15V6H19V7H21V6H22V5H23V4H32V5H33V6H34V5H33V3H34V2H37V1H38V0H40V1H41V3H42V4H43V5H44V7H45V8H46V15H45V16H44V17H43V18H40V17H38V19H37V20H36V21H37V23H36V24H34V26H33V27H30V28H29V29H28V30H26V29H25V31H24V32H21V31H20V29H19V30H17V29H16V27H14V26H13V24H11V23H10V20H11V19H9V18H4V17H3V15H2Z"
            />
            <g class="hand-base">
                <!-- Cuffs -->
                <path d="M3 8H4V6H5V5H6V3H8V1H10V2H11V3H12V4H14V7H12V9H11V11H9V13H8V17H4V15H3Z" />
                <path
                    d="M34 3H37V2H38V1H40V3H41V4H42V5H43V8H45V15H43V17H40V13H39V11H37V9H36V7H35V5H34Z"
                />
                <!-- Palms and interlocking fingers -->
                <path
                    d="M9 13H11V11H13V10H12V9H14V7H19V9H17V13H18V15H23V14H24V13H27V15H30V16H31V17H33V19H35V21H36V23H33V22H32V21H30V22H31V23H32V24H33V26H30V25H27V26H29V28H28V29H26V27H25V26H24V25H23V23H21V22H19V20H16V19H15V18H12V19H11V18H9Z"
                />
                <path
                    d="M19 9H21V7H23V5H32V7H34V9H36V11H37V13H38V17H37V19H35V17H33V15H30V13H27V11H23V12H22V14H19Z"
                />
                <path d="M11 20H14V23H11ZM14 23H15V21H17V22H18V24H17V25H16V26H14Z" />
                <path d="M17 25H19V24H21V27H19V29H17ZM21 27H24V31H21Z" />
            </g>
            <g class="hand-main">
                <path d="M3 8H4V7H5V6H6V3H8V1H10V3H12V4H14V6H12V9H11V10H10V11H9V13H7V17H5V15H3Z" />
                <path
                    d="M34 4H35V3H37V2H38V1H40V3H41V5H42V6H43V8H45V15H43V17H40V13H39V11H37V9H36V6H35V5H34Z"
                />
                <path
                    d="M10 13H11V11H13V9H14V7H19V9H17V14H18V16H22V15H23V14H24V13H27V15H29V16H30V17H31V18H33V19H34V21H36V23H33V22H32V21H30V23H31V24H33V26H31V25H29V24H28V23H27V26H29V28H28V29H26V26H24V25H23V23H21V21H19V20H17V19H16V18H12V19H11V18H10Z"
                />
                <path
                    d="M19 9H21V7H23V5H32V7H34V9H35V11H37V14H38V17H37V19H36V18H35V17H33V15H31V14H30V13H29V12H27V11H23V12H21V13H19Z"
                />
                <path d="M11 20H14V22H13V23H11ZM14 23H15V22H16V21H17V25H16V26H14Z" />
                <path d="M17 25H19V24H21V27H19V29H18V26H17ZM21 27H24V30H21Z" />
            </g>
            <g class="hand-light">
                <path d="M3 8H5V6H6V4H7V3H8V1H9V2H10V3H11V4H13V5H12V9H9V8H8V7H6V9H4V13H3Z" />
                <path
                    d="M34 4H36V3H38V2H40V3H41V6H43V8H45V15H43V13H44V10H43V9H40V10H39V9H37V7H36V5H34Z"
                />
                <path d="M19 9H21V7H23V5H32V7H25V9H23V10H21V13H19ZM18 25H19V26H20V27H18Z" />
            </g>
        </svg>
    </span>
</template>
<style scoped>
.exchange-consent {
    display: inline-grid;
    flex: none;
    width: var(--exchange-consent-width, 42px);
    place-items: center;
    --hand-shadow: #0e1b15;
    --hand-base: #586252;
    --hand-main: #737c69;
    --hand-light: #939b86;
}
svg {
    display: block;
    width: 100%;
    height: auto;
}
.hand-outline {
    fill: var(--hand-shadow);
}
.hand-base {
    fill: var(--hand-base);
}
.hand-main {
    fill: var(--hand-main);
}
.hand-light {
    fill: var(--hand-light);
}
.exchange-consent--ready {
    --hand-base: #919757;
    --hand-main: #c4bd79;
    --hand-light: #eee0a0;
}
</style>
