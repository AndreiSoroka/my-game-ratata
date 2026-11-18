<script setup lang="ts">
import type {
    AdventureQuestStatus,
    AdventureSnapshot,
    ClientMessage,
    PartySnapshot,
} from '@my-game-ratata/contracts'
import { computed, useId } from 'vue'

import { itemAssetCatalog } from '../assets/itemCatalog'
import { craftOrderPaymentText, craftOrderStatusLabels } from './craftOrderLabels'
import GuildQuestCard from './GuildQuestCard.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'
const props = defineProps<{
    adventure: AdventureSnapshot
    party?: PartySnapshot
    playerId?: string
    alive?: boolean
}>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const progressId = useId()
const heart = computed(
    () => itemAssetCatalog[props.adventure.quest.requiredItemId ?? 'slime_heart']
)
const completed = computed(() => props.adventure.quest.status === 'completed')
const cancelled = computed(() => props.adventure.quest.status === 'cancelled')
const terminal = computed(() => completed.value || cancelled.value)
const canAbandon = computed(
    () =>
        props.alive &&
        props.party &&
        (!props.party.leaderId || props.party.leaderId === props.playerId)
)
const canAct = computed(() => canAbandon.value && Boolean(props.party?.guildContact))
const statuses: Record<AdventureQuestStatus, string> = {
    active: 'Соберите сердца',
    available: 'Новая история',
    completed: 'Сердца переданы',
    cancelled: 'Городской заказ закрыт',
    ready: 'Сердца собраны — вернитесь к Мире',
}
</script>
<template>
    <section class="adventure-journal adventure-window" aria-label="Журнал заданий">
        <header class="adventure-window__header">
            <span>ЖУРНАЛ ПУТЕШЕСТВЕННИКА</span>
            <button type="button" aria-label="Закрыть журнал" @click="emit('close')">×</button>
        </header>
        <p class="adventure-eyebrow">
            {{ adventure.wardRestored ? 'Город пробуждён' : statuses[adventure.quest.status] }}
        </p>
        <h2>{{ adventure.quest.title }}</h2>
        <p>{{ adventure.quest.description }}</p>
        <div v-if="!cancelled" class="journal-hearts">
            <img :src="heart.src" :alt="heart.label" />
            <label :for="completed ? undefined : progressId"
                >Слизневые сердца в рюкзаке:
                <strong
                    >{{ adventure.trophies
                    }}<template v-if="!completed"> / {{ adventure.quest.goal }}</template></strong
                >
            </label>
        </div>
        <progress
            v-if="!terminal"
            :id="progressId"
            class="journal-progress"
            :value="adventure.trophies"
            :max="adventure.quest.goal"
        />
        <template v-if="!terminal">
            <ol class="journal-steps">
                <li>Найдите враждебных слизней за пределами Новогорода.</li>
                <li>
                    После победы подойдите к телу слизня, повернитесь к нему и нажмите
                    <kbd>F</kbd>, чтобы обыскать его. Затем заберите сердце из окна добычи в рюкзак.
                </li>
                <li>
                    Принесите {{ adventure.quest.goal }} сердца Мире в здание гильдии Новогорода и
                    сдайте их по городскому заказу.
                </li>
            </ol>
            <p class="adventure-subtle">В счётчик входят только сердца в вашем рюкзаке.</p>
            <p v-if="adventure.quest.status === 'available'" class="adventure-subtle">
                Поговорите с Мирой, чтобы принять задание. Сердца можно собрать заранее.
            </p>
        </template>
        <p v-else-if="completed" class="adventure-success">
            Мира получила {{ adventure.quest.goal }} сердца. Награда выдана.
        </p>
        <p v-else class="adventure-subtle">{{ adventure.quest.notice }}</p>
        <p
            v-if="!cancelled && adventure.quest.status !== 'available'"
            class="adventure-subtle journal-statistic"
        >
            Личных побед над слизнями после принятия задания: {{ adventure.quest.kills }}.
        </p>
        <p v-if="adventure.wardRestored" class="adventure-success">
            Колокол памяти пробуждён. Городские мастерские и торговля работают.
        </p>
        <p
            v-else-if="adventure.cityState?.bellState === 'prepared' || completed"
            class="adventure-subtle"
        >
            Колокол подготовлен. Последний шаг — подойти к нему внутри часовни и пробудить.
        </p>
        <QuestRewardSummary
            v-if="!cancelled"
            :total="adventure.quest.rewardGold"
            :mode="adventure.quest.rewardMode"
            :shares="adventure.quest.rewardShares"
            :player-id="playerId"
            :completed="completed"
        />
        <GuildQuestCard
            v-if="party?.activeJob"
            :job="party.activeJob"
            :player-id="playerId"
            :can-act="Boolean(canAct)"
            :can-abandon="Boolean(canAbandon)"
            @command="emit('command', $event)"
        />
        <section v-if="adventure.craftOrders?.length" aria-label="Заказы ремесленникам">
            <h3>Заказы ремесленникам</h3>
            <p v-for="order in adventure.craftOrders" :key="order.id">
                <strong>{{ order.label }} — {{ craftOrderStatusLabels[order.status] }}</strong
                ><br />
                <small>{{ craftOrderPaymentText(order) }}</small>
            </p>
        </section>
    </section>
</template>
<style scoped>
.journal-hearts {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    font:
        13px/1.5 system-ui,
        sans-serif;
}
.journal-hearts img {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    flex: none;
}
.journal-hearts strong {
    white-space: nowrap;
    color: #f3d594;
}
.journal-progress {
    width: 100%;
    height: 8px;
    accent-color: #a4c07c;
    margin-top: 8px;
}
.journal-steps {
    padding-left: 20px;
    font:
        13px/1.5 system-ui,
        sans-serif;
}
.journal-steps li + li {
    margin-top: 8px;
}
.journal-statistic {
    font-size: 12px !important;
}
</style>
