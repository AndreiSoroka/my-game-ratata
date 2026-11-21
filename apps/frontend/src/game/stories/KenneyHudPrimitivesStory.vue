<script setup lang="ts">
import type { HealthSnapshot, SoulSnapshot } from '@my-game-ratata/contracts'

import { SoulBadgeIcons } from '@/entities/player-effects'

import GameFrame from '../ui/primitives/GameFrame.vue'
import GameResourceBar from '../ui/primitives/GameResourceBar.vue'
import GameRibbon from '../ui/primitives/GameRibbon.vue'

defineProps<{ section: 'parchment' | 'ribbons' | 'resources' }>()
const soul: SoulSnapshot = {
    kind: 'spark',
    controlSource: 'human',
    canSpeak: true,
    personality: 'Любознательный',
    companion: null,
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
</script>

<template>
    <section class="kenney-hud-stage" :aria-label="`Общие компоненты Kenney: ${section}`">
        <template v-if="section === 'parchment'">
            <h2>Пергаментная панель</h2>
            <div class="kenney-hud-frame game-frame-host">
                <GameFrame skin="parchment" />
                <h3>Панель персонажа</h3>
                <p>Общая рамка Kenney сохраняет светлую подложку и деревянные края.</p>
            </div>
        </template>
        <template v-else-if="section === 'ribbons'">
            <h2>Лента имени</h2>
            <GameRibbon class="kenney-hud-ribbon">
                <strong>Астрия Янтарь</strong>
                <SoulBadgeIcons :soul-kind="soul.kind" :is-can-speak="soul.canSpeak" />
            </GameRibbon>
            <GameRibbon class="kenney-hud-ribbon">
                <strong title="МихаилСорокаНовгородский">МихаилСорокаНовгородский</strong>
                <SoulBadgeIcons :soul-kind="soul.kind" :is-can-speak="soul.canSpeak" />
            </GameRibbon>
        </template>
        <template v-else>
            <h2>Полосы ресурсов</h2>
            <div v-for="resource in resources" :key="resource.label" class="kenney-hud-resource">
                <span>{{ resource.label }}</span>
                <GameResourceBar
                    :value="resource.value"
                    :kind="resource.kind"
                    :aria-label="resource.label"
                />
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
.kenney-hud-ribbon {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    gap: 10px;
    margin-bottom: 18px;
    padding-inline: 18px;
}
.kenney-hud-ribbon strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.kenney-hud-ribbon :deep(.soul-badge-icons) {
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
    .kenney-hud-ribbon {
        --game-ribbon-height: 24px;
        --game-ribbon-cap-width: 12px;
        font-size: 12px;
        gap: 6px;
    }
    .kenney-hud-resource {
        --game-resource-border-width: 3px;
        --game-resource-height: 17px;
    }
}
</style>
