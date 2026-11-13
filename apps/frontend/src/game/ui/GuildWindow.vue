<script setup lang="ts">
import './guildWindow.css'

import type {
    CharacterSnapshot,
    ClientMessage,
    GuildParticipantSnapshot,
    GuildQuestId,
    PartySnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

const props = defineProps<{
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    party: PartySnapshot
}>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const incoming = computed(() =>
    props.party.invitations.filter((invitation) => invitation.toId === props.player.id)
)
const outgoing = computed(() =>
    props.party.invitations.filter((invitation) => invitation.fromId === props.player.id)
)
const leader = computed(
    () => props.party.leaderId === null || props.party.leaderId === props.player.id
)
const candidates = computed(() =>
    props.characters.filter(
        (character) =>
            character.id !== props.player.id &&
            character.alive &&
            character.controllerKind === 'network_player' &&
            Math.hypot(
                character.position.x - props.player.position.x,
                character.position.y - props.player.position.y
            ) <= 240 &&
            !props.party.members.some((member) => member.id === character.id)
    )
)
const clerk = computed(() =>
    props.characters.find(
        (character) =>
            character.alive &&
            (character.id === 'npc_friendly_girl_1' || character.id === 'npc_merchant_1') &&
            Math.hypot(
                character.position.x - props.player.position.x,
                character.position.y - props.player.position.y
            ) <= 64
    )
)
const canUseBoard = computed(() => props.player.alive && clerk.value !== undefined && leader.value)
const progressLabels: Record<GuildQuestId, string> = {
    slime_hunt: 'Побеждено враждебных слизней',
    skeleton_hunt: 'Побеждено скелетов',
    survey_frontier: 'Исследовано разных земель',
}
function contributionLabel(participant: GuildParticipantSnapshot): string {
    if (!participant.eligible) return 'Без награды за этот контракт'
    if (participant.contribution > 0) return 'Есть личный вклад'
    return props.party.activeJob?.status === 'active'
        ? 'Нужен личный вклад'
        : 'Без награды: нет личного вклада'
}
function jobRequirement(id: GuildQuestId): string {
    return id === 'survey_frontier'
        ? 'Засчитываются посещённые земли. Каждый участник должен сам выйти в разведку.'
        : 'Засчитываются победы по принятому контракту. Сердца и другие предметы сдавать не нужно.'
}
const jobStatuses = {
    active: 'Выполняется',
    ready: 'Можно получить награду',
    completed: 'Завершено',
}
</script>
<template>
    <section
        class="adventure-window adventure-guild"
        role="dialog"
        aria-modal="false"
        aria-label="Гильдия приключенцев"
    >
        <header class="adventure-window__header">
            <span>ГИЛЬДИЯ ПРИКЛЮЧЕНЦЕВ</span
            ><button type="button" aria-label="Закрыть гильдию" @click="emit('close')">×</button>
        </header>
        <p class="guild-intro">
            Найдите попутчиков, возьмите контракт и внесите свой вклад. Отряд вмещает до четырёх
            путешественников.
        </p>
        <section v-if="incoming.length" class="guild-invitations" aria-label="Приглашения в отряд">
            <article v-for="invitation in incoming" :key="invitation.id">
                <p>{{ invitation.fromName }} приглашает в отряд.</p>
                <div>
                    <button
                        type="button"
                        @click="
                            emit('command', {
                                type: 'party_answer',
                                invitationId: invitation.id,
                                accept: true,
                            })
                        "
                    >
                        Принять</button
                    ><button
                        type="button"
                        @click="
                            emit('command', {
                                type: 'party_answer',
                                invitationId: invitation.id,
                                accept: false,
                            })
                        "
                    >
                        Отказаться
                    </button>
                </div>
            </article>
        </section>
        <section class="guild-party" aria-label="Ваш отряд">
            <div class="guild-section-heading">
                <h2>Ваш отряд · {{ party.members.length || 1 }}/4</h2>
                <button
                    v-if="party.partyId"
                    type="button"
                    @click="emit('command', { type: 'party_leave' })"
                >
                    Покинуть
                </button>
            </div>
            <p v-if="!party.partyId" class="guild-muted">
                Вы путешествуете самостоятельно. Контракт можно взять и одному.
            </p>
            <ul v-else class="guild-members">
                <li v-for="member in party.members" :key="member.id">
                    <strong
                        >{{ member.nickname }}
                        <span v-if="member.id === party.leaderId">· лидер</span></strong
                    ><span
                        >{{
                            !member.online
                                ? 'Не в сети'
                                : member.alive
                                  ? 'В пути'
                                  : 'Ожидает спасения'
                        }}
                        · {{ member.locationId }}</span
                    >
                </li>
            </ul>
            <details v-if="leader" class="guild-recruit">
                <summary>Пригласить путешественника</summary>
                <div v-for="candidate in candidates" :key="candidate.id" class="guild-candidate">
                    <span>{{ candidate.nickname }}</span
                    ><button
                        type="button"
                        :disabled="
                            !player.alive ||
                            party.members.length >= 4 ||
                            outgoing.some((invitation) => invitation.toId === candidate.id)
                        "
                        @click="emit('command', { type: 'party_invite', targetId: candidate.id })"
                    >
                        Пригласить
                    </button>
                </div>
                <p v-if="!candidates.length" class="guild-muted">
                    Других игроков поблизости пока нет. Спутников-жителей зовите через «Спутники».
                </p>
            </details>
            <p v-for="invitation in outgoing" :key="invitation.id" class="guild-muted">
                Приглашение отправлено: {{ invitation.toName }}
            </p>
        </section>
        <section v-if="party.activeJob" class="guild-active" aria-label="Общий контракт">
            <span class="guild-eyebrow">{{ jobStatuses[party.activeJob.status] }}</span>
            <h2>{{ party.activeJob.title }}</h2>
            <p>{{ party.activeJob.description }}</p>
            <p class="guild-muted">{{ jobRequirement(party.activeJob.id) }}</p>
            <label for="guild-progress"
                >{{ progressLabels[party.activeJob.id] }}: {{ party.activeJob.progress }} /
                {{ party.activeJob.goal }}</label
            ><progress
                id="guild-progress"
                :value="party.activeJob.progress"
                :max="party.activeJob.goal"
            />
            <ul class="guild-contributions">
                <li v-for="participant in party.activeJob.participants" :key="participant.id">
                    <span>{{ participant.nickname }}</span
                    ><strong
                        >{{ participant.contribution }} ·
                        {{ contributionLabel(participant) }}</strong
                    >
                </li>
            </ul>
            <div class="guild-reward">
                <span>Награда: {{ party.activeJob.rewardGold }} ◈</span
                ><button
                    v-if="party.activeJob.status === 'ready'"
                    type="button"
                    :disabled="!canUseBoard"
                    @click="emit('command', { type: 'guild_turn_in' })"
                >
                    Сдать контракт
                </button>
            </div>
        </section>
        <section class="guild-board" aria-label="Доска контрактов">
            <h2>Доска контрактов</h2>
            <p class="guild-muted">
                {{
                    clerk
                        ? `Представитель гильдии: ${clerk.nickname}`
                        : 'За контрактом и наградой подойдите к Мире или Савве.'
                }}
                {{ !leader ? 'Контракт выбирает лидер отряда.' : '' }}
            </p>
            <article v-for="job in party.jobs" :key="job.id" class="guild-job">
                <div>
                    <h3>{{ job.title }}</h3>
                    <p>{{ job.description }}</p>
                    <p class="guild-muted">{{ jobRequirement(job.id) }}</p>
                    <span>{{ job.rewardGold }} ◈ · цель {{ job.goal }}</span>
                </div>
                <button
                    type="button"
                    :disabled="
                        !canUseBoard ||
                        (party.activeJob !== null && party.activeJob.status !== 'completed')
                    "
                    @click="emit('command', { type: 'guild_accept', questId: job.id })"
                >
                    Взять
                </button>
            </article>
        </section>
    </section>
</template>
