<script setup lang="ts">
import type { ClientMessage, RepairSnapshot } from '@my-game-ratata/contracts'
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
    <section class="repair-workshop" aria-label="Ремонт снаряжения">
        <p>У вас {{ gold }} золотых</p>
        <p v-if="!repairs.items.length">Все вещи исправны.</p>
        <div v-for="item in repairs.items" :key="item.instanceId" class="repair-row">
            <span
                >{{ item.label }}
                <small
                    >{{ item.durability }} / {{ item.maxDurability
                    }}{{ item.equipped ? ' · надето' : '' }}</small
                ></span
            >
            <button
                type="button"
                data-dialogue-action
                :disabled="blocked || gold < item.price"
                @click="repair([item.instanceId], item.price)"
            >
                Починить · {{ item.price }} ◈
            </button>
        </div>
        <button
            v-if="repairs.items.length"
            type="button"
            data-dialogue-action
            :disabled="blocked || gold < repairs.total"
            @click="
                repair(
                    repairs.items.map((item) => item.instanceId),
                    repairs.total
                )
            "
        >
            Починить всё · {{ repairs.total }} ◈
        </button>
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
