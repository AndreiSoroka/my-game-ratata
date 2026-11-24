<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, toRef } from 'vue'

import AdventurePanel from '@/game/ui/AdventurePanel.vue'
import { availableDialogueTargets, dialogueNeighbors } from '@/game/ui/dialogueNeighbors'
import type { DialogueSwitchContext } from '@/game/ui/useAppWindows'
import { useDialogueTargetSwitch } from '@/game/ui/useDialogueTargetSwitch'

const props = defineProps<{
    snapshot: WorldSnapshot
    characters: CharacterSnapshot[]
    player: CharacterSnapshot
    inventoryOpen: boolean
    targetSwitch: DialogueSwitchContext
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()

const neighbors = computed(() => {
    const { snapshot, player, characters, targetSwitch } = props
    const { dialogue, questBoard } = snapshot.adventure ?? {}
    if (
        !dialogue ||
        questBoard ||
        dialogue.kind === 'sign' ||
        dialogue.kind === 'quest_board' ||
        !player.alive ||
        player.life?.retired ||
        player.cooldowns.stunMsLeft > 0 ||
        targetSwitch.blocked()
    )
        return {}
    return dialogueNeighbors(
        snapshot,
        player,
        characters,
        `character:${dialogue.npcId}`,
        targetSwitch.isPositionVisible,
        targetSwitch.canSelectTarget
    )
})
const { pending, switchTarget } = useDialogueTargetSwitch({
    snapshot: toRef(() => props.snapshot),
    player: toRef(() => props.player),
    connected: () => props.targetSwitch.connected(),
    blockedByOtherWindow: () => props.targetSwitch.blocked(),
    neighbors: () => neighbors.value,
    isTargetAvailable(key) {
        const { snapshot, player, characters, targetSwitch } = props
        return availableDialogueTargets(
            snapshot,
            player,
            characters,
            targetSwitch.isPositionVisible,
            targetSwitch.canSelectTarget
        ).some((target) => target.key === key)
    },
    send: (command) => emit('command', command),
    openTarget: (key) => props.targetSwitch.openCharacterMenu(key.slice('character:'.length)),
})
</script>

<template>
    <AdventurePanel
        v-if="snapshot.adventure"
        :adventure="snapshot.adventure"
        :characters="characters"
        :inventory-open="inventoryOpen"
        :player="player"
        :server-time="snapshot.serverTime"
        :neighbors="neighbors"
        :switch-pending="pending"
        @switch-target="switchTarget"
        @command="emit('command', $event)"
    />
</template>
