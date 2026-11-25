<script setup lang="ts">
import {
    type CharacterSnapshot,
    type EquipmentSlotId,
    equipmentSlotIds,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame, weaponName } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { ItemSlot } from '@/shared/ui/common'
import { UiButton } from '@/shared/ui/common'
import { UiFrame } from '@/shared/ui/common'

import { itemStackLabel } from '../model/itemLabels'
import ItemCondition from './ItemCondition.vue'

const props = defineProps<{ character: Pick<CharacterSnapshot, 'archetype' | 'equipment'> }>()
const emit = defineEmits<{ unequip: [slot: EquipmentSlotId] }>()
const fallbackWeapon = computed(() =>
    resolveCombatWeapon(props.character.archetype, props.character.equipment.weapon)
)
const fallbackDescription = computed(() =>
    fallbackWeapon.value.kind === 'knife' ? tGame('game.character.knifeDescription') : undefined
)
const equipmentSlotLabels = {
    weapon: 'game.character.weaponSlot',
    boots: 'game.character.bootsSlot',
    light: 'game.character.lightSlot',
} as const
function unequip(slot: EquipmentSlotId): void {
    if (props.character.equipment[slot] !== undefined) emit('unequip', slot)
}
</script>

<template>
    <section
        class="inventory-overlay__equipment game-frame-host"
        :aria-label="tGame('game.character.equipment')"
    >
        <UiFrame variant="window" />
        <header class="inventory-overlay__header">
            <h2>{{ tGame('game.character.equipped') }}</h2>
        </header>

        <div class="equipment-slots">
            <UiButton
                size="small"
                v-for="slot in equipmentSlotIds"
                :key="slot"
                class="equipment-slot"
                :data-equipment-slot="slot"
                type="button"
                :title="
                    slot === 'weapon'
                        ? (fallbackDescription ?? weaponName(fallbackWeapon.kind))
                        : undefined
                "
                :aria-description="slot === 'weapon' ? fallbackDescription : undefined"
                @click="unequip(slot)"
            >
                <span class="equipment-slot__label">{{ tGame(equipmentSlotLabels[slot]) }}</span>
                <ItemSlot
                    class="equipment-slot__socket"
                    :empty="!character.equipment[slot]"
                    :src="
                        character.equipment[slot] &&
                        itemAssetCatalog[character.equipment[slot].itemId].src
                    "
                    :alt="character.equipment[slot] && itemStackLabel(character.equipment[slot])"
                >
                    <svg
                        v-if="
                            !character.equipment[slot] &&
                            slot === 'weapon' &&
                            fallbackWeapon.kind === 'knife'
                        "
                        viewBox="0 0 32 32"
                        width="32"
                        height="32"
                        role="img"
                        :aria-label="tGame('game.character.backupKnife')"
                    >
                        <path
                            d="M25 3 27 5 16 21 12 17Z"
                            fill="#c7d3d3"
                            stroke="#4f686b"
                            stroke-width="2"
                        />
                        <path
                            d="m12 17 4 4-8 8-4-4Z"
                            fill="#91643e"
                            stroke="#352a22"
                            stroke-width="2"
                        />
                        <path d="m10 17 7 7" stroke="#d4ba76" stroke-width="3" />
                    </svg>
                </ItemSlot>
                <ItemCondition v-if="character.equipment[slot]" :item="character.equipment[slot]" />
            </UiButton>
        </div>
    </section>
</template>

<style scoped>
.inventory-overlay__equipment {
    position: relative;
    padding: 10px;
    border: 2px solid transparent;
    color: var(--ui-dark-panel-text);
}
.inventory-overlay__header {
    display: flex;
    min-height: 28px;
    align-items: center;
    margin-bottom: 8px;
}
.inventory-overlay__header h2 {
    margin: 0;
    color: var(--ui-dark-panel-title);
    font:
        800 16px/1.4 var(--ratata-font-family),
        sans-serif;
}
.equipment-slots {
    display: grid;
    gap: 8px;
}
.equipment-slot {
    justify-content: stretch;
    min-height: 48px;
    padding: 4px 6px;
}
.equipment-slot :deep(.ui-button__content) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    gap: 8px;
    align-items: center;
    inline-size: 100%;
}
.equipment-slot__label {
    font-size: 12px;
    font-weight: 800;
    text-align: left;
}
.equipment-slot__socket {
    --ui-item-slot-size: 38px;
    --ui-item-slot-image-size: 24px;
}
</style>
