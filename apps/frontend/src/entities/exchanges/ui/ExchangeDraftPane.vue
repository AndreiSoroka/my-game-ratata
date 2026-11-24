<script setup lang="ts">
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { darkPanelButtonColors, UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'

import ExchangeDraftRow from './ExchangeDraftRow.vue'
import type { ExchangeDraftOffer } from './exchangeWindowProps'

const props = defineProps<{ draft: ExchangeDraftOffer }>()
const emit = defineEmits<{
    changeItem: [instanceId: string, quantity: number]
    changeGold: [quantity: number]
    all: []
    clear: []
    propose: []
}>()

const status = computed(() => {
    const { error, valid, pending, dirty } = props.draft
    if (error) return error
    if (!valid) return tGame('game.trade.someSelectedItemsAreUnavailable')
    if (pending) return tGame('game.trade.sendingOffer')
    return dirty ? tGame('game.trade.changesNotSent') : ''
})
</script>

<template>
    <FantasyBorder
        class="exchange-offer exchange-draft-pane"
        border="border-004"
        color="var(--exchange-frame-accent, var(--ui-dark-panel-border))"
        role="region"
        :aria-label="tGame('game.trade.yourOffer')"
    >
        <header class="exchange-draft-pane__header">
            <h3>{{ tGame('game.trade.yourOffer') }}</h3>
            <span v-if="draft.dirty">{{ tGame('game.trade.draft') }}</span>
        </header>
        <ul
            class="exchange-own-items"
            tabindex="0"
            :aria-label="tGame('game.trade.yourAvailableTradeItems')"
        >
            <ExchangeDraftRow
                v-for="entry in draft.items"
                :key="entry.item.instanceId"
                v-bind="entry"
                @change="emit('changeItem', entry.item.instanceId, $event)"
            />
            <li v-if="!draft.items.length" class="exchange-draft-pane__empty">
                {{ tGame('game.trade.yourBagIsEmpty') }}
            </li>
            <ExchangeDraftRow v-bind="draft.gold" @change="emit('changeGold', $event)" />
        </ul>
        <footer class="exchange-draft-pane__footer">
            <div class="exchange-draft-pane__actions">
                <UiButton
                    appearance="panel"
                    panel="panel-015"
                    :colors="darkPanelButtonColors"
                    :disabled="!draft.items.length"
                    @click="emit('all')"
                >
                    {{ tGame('game.trade.allItems') }}
                </UiButton>
                <UiButton
                    appearance="panel"
                    panel="panel-015"
                    :colors="darkPanelButtonColors"
                    :aria-label="tGame('game.trade.removeItems')"
                    :disabled="!draft.items.length"
                    @click="emit('clear')"
                >
                    {{ tGame('game.trade.clearItems') }}
                </UiButton>
                <UiButton
                    class="exchange-draft-pane__propose"
                    appearance="panel"
                    panel="panel-015"
                    variant="primary"
                    :disabled="
                        !draft.pending && (!draft.valid || (!draft.dirty && !draft.canResubmit))
                    "
                    :aria-disabled="draft.pending || undefined"
                    @click="!draft.pending && emit('propose')"
                >
                    {{ tGame('game.trade.makeOffer') }}
                </UiButton>
            </div>
            <div
                class="exchange-draft-pane__status"
                :class="{ 'exchange-draft-pane__status--error': draft.error || !draft.valid }"
                role="status"
            >
                {{ status }}
            </div>
        </footer>
    </FantasyBorder>
</template>

<style scoped>
.exchange-draft-pane {
    --exchange-draft-divider: var(--ui-dark-panel-divider);
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    min-block-size: 0;
    padding-inline: clamp(2px, 0.65vw, 8px);
    background: var(--exchange-frame-surface, var(--ui-dark-panel-surface));
    color: var(--ui-dark-panel-text);
}

.exchange-draft-pane__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 2px 8px;
    border-block-end: 1px solid var(--exchange-draft-divider);
}

.exchange-draft-pane__header h3 {
    margin: 0;
    color: var(--ui-dark-panel-title);
    font: 600 clamp(15px, 2vw, 22px) / 1.2 var(--ratata-font-family, system-ui);
}

.exchange-draft-pane__header span {
    color: var(--ui-light-button-selected-edge);
    font-size: clamp(11px, 1.2vw, 14px);
}

.exchange-own-items {
    flex: 1;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    list-style: none;
    margin: 0;
    padding: 0;
    scrollbar-width: thin;
    scrollbar-color: var(--exchange-frame-accent, var(--ui-dark-panel-border)) transparent;
}

.exchange-draft-pane__empty {
    padding: 10px 4px;
    color: var(--exchange-frame-muted, var(--ui-dark-panel-text));
    font-size: 12px;
}

.exchange-draft-pane__footer {
    padding-block-start: 7px;
    border-block-start: 1px solid var(--exchange-draft-divider);
}

.exchange-draft-pane__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
}

.exchange-draft-pane__actions button {
    --ui-button-panel-padding: 1px 6px;
    min-inline-size: 0;
    min-block-size: 34px;
    font-size: clamp(11px, 1.3vw, 14px);
}

.exchange-draft-pane__propose {
    margin-inline-start: auto;
    font-weight: 600;
}

.exchange-draft-pane__status {
    min-block-size: 1.4em;
    padding: 2px;
    color: var(--exchange-frame-muted, var(--ui-dark-panel-text));
    font-size: clamp(11px, 1.25vw, 13px);
    overflow-wrap: anywhere;
}

.exchange-draft-pane__status--error {
    color: var(--ui-dark-panel-warning);
}

@media (max-width: 600px) and (max-height: 650px) {
    .exchange-own-items {
        overscroll-behavior-y: auto;
    }
}
</style>
