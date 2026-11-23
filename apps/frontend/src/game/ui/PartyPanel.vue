<script setup lang="ts">
import type { PartySnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { characterName, tGame } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'

const props = defineProps<{
    party: PartySnapshot
    selectedId?: string
    currentLocationId?: string
}>()
const emit = defineEmits<{ select: [id: string]; leave: [] }>()
const members = computed(() =>
    [...props.party.members].sort(
        (a, b) => Number(b.id === props.party.leaderId) - Number(a.id === props.party.leaderId)
    )
)
</script>
<template>
    <aside
        v-if="party.partyId"
        class="party-panel rpg-panel game-frame-host"
        :aria-label="tGame('game.world.myParty')"
    >
        <GameFrame variant="panel" />
        <h2>
            {{ tGame('game.world.party') }} <span>{{ members.length }}/4</span>
        </h2>
        <GameButton
            v-for="member in members"
            :key="member.id"
            class="party-member"
            :aria-pressed="selectedId === member.id"
            @click="emit('select', member.id)"
        >
            <span class="party-member__name"
                ><span
                    v-if="member.id === party.leaderId"
                    role="img"
                    :aria-label="tGame('game.world.leader')"
                    ><svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
                        <path
                            fill="currentColor"
                            d="M1 2L4 5L7 0L10 5L13 2L11 9H3ZM3 10H11V12H3Z"
                        /></svg
                ></span>
                {{ characterName(member.id, member.nickname) }}</span
            >
            <span class="party-member__health">
                <span class="party-member__hp"
                    ><span :style="{ width: `${member.hpPercent}%` }"></span
                ></span>
            </span>
            <small v-if="!member.alive">{{ tGame('game.world.waitingForRescue') }}</small>
            <small v-else-if="!member.online">{{ tGame('game.world.offline') }}</small>
            <small v-else-if="currentLocationId && member.locationId !== currentLocationId">{{
                tGame('game.world.anotherLocation')
            }}</small>
        </GameButton>
        <GameButton size="compact" class="party-leave" @click="emit('leave')">
            {{ tGame('game.world.leaveParty') }}
        </GameButton>
    </aside>
</template>
<style scoped>
.party-panel {
    position: absolute;
    left: 14px;
    top: var(--game-hud-top, 14px);
    width: 220px;
    z-index: 4;
    padding: 10px;
    box-sizing: border-box;
}
h2 {
    font-size: 12px;
    margin: 0 0 8px;
    display: flex;
    justify-content: space-between;
}
.party-member {
    width: 100%;
    display: block;
    text-align: left;
    border: 1px solid transparent;
    padding: 7px;
    margin-top: 5px;
    cursor: pointer;
}
.party-member[aria-pressed='true'] {
    outline: 2px solid var(--rpg-focus);
}
.party-leave {
    margin-top: 8px;
}
.party-member__name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
}
.party-member__health {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
}
.party-member__hp {
    display: block;
    flex: 1;
    position: relative;
    background: #101710;
    height: 3px;
}
.party-member__hp > span {
    position: absolute;
    inset: 0 auto 0 0;
    background: #8daf72;
}
small {
    font-size: 10px;
}
@media (max-width: 740px) {
    .party-panel {
        width: 164px;
        left: 8px;
        padding: 6px;
    }
}
</style>
