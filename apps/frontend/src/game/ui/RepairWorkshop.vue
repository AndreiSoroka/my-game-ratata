<script setup lang="ts">
import type { ClientMessage, RepairSnapshot } from '@my-game-ratata/contracts'

import { itemName, tGame } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
const props = defineProps<{ repairs: RepairSnapshot; gold: number; blocked?: boolean }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
function repair(instanceIds: string[], expectedTotal: number): void {
    if (!instanceIds.length || props.blocked) return
    emit('command', {
        type: 'repair_items',
        npcId: props.repairs.npcId,
        instanceIds,
        expectedTotal,
        requestId: crypto.randomUUID(),
    })
}
</script>
<template>
    <section class="repair-workshop" :aria-label="tGame('game.trade.equipmentRepairs')">
        <p>
            {{ tGame('game.conversation.youHave') }} {{ gold }}
            {{ tGame('game.conversation.gold') }}
        </p>
        <p v-if="!repairs.items.length">{{ tGame('game.trade.allItemsAreInGood') }}</p>
        <div v-for="item in repairs.items" :key="item.instanceId" class="repair-row">
            <span
                >{{ itemName(item.itemId) }}
                <small
                    >{{ item.durability }} / {{ item.maxDurability
                    }}{{ item.equipped ? tGame('game.trade.equippedSuffix') : '' }}</small
                ></span
            >
            <GameButton
                variant="primary"
                data-dialogue-action
                :disabled="blocked || gold < item.price"
                @click="repair([item.instanceId], item.price)"
            >
                {{ tGame('game.trade.repair') }} {{ item.price }} ◈
            </GameButton>
        </div>
        <GameButton
            variant="primary"
            v-if="repairs.items.length"
            data-dialogue-action
            :disabled="blocked || gold < repairs.total"
            @click="
                repair(
                    repairs.items.map((item) => item.instanceId),
                    repairs.total
                )
            "
        >
            {{ tGame('game.trade.repairAll') }} {{ repairs.total }} ◈
        </GameButton>
    </section>
</template>
<style scoped>
.repair-workshop {
    display: grid;
    gap: 8px;
    max-height: 55vh;
    overflow: auto;
}
.repair-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}
small {
    display: block;
    opacity: 0.8;
}
</style>
