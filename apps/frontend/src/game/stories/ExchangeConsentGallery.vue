<script setup lang="ts">
import { ExchangeConsentIcon } from '@/entities/exchanges'

import GameFrame from '../ui/primitives/GameFrame.vue'
</script>

<template>
    <section class="consent-gallery game-frame-host" aria-label="Подтверждение обмена">
        <GameFrame variant="panel" />
        <div><ExchangeConsentIcon name="Вы" :accepted="false" /><span>Не подтверждено</span></div>
        <div><ExchangeConsentIcon name="Капля" :accepted="true" /><span>Подтверждено</span></div>
    </section>
</template>

<style scoped>
.consent-gallery {
    position: relative;
    display: grid;
    gap: 20px;
    width: fit-content;
    padding: 24px;
    color: var(--game-ui-text);
}
.consent-gallery div {
    display: flex;
    gap: 16px;
    align-items: center;
}
</style>
