<script setup lang="ts">
import { computed } from 'vue'

import { gameLocale } from '@/shared/lib/i18n'

import { defaultRegionLore, formatLocationCount, type RegionLoreContent } from '../model/regionLore'

defineProps<Partial<RegionLoreContent>>()
const defaults = computed(defaultRegionLore)
</script>

<template>
    <div class="region-lore">
        <p class="region-lore__eyebrow">
            {{ (regionName ?? defaults.regionName).toLocaleUpperCase(gameLocale) }} ·
            {{ formatLocationCount(locationCount ?? defaults.locationCount) }}
        </p>
        <h2 class="region-lore__heading">
            {{ headingFirstLine ?? defaults.headingFirstLine }}<br />
            {{ headingSecondLine ?? defaults.headingSecondLine }}
        </h2>
        <p class="region-lore__description">{{ description ?? defaults.description }}</p>
        <p class="region-lore__invitation">{{ invitation ?? defaults.invitation }}</p>
    </div>
</template>

<style scoped>
.region-lore {
    max-width: 620px;
    text-shadow: 0 2px 20px #000c;
}
.region-lore__eyebrow {
    margin: 0 0 24px;
    color: #d5ba7d;
    font:
        11px/1.6 system-ui,
        sans-serif;
    letter-spacing: 3px;
}
.region-lore__heading {
    margin: 0 0 24px;
    color: #fff1cf;
    font-size: clamp(36px, 4.5vw, 68px);
    font-weight: 600;
    line-height: 1.15;
}
.region-lore__description {
    max-width: 470px;
    color: #efe6d1;
    font:
        17px/1.7 system-ui,
        sans-serif;
}
.region-lore__invitation {
    max-width: 440px;
    margin-top: 20px;
    color: #b8c5b5;
    font:
        14px/1.7 system-ui,
        sans-serif;
}
@media (max-width: 820px) {
    .region-lore {
        max-width: 440px;
        text-align: center;
    }
    .region-lore__heading {
        font-size: 36px;
        margin-bottom: 16px;
    }
    .region-lore__eyebrow {
        font-size: 9px;
        margin-bottom: 16px;
    }
    .region-lore__description {
        font-size: 14px;
    }
    .region-lore__invitation {
        display: none;
    }
}
</style>
