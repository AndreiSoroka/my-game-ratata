<script setup lang="ts">
import './exchangeWindow.css'

import type {
    CharacterSnapshot,
    ClientMessage,
    ExchangeSnapshot,
    WhisperSnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import ExchangeOfferPane from './ExchangeOfferPane.vue'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import PrivateConversation from './PrivateConversation.vue'
import SocialWindow from './SocialWindow.vue'
import TradeGoldEditor from './TradeGoldEditor.vue'
import TradeItemEditor from './TradeItemEditor.vue'
import { useExchangeDraft } from './useExchangeDraft'

const props = defineProps<{
    exchange: ExchangeSnapshot
    player: CharacterSnapshot
    gold: number
    conversation?: WhisperSnapshot | null
}>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const draft = useExchangeDraft(props, (message) => emit('command', message))
const active = computed(() => props.exchange.status === 'active')
const terminal = computed(
    () => props.exchange.status === 'completed' || props.exchange.status === 'cancelled'
)
const terminalText = computed(() =>
    props.exchange.status === 'completed'
        ? 'Обмен завершён'
        : (props.exchange.notice ?? 'Обмен отменён')
)
function whisper(text: string): void {
    emit('command', { type: 'whisper', targetId: props.exchange.partnerId, text })
}
</script>
<template>
    <SocialWindow
        :title="`Обмен: ${exchange.partnerName}`"
        layout="exchange"
        @close="emit('close')"
    >
        <div class="exchange-content">
            <div
                v-if="terminal"
                class="exchange-terminal game-frame-host"
                :class="{ 'exchange-terminal--completed': exchange.status === 'completed' }"
                role="status"
            >
                <GameFrame variant="inset" />
                {{ terminalText }}
            </div>
            <div class="exchange-sides" tabindex="0" aria-label="Условия обмена">
                <ExchangeOfferPane title="Вы" :offer="exchange.own" :terminal="terminal">
                    <template v-if="draft.editing.value">
                        <div class="exchange-bag-tools">
                            <span>Из вашей сумки</span>
                            <GameButton type="button" @click="draft.all">Все вещи</GameButton>
                            <GameButton type="button" @click="draft.clear">Убрать вещи</GameButton>
                        </div>
                        <ul
                            class="exchange-own-items"
                            tabindex="0"
                            aria-label="Ваши вещи для обмена"
                        >
                            <TradeItemEditor
                                v-for="item in player.inventory"
                                :key="item.instanceId"
                                :item="item"
                                :available="draft.available.value.get(item.instanceId) ?? 0"
                                :selected="draft.quantities.value[item.instanceId] ?? 0"
                                @change="draft.change(item.instanceId, $event)"
                            />
                            <li v-if="!player.inventory.length" class="exchange-bag-empty">
                                Ваша сумка пуста
                            </li>
                        </ul>
                    </template>
                    <template v-if="draft.editing.value" #gold>
                        <TradeGoldEditor
                            :selected="draft.gold.value"
                            :available="draft.availableGold.value"
                            @change="draft.changeGold"
                        />
                    </template>
                </ExchangeOfferPane>
                <ExchangeOfferPane
                    :title="exchange.partnerName"
                    :offer="exchange.other"
                    :terminal="terminal"
                />
            </div>
            <div v-if="active" class="exchange-draft-status" role="status">
                <span v-if="draft.withdrawing.value">Снимаем подтверждение…</span>
                <span v-else-if="draft.confirming.value">Подтверждаем условия…</span>
                <span v-else-if="exchange.own.accepted"
                    >Вы подтвердили эти условия. Для правки сначала снимите подтверждение.</span
                >
                <span v-else-if="draft.error.value" class="exchange-error">{{
                    draft.error.value
                }}</span>
                <span v-else-if="!draft.valid.value" class="exchange-error"
                    >Часть выбранного недоступна. Измените предложение.</span
                >
                <span v-else-if="draft.pending.value">Отправляем предложение…</span>
                <span v-else-if="draft.dirty.value"
                    >Черновик · предложите изменения собеседнику</span
                >
                <span v-else-if="draft.empty.value">Добавьте вещь или золото</span>
                <span v-else>Любое изменение условий снимает оба подтверждения</span>
            </div>
            <PrivateConversation
                v-if="conversation?.partnerId === exchange.partnerId"
                :conversation="conversation"
                :player-id="player.id"
                @send="whisper"
                @command="emit('command', $event)"
            />
            <footer class="exchange-actions">
                <template v-if="active">
                    <template v-if="!draft.editing.value">
                        <GameButton
                            type="button"
                            class="exchange-primary"
                            variant="primary"
                            :disabled="Boolean(draft.withdrawing.value || draft.confirming.value)"
                            @click="draft.edit"
                        >
                            Изменить предложение
                        </GameButton>
                    </template>
                    <template v-else>
                        <GameButton
                            type="button"
                            class="exchange-primary"
                            variant="primary"
                            :disabled="
                                !draft.dirty.value ||
                                !draft.valid.value ||
                                Boolean(draft.pending.value)
                            "
                            @click="draft.propose"
                        >
                            Предложить
                        </GameButton>
                        <GameButton
                            type="button"
                            class="exchange-confirm"
                            variant="success"
                            :disabled="!draft.canConfirm.value"
                            @click="draft.confirm"
                        >
                            {{
                                exchange.own.accepted && !draft.dirty.value
                                    ? 'Подтверждено'
                                    : 'Подтвердить'
                            }}
                        </GameButton>
                    </template>
                    <GameButton type="button" class="exchange-cancel" @click="emit('close')">
                        Отменить
                    </GameButton>
                </template>
                <template v-else-if="terminal">
                    <GameButton
                        type="button"
                        class="exchange-primary"
                        variant="primary"
                        :disabled="conversation?.available === false"
                        @click="
                            emit('command', {
                                type: 'exchange_invite',
                                targetId: exchange.partnerId,
                            })
                        "
                    >
                        Новый обмен
                    </GameButton>
                    <GameButton type="button" @click="emit('close')">Закрыть</GameButton>
                </template>
            </footer>
        </div>
    </SocialWindow>
</template>
