<script setup lang="ts">
import { computed, useId } from 'vue'

import { UiButton, type UiButtonColors } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { lightUiColors } from '@/shared/ui/theme'

import type { ExchangeInvitationDirection } from '../model/exchangeInvitation'

const props = defineProps<{ partnerName: string; direction: ExchangeInvitationDirection }>()
const emit = defineEmits<{ accept: []; decline: []; cancel: [] }>()
const headingId = useId()
const incoming = computed(() => props.direction === 'incoming')
const declineColors: UiButtonColors = {
    highlighted: {
        text: lightUiColors.panel.title,
        border: lightUiColors.border.wood,
        backgroundTop: 'transparent',
        backgroundBottom: 'transparent',
    },
    edge: 'transparent',
    shadow: 'transparent',
}
</script>

<template>
    <section class="exchange-invitation" :aria-labelledby="headingId">
        <FantasyBorder
            border="border-014"
            :color="lightUiColors.border.wood"
            class="exchange-invitation__content"
        >
            <h2 :id="headingId" class="exchange-invitation__heading">
                {{ incoming ? 'Приглашение к торговле' : 'Предложение отправлено' }}
            </h2>
            <p v-if="incoming" class="exchange-invitation__message" role="status">
                <strong>{{ partnerName }}</strong> хочет с вами поторговаться.
            </p>
            <p v-else class="exchange-invitation__message" role="status">
                Ожидаем ответа от <strong>{{ `«${partnerName}»` }}</strong> на приглашение к
                торговле.
            </p>
            <div class="exchange-invitation__actions">
                <UiButton
                    v-if="incoming"
                    class="exchange-invitation__button"
                    appearance="panel"
                    panel="panel-001"
                    @click="emit('accept')"
                >
                    Начать торговлю
                </UiButton>
                <UiButton
                    v-if="incoming"
                    class="exchange-invitation__button"
                    appearance="ghost"
                    border="border-001"
                    :colors="declineColors"
                    @click="emit('decline')"
                >
                    Отклонить
                </UiButton>
                <UiButton
                    v-else
                    class="exchange-invitation__button"
                    appearance="panel"
                    panel="panel-001"
                    @click="emit('cancel')"
                >
                    Отменить предложение
                </UiButton>
            </div>
        </FantasyBorder>
    </section>
</template>

<style scoped>
.exchange-invitation {
    min-inline-size: 0;
}

.exchange-invitation__content {
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 8px;
    background: var(--ui-light-panel-coffee);
    color: var(--ui-light-panel-text);
    text-align: center;
}

.exchange-invitation__heading {
    margin: 0;
    color: var(--ui-light-panel-title);
    font: 500 20px/1.2 var(--ratata-font-family, sans-serif);
    overflow-wrap: anywhere;
}

.exchange-invitation__message {
    max-inline-size: 100%;
    margin: 0;
    font:
        13px/1.35 system-ui,
        sans-serif;
    overflow-wrap: anywhere;
}

.exchange-invitation__message strong {
    color: var(--ui-light-panel-title);
}

.exchange-invitation__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    min-inline-size: 0;
    max-inline-size: 100%;
}

.exchange-invitation__button {
    --ui-button-panel-padding: 3px 6px;
    min-inline-size: 0;
    font-size: 14px;
}

@media (max-width: 400px) {
    .exchange-invitation__heading {
        font-size: 17px;
    }
}
</style>
