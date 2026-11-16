import type { WorldCombatTarget } from '@my-game-ratata/contracts'

export function parseWorldCombatTarget(
    value: unknown
): WorldCombatTarget | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined
    }
    const record = value as Record<string, unknown>
    return record['kind'] === 'grave' &&
        validCombatId(record['id']) &&
        Object.keys(record).every((key) => key === 'kind' || key === 'id')
        ? { kind: 'grave', id: record['id'] }
        : undefined
}

export function validCombatId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}

export function parseCombatReference(
    record: Record<string, unknown>
): { targetId?: string; target?: WorldCombatTarget } | undefined {
    if (record['target'] !== undefined) {
        const target = parseWorldCombatTarget(record['target'])
        return target !== undefined && record['targetId'] === undefined
            ? { target }
            : undefined
    }
    return record['targetId'] === undefined
        ? {}
        : validCombatId(record['targetId'])
          ? { targetId: record['targetId'] }
          : undefined
}
