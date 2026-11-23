import { type AbilityId, isFireSpell } from '@my-game-ratata/contracts'

import { abilityName, tGame } from '@/shared/lib/i18n'

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
        ? tGame('game.world.graveDestroyed')
        : undefined
}

export function magicUnavailable(id: AbilityId, props: HotbarProps): string | undefined {
    const graveReason = graveAbilityReason(id, props)
    if (graveReason) return graveReason
    const { player } = props
    const channel = player.abilities?.magicChannel
    if (channel && (id !== 'dispel_magic' || channel.abilityId !== 'chains'))
        return tGame('game.world.channelingSpell')
    if (id === 'blink' && player.abilities?.rootedUntil) return tGame('game.world.movementBound')
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
        abilityName(id),
        usage.manaFraction && usage.mana === 0
            ? tGame('game.knowledge.maximumMana', { percent: Math.round(usage.manaFraction * 100) })
            : `${usage.mana} MP`,
        usage.manaPerSecond ? tGame('game.world.manaPerSecond', { mana: usage.manaPerSecond }) : '',
        usage.durationMs
            ? tGame('game.world.secondsValue', { seconds: usage.durationMs / 1000 })
            : '',
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
                grave
                    ? tGame('game.world.selectedGrave')
                    : (target?.nickname ?? tGame('game.world.forward')),
                tGame('game.world.blastHitsAll'),
            ]
        case 'chains':
            return [tGame('game.world.bindsMovement')]
        case 'blink':
            return [tGame('game.world.blinkBackward')]
        case 'dispel_magic':
            return [tGame('game.world.dispelBothSides')]
        case 'city_portal':
            return [tGame('game.world.portalForEnemies')]
        case 'barrier':
            return []
    }
}
