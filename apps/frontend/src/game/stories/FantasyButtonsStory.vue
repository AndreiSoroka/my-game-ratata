<script setup lang="ts">
import { ref } from 'vue'

import GameButton from '../ui/primitives/GameButton.vue'
import GameFrame from '../ui/primitives/GameFrame.vue'

defineProps<{ section: 'menu' | 'variants' | 'sizes' | 'states' }>()
const titles = {
    menu: 'Игровое меню',
    variants: 'Варианты кнопок',
    sizes: 'Размеры и подписи',
    states: 'Состояния кнопок',
}
const variants = [
    { id: 'primary', label: 'Предложить' },
    { id: 'secondary', label: 'Закрыть' },
    { id: 'success', label: 'Подтвердить' },
    { id: 'danger', label: 'Отменить' },
    { id: 'slot', label: '1' },
] as const
const menuActions = [
    { id: 'resume', label: 'Вернуться в игру', variant: 'primary' },
    { id: 'character', label: 'Персонаж · P', variant: 'secondary' },
    { id: 'markers', label: 'Метки', variant: 'secondary' },
    { id: 'scenarios', label: 'Сценарии', variant: 'secondary' },
    { id: 'sound', label: 'Звук: включён', variant: 'secondary' },
    { id: 'leave', label: 'Выйти из игры', variant: 'danger' },
] as const
const muted = ref(false)
const actionCount = ref(0)
const lastAction = ref('')
function activate(action: (typeof menuActions)[number]): void {
    if (action.id === 'sound') muted.value = !muted.value
    lastAction.value = action.label
    actionCount.value += 1
}
</script>

<template>
    <section
        class="fantasy-buttons-stage game-frame-host game-fantasy-surface"
        :class="{ 'fantasy-buttons-stage--menu': section === 'menu' }"
        :role="section === 'menu' ? 'dialog' : 'region'"
        :aria-label="section === 'menu' ? titles.menu : `Кнопки Fantasy: ${section}`"
    >
        <GameFrame skin="parchment" />
        <header class="fantasy-buttons-header">
            <h2>{{ titles[section] }}</h2>
            <p v-if="section === 'menu'">Мир продолжает жить, пока открыто меню.</p>
        </header>
        <div v-if="section === 'menu'" class="fantasy-buttons-menu">
            <GameButton
                v-for="action in menuActions"
                :key="action.id"
                skin="fantasy"
                :variant="action.variant"
                :data-testid="`fantasy-menu-${action.id}`"
                :aria-pressed="action.id === 'sound' ? muted : undefined"
                @click="activate(action)"
            >
                {{
                    action.id === 'sound' ? `Звук: ${muted ? 'выключен' : 'включён'}` : action.label
                }}
            </GameButton>
            <p v-if="actionCount" role="status" aria-label="Результат действия">
                Действие: {{ lastAction }} · {{ actionCount }}
            </p>
        </div>
        <div v-else-if="section === 'variants'" class="fantasy-buttons-examples">
            <section v-for="variant in variants" :key="variant.id" class="fantasy-buttons-example">
                <h3>{{ variant.id }}</h3>
                <div class="fantasy-buttons-row">
                    <GameButton skin="fantasy" :variant="variant.id">{{
                        variant.label
                    }}</GameButton>
                    <GameButton skin="fantasy" :variant="variant.id" disabled>{{
                        variant.label
                    }}</GameButton>
                    <GameButton skin="fantasy" :variant="variant.id" aria-pressed="true">{{
                        variant.label
                    }}</GameButton>
                </div>
            </section>
        </div>
        <div v-else-if="section === 'sizes'" class="fantasy-buttons-examples">
            <section class="fantasy-buttons-example">
                <h3>Обычные</h3>
                <div class="fantasy-buttons-row">
                    <GameButton skin="fantasy" variant="primary">Предложить</GameButton>
                    <GameButton skin="fantasy">Закрыть</GameButton>
                </div>
            </section>
            <section class="fantasy-buttons-example">
                <h3>Компактные</h3>
                <div class="fantasy-buttons-row">
                    <GameButton skin="fantasy" size="compact">Всё</GameButton>
                    <GameButton skin="fantasy" size="compact" icon aria-label="Уменьшить"
                        >−</GameButton
                    >
                    <GameButton skin="fantasy" size="compact" icon aria-label="Увеличить"
                        >+</GameButton
                    >
                    <GameButton skin="fantasy" icon aria-label="Закрыть окно">×</GameButton>
                </div>
            </section>
            <section class="fantasy-buttons-example">
                <h3>Длинная подпись</h3>
                <GameButton skin="fantasy" class="fantasy-buttons-long"
                    >Вернуться к городским приключениям</GameButton
                >
            </section>
        </div>
        <div v-else class="fantasy-buttons-examples">
            <div class="fantasy-buttons-row">
                <GameButton skin="fantasy" data-testid="fantasy-focus">Фокус</GameButton>
                <GameButton skin="fantasy" variant="primary" data-testid="fantasy-hover"
                    >Наведите курсор</GameButton
                >
                <GameButton skin="fantasy" data-testid="fantasy-pressed">Нажатие</GameButton>
                <GameButton skin="fantasy" disabled data-testid="fantasy-disabled"
                    >Недоступно</GameButton
                >
                <GameButton skin="fantasy" aria-pressed="true" data-testid="fantasy-selected"
                    >Выбрано</GameButton
                >
            </div>
        </div>
    </section>
</template>

<style scoped>
.fantasy-buttons-stage {
    --game-frame-border-width: 10px;
    --game-frame-image-width: 14px;
    box-sizing: border-box;
    width: min(660px, 100%);
    min-width: 0;
    border: 10px solid transparent;
    padding: 22px;
    color: var(--game-panel-text);
    font:
        14px/1.5 system-ui,
        sans-serif;
}
.fantasy-buttons-stage--menu {
    width: min(380px, 100%);
}
.fantasy-buttons-header {
    margin-bottom: 20px;
}
.fantasy-buttons-stage--menu .fantasy-buttons-header {
    text-align: center;
}
h2,
h3 {
    margin: 0;
    font-family: var(--game-ui-control-font);
    color: var(--game-panel-heading, var(--game-panel-text));
}
h2 {
    font-size: 26px;
    line-height: 1.2;
}
h3 {
    font-size: 18px;
    margin-bottom: 10px;
}
p {
    margin: 10px 0 0;
    color: var(--game-panel-muted);
}
.fantasy-buttons-menu,
.fantasy-buttons-examples {
    display: grid;
    gap: 15px;
}
.fantasy-buttons-menu > .game-button {
    width: 100%;
    min-height: 46px;
}
.fantasy-buttons-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}
.fantasy-buttons-example {
    min-width: 0;
}
.fantasy-buttons-long {
    width: 100%;
}
@media (max-width: 500px) {
    .fantasy-buttons-stage {
        padding: 16px 12px;
    }
    h2 {
        font-size: 23px;
    }
    .fantasy-buttons-menu {
        gap: 12px;
    }
}
</style>
