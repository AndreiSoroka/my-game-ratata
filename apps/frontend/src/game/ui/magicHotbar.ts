import { ABILITY_DEFINITIONS, type AbilityId, isFireSpell } from '@my-game-ratata/contracts'

import { abilityUsage } from './abilityUsage'
import type { HotbarEmit, HotbarProps } from './hotbarActions'
import type { HotbarBinding } from './hotbarBindings'
import type { createGestures } from './hotbarGestures'

type ManualMagicId = Extract<
    AbilityId,
    | 'fireball'
    | 'greater_fireball'
    | 'barrier'
    | 'chains'
    | 'blink'
    | 'dispel_magic'
    | 'city_portal'
>

export function isManualMagic(id: AbilityId): id is ManualMagicId {
    return (
        isFireSpell(id) ||
        id === 'barrier' ||
        id === 'chains' ||
        id === 'blink' ||
        id === 'dispel_magic' ||
        id === 'city_portal'
    )
}

function graveAbilityReason(id: AbilityId, props: HotbarProps): string | undefined {
    return props.grave?.phase === 'ruined' &&
        id !== 'defensive_stance' &&
        (!isManualMagic(id) || isFireSpell(id))
        ? 'Могила разрушена'
        : undefined
}

export function magicUnavailable(id: AbilityId, props: HotbarProps): string | undefined {
    const graveReason = graveAbilityReason(id, props)
    if (graveReason) return graveReason
    const { player } = props
    const channel = player.abilities?.magicChannel
    if (channel && (id !== 'dispel_magic' || channel.abilityId !== 'chains'))
        return 'Поддерживается заклинание'
    if (id === 'blink' && player.abilities?.rootedUntil) return 'Движение сковано'
    return undefined
}

export function activateMagic(
    binding: HotbarBinding,
    props: HotbarProps,
    known: AbilityId[],
    unavailable: (binding: HotbarBinding) => string | undefined,
    gestures: ReturnType<typeof createGestures>,
    emit: HotbarEmit
): boolean {
    if (binding.kind !== 'ability' || !isManualMagic(binding.id)) return false
    if (!known.includes(binding.id) || unavailable(binding)) return true
    gestures.reset()
    emit('command', {
        type: 'use_ability',
        abilityId: binding.id,
        ...fireSpellTarget(binding.id, props),
    })
    return true
}

function fireSpellTarget(id: ManualMagicId, { grave, target }: HotbarProps) {
    if (!isFireSpell(id)) return undefined
    if (grave) return { target: { kind: 'grave' as const, id: grave.id } }
    return target ? { targetId: target.id } : undefined
}

export function magicActionTooltip(
    binding: HotbarBinding | null,
    props: HotbarProps
): string | undefined {
    if (binding?.kind !== 'ability' || !isManualMagic(binding.id)) return undefined
    const id = binding.id
    const usage = abilityUsage(props.player, id)
    return [
        ABILITY_DEFINITIONS[id].name,
        usage.manaFraction && usage.mana === 0
            ? `${Math.round(usage.manaFraction * 100)}% максимальной маны`
            : `${usage.mana} MP`,
        usage.manaPerSecond ? `${usage.manaPerSecond} MP/с` : '',
        usage.durationMs ? `${usage.durationMs / 1000} с` : '',
        ...magicNotes(id, props),
    ]
        .filter(Boolean)
        .join(' · ')
}

function magicNotes(id: ManualMagicId, { grave, target }: HotbarProps): string[] {
    switch (id) {
        case 'fireball':
        case 'greater_fireball':
            return [
                grave ? 'В выбранную могилу' : (target?.nickname ?? 'Вперёд'),
                'Взрыв задевает всех в радиусе, включая союзников и вас',
            ]
        case 'chains':
            return ['Сковывает движение в круге']
        case 'blink':
            return ['Смещение назад']
        case 'dispel_magic':
            return ['Снимает Барьеры и Оковы обеих сторон']
        case 'city_portal':
            return ['Проход доступен и врагам']
        case 'barrier':
            return []
    }
}
