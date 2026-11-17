import type {
    ExchangeClientMessage,
    ExchangeItemQuantity,
} from '@my-game-ratata/contracts'

export function parseExchangeCommand(
    record: Record<string, unknown>
): ExchangeClientMessage | undefined {
    if (record['type'] === 'exchange_invite') {
        return validId(record['targetId'])
            ? { type: 'exchange_invite', targetId: record['targetId'] }
            : undefined
    }
    const exchangeId = record['exchangeId']
    if (!validId(exchangeId)) {
        return undefined
    }
    switch (record['type']) {
        case 'exchange_cancel':
            return { type: 'exchange_cancel', exchangeId }
        case 'exchange_decline':
            return parseDecline(record, exchangeId)
        case 'exchange_answer':
            return typeof record['accept'] === 'boolean'
                ? {
                      type: 'exchange_answer',
                      exchangeId,
                      accept: record['accept'],
                  }
                : undefined
        case 'exchange_accept':
            return validInteger(record['revision'], 1)
                ? {
                      type: 'exchange_accept',
                      exchangeId,
                      revision: record['revision'],
                  }
                : undefined
        case 'exchange_offer':
            return parseOffer(record, exchangeId)
        default:
            return undefined
    }
}

function parseOffer(
    record: Record<string, unknown>,
    exchangeId: string
): ExchangeClientMessage | undefined {
    const revision = record['revision']
    const gold = record['gold']
    const rawItems = record['items']
    const requestId = record['requestId']
    if (
        !validInteger(revision, 1) ||
        !validInteger(gold, 0) ||
        !Array.isArray(rawItems) ||
        rawItems.length > 100 ||
        !validOptionalId(requestId)
    ) {
        return undefined
    }
    const items = parseItems(rawItems as unknown[])
    if (items === undefined) {
        return undefined
    }
    return new Set(items.map((item) => item.instanceId)).size === items.length
        ? {
              type: 'exchange_offer',
              exchangeId,
              revision,
              gold,
              items,
              ...(typeof requestId === 'string' ? { requestId } : {}),
          }
        : undefined
}

function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}
function validInteger(value: unknown, minimum: number): value is number {
    return (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= minimum
    )
}

function validOptionalId(value: unknown): boolean {
    return value === undefined || validId(value)
}

function parseDecline(
    record: Record<string, unknown>,
    exchangeId: string
): ExchangeClientMessage | undefined {
    const reason = record['reason'],
        revision = record['revision']
    return validInteger(revision, 1) &&
        typeof reason === 'string' &&
        reason.trim().length > 0
        ? {
              type: 'exchange_decline',
              exchangeId,
              revision,
              reason: reason.trim().slice(0, 400),
          }
        : undefined
}

function parseItems(rawItems: unknown[]): ExchangeItemQuantity[] | undefined {
    const items: ExchangeItemQuantity[] = []
    for (const rawItem of rawItems) {
        if (
            typeof rawItem !== 'object' ||
            rawItem === null ||
            Array.isArray(rawItem)
        ) {
            return undefined
        }
        const item = rawItem as Record<string, unknown>
        if (
            !validId(item['instanceId']) ||
            !validInteger(item['quantity'], 1)
        ) {
            return undefined
        }
        items.push({
            instanceId: item['instanceId'],
            quantity: item['quantity'],
        })
    }
    return items
}
