import type { AbilityDefinition } from './abilities'
import { ASH_RULES } from './ash'
import { MOVEMENT_RULES } from './movement'

export const ashRiteIds = [
    'ash_raise',
    'ash_order',
    'ash_tame',
    'ash_exhaustion',
    'ash_gift',
    'ash_sacrifice',
    'ash_heart',
] as const

export type AshRiteId = (typeof ashRiteIds)[number]

export const skeletonOrders = [
    'guard',
    'protect',
    'wander',
    'hunt_slimes',
] as const

export type SkeletonOrder = (typeof skeletonOrders)[number]

export const SKELETON_ORDER_LABELS: Readonly<Record<SkeletonOrder, string>> = {
    guard: 'Охраняй место',
    protect: 'Защищай меня',
    wander: 'Броди',
    hunt_slimes: 'Бей слаймов',
}

export const ASH_RITE_RULES = {
    orderSlots: 3,
    giftXp: 70,
    sacrificeXp: 200,
    giftHpBonus: 0.1,
    sacrificeHpBonus: 0.2,
    remainsDurationMs: 120_000,
} as const

export type AshRiteMessage =
    | {
          type: 'use_ability'
          abilityId: Exclude<AshRiteId, 'ash_order'>
          targetId: string
      }
    | {
          type: 'use_ability'
          abilityId: 'ash_order'
          targetId: string
          order: SkeletonOrder
      }

export function isAshRiteId(value: unknown): value is AshRiteId {
    return ashRiteIds.some((id) => id === value)
}

export function isSkeletonOrder(value: unknown): value is SkeletonOrder {
    return skeletonOrders.some((id) => id === value)
}

export const ashRiteDefinitions = {
    ash_raise: {
        name: 'Подъём скелета',
        mana: ASH_RULES.raiseMana,
        energy: 0,
        cooldownMs: ASH_RULES.raiseCooldownMs,
        range: 48,
        windupMs: ASH_RULES.raiseWindupMs,
    },
    ash_order: {
        name: 'Приказ скелету',
        mana: 0,
        energy: 0,
        cooldownMs: 0,
        range: 80,
        windupMs: 0,
    },
    ash_tame: {
        name: 'Приручение скелетов',
        mana: 10,
        energy: 0,
        cooldownMs: 0,
        range: 48,
        windupMs: 2_000,
    },
    ash_exhaustion: {
        name: 'Тленный сгусток',
        mana: 12,
        energy: 0,
        cooldownMs: 10_000,
        range: ASH_RULES.exhaustion.rangeCells * MOVEMENT_RULES.stepDistance,
        windupMs: 2_000,
    },
    ash_gift: {
        name: 'Дар праха',
        mana: 0,
        energy: 0,
        cooldownMs: 0,
        range: 48,
        windupMs: 0,
    },
    ash_sacrifice: {
        name: 'Жертва праха',
        mana: 0,
        energy: 0,
        cooldownMs: 0,
        range: 48,
        windupMs: 0,
    },
    ash_heart: {
        name: 'Сердце лича',
        mana: 0,
        energy: 0,
        cooldownMs: 0,
        range: 48,
        windupMs: 0,
    },
} as const satisfies Record<AshRiteId, AbilityDefinition>
