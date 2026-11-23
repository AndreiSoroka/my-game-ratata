import {
    type AbilityClientMessage,
    type AbilityId,
    abilityIds,
    type AshRiteId,
    isAshRiteId,
    isPrayerAction,
    type LearnAbilityId,
    type PrayerActionId,
} from '@my-game-ratata/contracts'

import { parseAshRite } from './ashRiteCommands'
import { parseCombatReference } from './combatTargetParsing'
import { isUtilitySpell } from './magicAbilities'
import {
    parsePrayerIntent,
    validAbilityTargetId as validId,
} from './prayerIntentParsing'

export function parseAbilityCommand(
    record: Record<string, unknown>
): AbilityClientMessage | undefined {
    const type = record['type']
    if (type === 'cancel_prayer' || type === 'cancel_magic') {
        return Object.keys(record).length === 1 ? { type } : undefined
    }
    const id = record['abilityId']
    if (typeof id !== 'string' || !abilityIds.includes(id as AbilityId)) {
        return undefined
    }
    if (type === 'learn_ability') {
        return parseLearnAbility(id, record['targetId'])
    }
    if (type !== 'use_ability') {
        return undefined
    }
    if (isPrayerAction(id)) {
        const intent = parsePrayerIntent(record['intent'])
        return intent === undefined
            ? undefined
            : { type: 'use_ability', abilityId: id, intent }
    }
    if (isAshRiteId(id)) {
        return parseAshRite(id, record)
    }
    return parseSpellReference(
        id as Exclude<AbilityId, PrayerActionId | AshRiteId>,
        record
    )
}

function parseLearnAbility(
    id: string,
    targetId: unknown
): AbilityClientMessage | undefined {
    const learnable: readonly string[] = [
        'pray',
        'pray_road',
        'pray_lantern',
        'pray_grave',
        'spark',
        'barrier',
        'shot',
    ]
    return learnable.includes(id) && validId(targetId)
        ? { type: 'learn_ability', abilityId: id as LearnAbilityId, targetId }
        : undefined
}

function parseSpellReference(
    id: Exclude<AbilityId, PrayerActionId | AshRiteId>,
    record: Record<string, unknown>
): AbilityClientMessage | undefined {
    const reference = parseCombatReference(record)
    if (
        reference === undefined ||
        (isUtilitySpell(id) && Object.keys(reference).length > 0) ||
        (id === 'sniper_shot' && reference.targetId === undefined)
    ) {
        return undefined
    }
    return {
        type: 'use_ability',
        abilityId: id,
        ...reference,
    }
}
