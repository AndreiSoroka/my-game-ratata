<script setup lang="ts">
import type { HealthSnapshot, SoulSnapshot } from '@my-game-ratata/contracts'

import { SoulBadgeIcons } from '@/entities/player-effects'
import { healthBarPercent, healthText } from '@/shared/lib/resource-display'
import { GameBar, HudFrame, UiFrame } from '@/shared/ui/common'
import { lightUiColors } from '@/shared/ui/theme'

defineProps<{ section: 'parchment' | 'identity' | 'resources' }>()
const soul: SoulSnapshot = {
    kind: 'spark',
    controlSource: 'human',
    canSpeak: true,
}
const resources: Array<{
    label: string
    kind: 'hp' | 'mana' | 'energy'
    value: HealthSnapshot & { hasCapacity?: boolean }
}> = [
    { label: 'Полное здоровье', kind: 'hp', value: { kind: 'percent', percent: 100 } },
    { label: 'Частичная мана', kind: 'mana', value: { kind: 'percent', percent: 35 } },
    { label: 'Пустая энергия', kind: 'energy', value: { kind: 'percent', percent: 0 } },
    {
        label: 'Нет ёмкости маны',
        kind: 'mana',
        value: { kind: 'percent', percent: 0, hasCapacity: false },
    },
    {
        label: 'Известные значения',
        kind: 'hp',
        value: { kind: 'exact', current: 17.870400000000018, max: 30 },
    },
]
const colors = {
    hp: lightUiColors.bar.health.color,
    mana: lightUiColors.bar.mana.color,
    energy: lightUiColors.bar.energy.color,
}
const names = ['Астрия Янтарь', 'МихаилСорокаНовгородский']
</script>

<template>
    <section class="kenney-hud-stage" :aria-label="`Общие компоненты Kenney: ${section}`">
        <template v-if="section === 'parchment'">
            <h2>Пергаментная панель</h2>
            <div class="kenney-hud-frame game-frame-host">
                <UiFrame skin="parchment" />
                <h3>Панель персонажа</h3>
                <p>Общая рамка Kenney сохраняет светлую подложку и деревянные края.</p>
            </div>
        </template>
        <template v-else-if="section === 'identity'">
            <h2>Имя персонажа</h2>
            <HudFrame v-for="name in names" :key="name" class="kenney-hud-identity">
                <div class="kenney-hud-name">
                    <strong :title="name">{{ name }}</strong>
                    <SoulBadgeIcons :soul-kind="soul.kind" :is-can-speak="soul.canSpeak" />
                </div>
            </HudFrame>
        </template>
        <template v-else>
            <h2>Полосы ресурсов</h2>
            <div v-for="resource in resources" :key="resource.label" class="kenney-hud-resource">
                <span>{{ resource.label }}</span>
                <GameBar
                    :value="healthBarPercent(resource.value)"
                    :label="resource.label"
                    :color="colors[resource.kind]"
                    :aria-valuetext="healthText(resource.value) || undefined"
                >
                    <template v-if="resource.value.kind === 'exact'" #default>
                        {{ healthText(resource.value) }}
                    </template>
                </GameBar>
            </div>
        </template>
    </section>
</template>

<style scoped>
.kenney-hud-stage {
    box-sizing: border-box;
    width: 100%;
    max-width: 560px;
    min-width: 0;
    padding: 18px;
    color: #f6edcf;
    background: #354137;
    font:
        14px/1.4 system-ui,
        sans-serif;
}
h2,
h3 {
    font-family: var(--ratata-font-family);
}
h2 {
    margin: 0 0 18px;
    font-size: 22px;
}
h3 {
    margin: 0 0 10px;
    font-size: 18px;
}
p {
    margin: 0;
}
.kenney-hud-frame {
    --game-frame-border-width: 10px;
    border: 10px solid transparent;
    padding: 14px;
}
.kenney-hud-identity {
    margin-bottom: 18px;
}
.kenney-hud-name {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    gap: 10px;
    padding: 6px;
}
.kenney-hud-name strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.kenney-hud-name :deep(.soul-badge-icons) {
    flex: 0 0 auto;
    color: inherit;
    gap: 5px;
}
.kenney-hud-resource {
    margin-bottom: 14px;
}
.kenney-hud-resource > span:first-child {
    display: block;
    margin-bottom: 5px;
}
@media (max-width: 500px) {
    .kenney-hud-stage {
        padding: 10px;
    }
    .kenney-hud-name {
        font-size: 12px;
        gap: 6px;
    }
}
</style>
