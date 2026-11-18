<script setup lang="ts">
import './guildWindow.css'

import type {
    CharacterSnapshot,
    ClientMessage,
    GuildQuestDefinition,
    PartySnapshot,
    QuestRewardMode,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import GuildQuestCard from './GuildQuestCard.vue'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import QuestRewardChoice from './QuestRewardChoice.vue'

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
            !props.party.members.some((member) => member.id === character.id) &&
            !props.party.invitations.some(
                (invite) => invite.fromId === character.id || invite.toId === character.id
            )
    )
)
const clerk = computed(() => props.party.guildContact)
const canAbandon = computed(() => props.player.alive && leader.value)
const canUseBoard = computed(() => canAbandon.value && Boolean(clerk.value))
const selectedRewards = ref<Record<string, QuestRewardMode>>({})
function jobRequirement(job: GuildQuestDefinition): string {
    if (job.workRequest) return 'Передайте один трофей и дождитесь пробного рабочего рейса.'
    return job.id === 'survey_frontier'
        ? 'Засчитываются посещённые земли за пределами города.'
        : 'Засчитываются победы по принятому контракту. Сердца и другие предметы сдавать не нужно.'
}
function accept(job: GuildQuestDefinition): void {
    emit('command', {
        type: 'guild_accept',
        questId: job.id,
        rewardMode: selectedRewards.value[job.id] ?? 'party_equal',
    })
}
function canTake(job: GuildQuestDefinition): boolean {
    return canUseBoard.value && (!job.workRequest || job.workRequest.clerkId === clerk.value?.npcId)
}
</script>
<template>
    <section
        class="adventure-window adventure-guild game-frame-host"
        role="dialog"
        aria-modal="false"
        aria-label="Гильдия приключенцев"
    >
        <GameFrame variant="window" />
        <header class="adventure-window__header">
            <span>ГИЛЬДИЯ ПРИКЛЮЧЕНЦЕВ</span
            ><GameButton icon aria-label="Закрыть гильдию" @click="emit('close')">×</GameButton>
        </header>
        <p class="guild-intro">
            Найдите попутчиков, возьмите контракт и внесите свой вклад. Отряд вмещает до четырёх
            путешественников.
        </p>
        <section v-if="incoming.length" class="guild-invitations" aria-label="Приглашения в отряд">
            <article
                v-for="invitation in incoming"
                :key="invitation.id"
                class="guild-invitation game-frame-host"
            >
                <GameFrame variant="panel" />
                <p>{{ invitation.fromName }} приглашает в отряд.</p>
                <div>
                    <GameButton
                        @click="
                            emit('command', {
                                type: 'party_answer',
                                invitationId: invitation.id,
                                accept: true,
                            })
                        "
                    >
                        Принять</GameButton
                    ><GameButton
                        @click="
                            emit('command', {
                                type: 'party_answer',
                                invitationId: invitation.id,
                                accept: false,
                            })
                        "
                    >
                        Отказаться
                    </GameButton>
                </div>
            </article>
        </section>
        <section class="guild-party" aria-label="Ваш отряд">
            <div class="guild-section-heading">
                <h2>Ваш отряд · {{ party.members.length || 1 }}/4</h2>
                <GameButton v-if="party.partyId" @click="emit('command', { type: 'party_leave' })">
                    Покинуть
                </GameButton>
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
                    ><GameButton
                        :disabled="
                            !player.alive ||
                            party.members.length >= 4 ||
                            outgoing.some((invitation) => invitation.toId === candidate.id)
                        "
                        @click="emit('command', { type: 'party_invite', targetId: candidate.id })"
                    >
                        Пригласить
                    </GameButton>
                </div>
                <p v-if="!candidates.length" class="guild-muted">
                    Других игроков поблизости пока нет. Спутников-жителей зовите через «Спутники».
                </p>
            </details>
            <p v-for="invitation in outgoing" :key="invitation.id" class="guild-muted">
                Приглашение отправлено: {{ invitation.toName }}
            </p>
        </section>
        <GuildQuestCard
            v-if="party.activeJob"
            :job="party.activeJob"
            :player-id="player.id"
            :can-act="Boolean(canUseBoard)"
            :can-abandon="canAbandon"
            @command="emit('command', $event)"
        />
        <section class="guild-board" aria-label="Доска контрактов">
            <h2>Доска контрактов</h2>
            <p class="guild-muted">
                {{
                    clerk
                        ? `Представитель гильдии: ${clerk.nickname}`
                        : 'За контрактом и наградой подойдите к местному представителю гильдии.'
                }}
                {{ !leader ? 'Контракт выбирает лидер отряда.' : '' }}
            </p>
            <article v-for="job in party.jobs" :key="job.id" class="guild-job">
                <div>
                    <h3>{{ job.title }}</h3>
                    <p>{{ job.description }}</p>
                    <p class="guild-muted">{{ jobRequirement(job) }}</p>
                    <p
                        v-if="job.workRequest && job.workRequest.clerkId !== clerk?.npcId"
                        class="guild-muted"
                    >
                        Подойдите к распорядителю этого обращения.
                    </p>
                    <span>Общая награда: {{ job.rewardGold }} ◈</span>
                    <QuestRewardChoice
                        :model-value="selectedRewards[job.id] ?? 'party_equal'"
                        :disabled="
                            !canTake(job) ||
                            Boolean(party.activeJob && party.activeJob.status !== 'completed')
                        "
                        @update:model-value="selectedRewards[job.id] = $event"
                    />
                </div>
                <GameButton
                    variant="success"
                    :disabled="
                        !canTake(job) ||
                        (party.activeJob !== null && party.activeJob.status !== 'completed')
                    "
                    @click="accept(job)"
                >
                    Взять
                </GameButton>
            </article>
        </section>
    </section>
</template>
