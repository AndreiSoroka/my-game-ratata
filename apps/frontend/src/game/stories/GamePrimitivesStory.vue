<script setup lang="ts">
import { ref } from 'vue'

import { ItemSlot, UiButton, UiFrame, UiInput, UiSelect, UiTextarea } from '@/shared/ui/common'

import { itemAssetCatalog } from '../assets/itemCatalog'

defineProps<{ section: 'buttons' | 'fields' | 'frames' | 'slots' }>()
const variants = ['secondary', 'primary', 'success', 'danger'] as const
const labels = {
    secondary: 'Закрыть',
    primary: 'Предложить',
    success: 'Подтвердить',
    danger: 'Отменить',
}
const message = ref('Можем обменяться?')
const quantity = ref(2)
const destination = ref('novogorod')
const notes = ref('Встретимся у городских ворот.')
const enabled = ref(true)
const choice = ref('party')
</script>

<template>
    <section class="game-primitives-stage" :aria-label="`Общие компоненты: ${section}`">
        <template v-if="section === 'buttons'">
            <h2>Кнопки</h2>
            <div v-for="variant in variants" :key="variant" class="primitive-example">
                <h3>{{ variant }}</h3>
                <div class="primitive-row">
                    <UiButton size="small" :variant="variant" :data-testid="`${variant}-default`">{{
                        labels[variant]
                    }}</UiButton>
                    <UiButton size="small" :variant="variant" disabled>{{
                        labels[variant]
                    }}</UiButton>
                    <UiButton size="small" :variant="variant" aria-pressed="true" selected>{{
                        labels[variant]
                    }}</UiButton>
                </div>
            </div>
            <div class="primitive-example primitive-selected">
                <h3>Выбранные переключатели и текущий пункт</h3>
                <div class="primitive-row">
                    <UiButton size="small" role="switch" aria-checked="true" selected
                        >Автозапуск</UiButton
                    >
                    <UiButton size="small" aria-current="true" selected>Текущее задание</UiButton>
                    <UiButton size="small" aria-current="false">Другое задание</UiButton>
                </div>
            </div>
            <div class="primitive-example">
                <h3>Компактные действия</h3>
                <div class="primitive-row">
                    <UiButton size="compact">Всё</UiButton>
                    <UiButton size="compact" icon aria-label="Уменьшить">−</UiButton>
                    <UiButton size="compact" icon aria-label="Увеличить">+</UiButton>
                    <UiButton size="small" icon aria-label="Закрыть окно">×</UiButton>
                </div>
            </div>
        </template>
        <template v-else-if="section === 'fields'">
            <h2>Поля ввода</h2>
            <div class="primitive-fields">
                <label
                    >Сообщение<UiInput :border-width="4" v-model="message" maxlength="400"
                /></label>
                <label
                    >Количество<UiInput
                        :border-width="4"
                        v-model.number="quantity"
                        type="number"
                        min="0"
                        max="9"
                /></label>
                <label
                    >Место<UiSelect :border-width="4" v-model="destination"
                        ><option value="novogorod">Новогород</option>
                        <option value="forest">Лес</option></UiSelect
                    ></label
                >
                <label
                    >Пустое поле<UiInput :border-width="4" placeholder="Сообщение собеседнику"
                /></label>
                <label
                    >Ошибка<UiInput
                        :border-width="4"
                        value="Недоступно"
                        aria-invalid="true"
                        aria-describedby="field-error"
                    /><small id="field-error">Измените значение</small></label
                >
                <label
                    >Недоступное поле<UiInput
                        :border-width="4"
                        value="Собеседник недоступен"
                        disabled
                /></label>
                <label>Заметка<UiTextarea v-model="notes" rows="3" /></label>
                <label class="primitive-check"
                    ><UiInput v-model="enabled" type="checkbox" /> Общая награда</label
                >
                <div class="primitive-row">
                    <label class="primitive-check"
                        ><UiInput v-model="choice" type="radio" value="party" /> Отряд</label
                    >
                    <label class="primitive-check"
                        ><UiInput v-model="choice" type="radio" value="self" /> Только я</label
                    >
                </div>
            </div>
        </template>
        <template v-else-if="section === 'frames'">
            <h2>Рамки</h2>
            <div class="primitive-frame game-frame-host">
                <UiFrame variant="window" />
                <h3>Игровое окно</h3>
                <div class="primitive-frame game-frame-host">
                    <UiFrame variant="panel" />
                    <h3>Ваше предложение</h3>
                    <p>Внутренняя панель</p>
                </div>
                <div class="primitive-frame game-frame-host">
                    <UiFrame variant="inset" />
                    <p>Углублённая поверхность</p>
                </div>
            </div>
            <div class="primitive-frame primitive-frame--speech game-frame-host">
                <UiFrame variant="speech" />
                <p>Буль, выбирай. Я подожду.</p>
            </div>
        </template>
        <template v-else>
            <h2>Предметные слоты</h2>
            <div class="primitive-example">
                <h3>Обычный, выбранный, пустой, недоступный</h3>
                <div class="primitive-row">
                    <ItemSlot
                        as="button"
                        :quantity="5"
                        :src="itemAssetCatalog.food.src"
                        alt=""
                        aria-label="Яблоко × 5"
                    />
                    <ItemSlot
                        as="button"
                        selected
                        :src="itemAssetCatalog.simple_sword.src"
                        alt=""
                        aria-label="Простой меч"
                    />
                    <ItemSlot as="button" empty aria-label="Пустой слот" />
                    <ItemSlot
                        as="button"
                        disabled
                        :src="itemAssetCatalog.food.src"
                        alt=""
                        aria-label="Недоступное яблоко"
                    />
                </div>
            </div>
            <div class="primitive-example">
                <h3>Размеры и произвольное содержимое</h3>
                <div class="primitive-row">
                    <ItemSlot
                        class="primitive-slot-small"
                        :src="itemAssetCatalog.food.src"
                        alt="Яблоко"
                    />
                    <ItemSlot
                        class="primitive-slot-large"
                        :quantity="3"
                        :src="itemAssetCatalog.grain.src"
                        alt="Пшеница"
                    />
                    <ItemSlot class="primitive-slot-large">
                        <span aria-label="Заклинание">✦</span>
                    </ItemSlot>
                </div>
            </div>
        </template>
    </section>
</template>

<style scoped>
.game-primitives-stage {
    width: 100%;
    max-width: 780px;
    padding: 18px;
    color: var(--game-ui-text);
    background: #0e2018;
    font:
        14px/1.4 system-ui,
        sans-serif;
}
h2,
h3 {
    font-family: var(--game-ui-control-font);
}
h2 {
    margin: 0 0 18px;
    font-size: 23px;
}
h3 {
    margin: 0 0 9px;
    font-size: 17px;
}
.primitive-example {
    margin-bottom: 16px;
}
.primitive-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
}
.primitive-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 15px;
}
.primitive-fields label {
    display: grid;
    gap: 6px;
    min-width: 0;
}
.primitive-fields .primitive-check {
    display: flex;
    align-items: center;
}
.primitive-fields small {
    color: var(--ui-dark-panel-warning);
}
.primitive-frame {
    padding: 17px;
    margin-bottom: 12px;
}
.primitive-frame--speech {
    color: #253324;
}
.primitive-slot-small {
    --ui-item-slot-size: 32px;
    --ui-item-slot-image-size: 70%;
}
.primitive-slot-large {
    --ui-item-slot-size: 56px;
    --ui-item-slot-image-size: 70%;
}
@media (max-width: 500px) {
    .primitive-fields {
        grid-template-columns: minmax(0, 1fr);
    }
    .game-primitives-stage {
        padding: 12px;
    }
}
</style>
