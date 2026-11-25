<script setup lang="ts">
import type { PartySnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { characterName, tGame } from '@/shared/lib/i18n'
import { darkPanelButtonColors, GameBar, HudFrame, UiButton } from '@/shared/ui/common'

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
    <HudFrame
        v-if="party.partyId"
        class="party-panel"
        role="complementary"
        :aria-label="tGame('game.world.myParty')"
    >
        <div class="party-panel__content">
            <h2>
                {{ tGame('game.world.party') }} <span>{{ members.length }}/4</span>
            </h2>
            <div v-for="member in members" :key="member.id" class="party-member">
                <UiButton
                    class="party-member__button"
                    appearance="panel"
                    panel="panel-015"
                    size="compact"
                    :colors="darkPanelButtonColors"
                    :aria-pressed="selectedId === member.id"
                    :selected="selectedId === member.id"
                    @click="emit('select', member.id)"
                >
                    <span class="party-member__name">
                        <span
                            v-if="member.id === party.leaderId"
                            role="img"
                            :aria-label="tGame('game.world.leader')"
                        >
                            <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
                                <path
                                    fill="currentColor"
                                    d="M1 2L4 5L7 0L10 5L13 2L11 9H3ZM3 10H11V12H3Z"
                                />
                            </svg>
                        </span>
                        {{ characterName(member.id, member.nickname) }}
                    </span>
                    <small v-if="!member.alive">{{ tGame('game.world.waitingForRescue') }}</small>
                    <small v-else-if="!member.online">{{ tGame('game.world.offline') }}</small>
                    <small
                        v-else-if="currentLocationId && member.locationId !== currentLocationId"
                        >{{ tGame('game.world.anotherLocation') }}</small
                    >
                </UiButton>
                <GameBar
                    class="party-member__health"
                    :value="member.hpPercent"
                    :height="5"
                    color="var(--ui-dark-panel-positive)"
                    track-color="var(--ui-dark-panel-surface)"
                    :shadow="false"
                    aria-hidden="true"
                />
            </div>
            <UiButton
                size="compact"
                class="party-leave"
                :colors="darkPanelButtonColors"
                @click="emit('leave')"
            >
                {{ tGame('game.world.leaveParty') }}
            </UiButton>
        </div>
    </HudFrame>
</template>
<style scoped>
.party-panel__content {
    display: grid;
    gap: 5px;
    padding: 4px;
}
h2 {
    font-size: 12px;
    margin: 0 0 3px;
    display: flex;
    justify-content: space-between;
}
.party-member {
    position: relative;
    min-inline-size: 0;
}
.party-member__button {
    --ui-button-panel-padding: 4px 8px 13px;
    inline-size: 100%;
    text-align: start;
}
.party-member__button :deep(.ui-button__content) {
    flex: 1;
}
.party-leave {
    margin-top: 3px;
}
.party-member__name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
}
.party-member__health {
    position: absolute;
    inset-inline: 8px;
    inset-block-end: 5px;
    inline-size: auto;
    pointer-events: none;
}
small {
    font-size: 10px;
}
</style>
