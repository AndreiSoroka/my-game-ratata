<script setup lang="ts">
import {
    type CharacterSnapshot,
    type EquipmentSlotId,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame, weaponName } from '@/shared/lib/i18n'
import { ItemSlot } from '@/shared/ui/common'

import { itemAssetCatalog } from '../assets/itemCatalog'
import ItemCondition from './ItemCondition.vue'
import { itemStackLabel } from './itemLabels'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'

const props = defineProps<{ character: CharacterSnapshot }>()
const emit = defineEmits<{ unequip: [slot: EquipmentSlotId] }>()
const fallbackWeapon = computed(() =>
    resolveCombatWeapon(props.character.archetype, props.character.equipment.weapon)
)
const fallbackDescription = computed(() =>
    fallbackWeapon.value.kind === 'knife' ? tGame('game.character.knifeDescription') : undefined
)
const equipmentSlots: EquipmentSlotId[] = ['weapon', 'boots']
function unequip(slot: EquipmentSlotId): void {
    if (props.character.equipment[slot] !== undefined) emit('unequip', slot)
}
</script>

<template>
    <section
        class="inventory-overlay__equipment game-frame-host"
        :aria-label="tGame('game.character.equipment')"
    >
        <GameFrame variant="window" />
        <header class="inventory-overlay__header">
            <h2>{{ tGame('game.character.equipped') }}</h2>
        </header>

        <div class="equipment-slots">
            <GameButton
                v-for="slot in equipmentSlots"
                :key="slot"
                class="equipment-slot"
                type="button"
                :title="
                    slot === 'weapon'
                        ? (fallbackDescription ?? weaponName(fallbackWeapon.kind))
                        : undefined
                "
                :aria-description="slot === 'weapon' ? fallbackDescription : undefined"
                @click="unequip(slot)"
            >
                <span class="equipment-slot__label">{{
                    tGame(
                        slot === 'weapon' ? 'game.character.weaponSlot' : 'game.character.bootsSlot'
                    )
                }}</span>
                <ItemSlot class="equipment-slot__socket" :empty="!character.equipment[slot]">
                    <img
                        v-if="character.equipment[slot]"
                        class="item-icon"
                        :src="itemAssetCatalog[character.equipment[slot].itemId].src"
                        :alt="itemStackLabel(character.equipment[slot])"
                    />
                    <svg
                        v-else-if="slot === 'weapon' && fallbackWeapon.kind === 'knife'"
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
            </GameButton>
        </div>
    </section>
</template>
