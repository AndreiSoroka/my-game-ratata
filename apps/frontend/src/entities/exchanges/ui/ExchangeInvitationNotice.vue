<script setup lang="ts">
import { computed, useId } from 'vue'

import { HudFrame, UiButton, type UiButtonColors } from '@/shared/ui/common'

import type { ExchangeInvitationDirection } from '../model/exchangeInvitation'

const props = defineProps<{ partnerName: string; direction: ExchangeInvitationDirection }>()
const emit = defineEmits<{ accept: []; decline: []; cancel: [] }>()
const headingId = useId()
const incoming = computed(() => props.direction === 'incoming')

const acceptColors = {
    normal: {
        text: 'var(--ui-light-panel-title)',
        border: 'var(--ui-light-border-white)',
        backgroundTop: 'var(--ui-light-panel-parchment)',
        backgroundBottom: 'var(--ui-light-panel-coffee)',
    },
    highlighted: {
        text: 'var(--ui-light-panel-title)',
        border: 'var(--ui-light-border-white)',
        backgroundTop: 'var(--ui-light-border-white)',
    },
    edge: 'var(--ui-dark-panel-ornament)',
    focus: 'var(--ui-dark-panel-title)',
} satisfies UiButtonColors

const dismissColors = {
    normal: {
        text: 'var(--ui-dark-panel-text)',
        border: 'var(--ui-dark-panel-ornament)',
    },
    highlighted: {
        text: 'var(--ui-dark-panel-title)',
        border: 'var(--ui-dark-panel-border)',
        backgroundTop: 'var(--ui-dark-bar-track)',
        backgroundBottom: 'var(--ui-dark-panel-surface)',
    },
    focus: 'var(--ui-dark-panel-title)',
} satisfies UiButtonColors
</script>

<template>
    <section class="exchange-invitation" :aria-labelledby="headingId">
        <HudFrame>
            <div class="exchange-invitation__content">
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
                        class="exchange-invitation__button exchange-invitation__button--accept"
                        border="border-014"
                        :colors="acceptColors"
                        @click="emit('accept')"
                    >
                        Начать торговлю
                    </UiButton>
                    <UiButton
                        v-if="incoming"
                        class="exchange-invitation__button"
                        appearance="ghost"
                        border="border-015"
                        :colors="dismissColors"
                        @click="emit('decline')"
                    >
                        Отклонить
                    </UiButton>
                    <UiButton
                        v-else
                        class="exchange-invitation__button"
                        appearance="ghost"
                        border="border-015"
                        :colors="dismissColors"
                        @click="emit('cancel')"
                    >
                        Отменить предложение
                    </UiButton>
                </div>
            </div>
        </HudFrame>
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
    text-align: center;
}

.exchange-invitation__heading {
    margin: 0;
    color: var(--ui-dark-panel-positive);
    font: 600 17px/1.15 var(--ratata-font-family, sans-serif);
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
    color: var(--ui-dark-panel-title);
}

.exchange-invitation__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    min-inline-size: 0;
    max-inline-size: 100%;
}

.exchange-invitation__button {
    min-inline-size: 0;
    min-block-size: 36px;
    padding: 7px 12px;
    font-size: 14px;
}

.exchange-invitation__button--accept {
    min-block-size: 42px;
    text-shadow: none;
}
</style>
