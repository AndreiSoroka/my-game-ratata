import {
    getWorldLocationDefinition,
    ITEM_DEFINITIONS,
    type QuestDraft,
    type QuestObjective,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { WORKER_SETTLEMENT_PROFILES } from './workerRequestData'

export interface QuestValidationEnvironment {
    getCharacter: (id: string) => GameCharacter | undefined
    navigationFor: (
        actor: Pick<GameCharacter, 'locationId'>
    ) => NavigationService
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max
}

function quantity(value: unknown): value is number {
    return (
        Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 100
    )
}

function point(value: unknown): boolean {
    return (
        value === undefined ||
        (record(value) &&
            Number.isFinite(value['x']) &&
            Number.isFinite(value['y']))
    )
}

function delivery(value: Record<string, unknown>): boolean {
    return (
        typeof value['itemId'] === 'string' &&
        Object.hasOwn(ITEM_DEFINITIONS, value['itemId']) &&
        quantity(value['quantity']) &&
        boundedString(value['recipientId'], 120)
    )
}

function objective(value: unknown): value is QuestObjective {
    if (!record(value)) {
        return false
    }
    switch (value['kind']) {
        case 'deliver':
            return delivery(value)
        case 'inspect':
            return (
                boundedString(value['targetId'], 120) &&
                (value['question'] === undefined ||
                    boundedString(value['question'], 300))
            )
        case 'defeat':
            return (
                ['slime', 'skeleton'].includes(String(value['archetype'])) &&
                quantity(value['quantity']) &&
                boundedString(value['locationId'], 120)
            )
        case 'visit':
            return (
                boundedString(value['locationId'], 120) &&
                point(value['position'])
            )
        default:
            return false
    }
}

export function parseQuestDraft(value: unknown): QuestDraft | undefined {
    const authored = parseAuthoredDraft(value)
    if (authored.handled) {
        return authored.draft
    }
    if (
        !record(value) ||
        !boundedString(value['title'], 100) ||
        !boundedString(value['description'], 1200) ||
        !objectives(value['objectives']) ||
        !Number.isSafeInteger(value['rewardGold']) ||
        Number(value['rewardGold']) < 0 ||
        Number(value['rewardGold']) > 300 ||
        !['personal', 'city'].includes(String(value['funding'])) ||
        !rewards(value['rewardItems'])
    ) {
        return undefined
    }
    return structuredClone(value) as unknown as QuestDraft
}

function objectives(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.length >= 1 &&
        value.length <= 4 &&
        value.every(objective)
    )
}

function rewards(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.length <= 10 &&
        value.every(
            (item: unknown) =>
                record(item) &&
                boundedString(item['instanceId'], 120) &&
                quantity(item['quantity'])
        )
    )
}

export function validateQuestDraft(
    issuer: GameCharacter,
    draft: QuestDraft,
    environment: QuestValidationEnvironment
): string | null {
    if (parseQuestDraft(draft) === undefined) {
        return 'Я пока не умею проверить такие условия задания.'
    }
    if (
        draft.funding === 'city' &&
        !WORKER_SETTLEMENT_PROFILES.some(
            (profile) =>
                profile.clerkId === issuer.id &&
                profile.cityId === issuer.locationId
        )
    ) {
        return 'У меня нет полномочий распоряжаться городским фондом.'
    }
    if (
        (draft.rewardGold > 0 || draft.rewardItems.length > 0) &&
        draft.objectives.every((entry) => entry.kind === 'visit')
    ) {
        return 'Оплачиваемое поручение требует полезного действия: разговора по делу, доставки или победы, а не одного посещения.'
    }
    for (const entry of draft.objectives) {
        const error = validateObjective(issuer, entry, environment)
        if (error !== null) {
            return error
        }
    }
    return null
}

function validateObjective(
    issuer: GameCharacter,
    entry: QuestObjective,
    environment: QuestValidationEnvironment
): string | null {
    if (entry.kind === 'deliver') {
        return entry.recipientId === issuer.id ||
            (entry.recipientId === `city:${issuer.locationId}` &&
                getWorldLocationDefinition(issuer.locationId)?.biome === 'city')
            ? null
            : 'Доставка должна идти заказчику или на настоящий городской склад.'
    }
    if (entry.kind === 'inspect') {
        const target = environment.getCharacter(entry.targetId)
        return target?.alive === true &&
            target.controllerKind !== 'network_player' &&
            target.id !== issuer.id &&
            target.soul.canSpeak
            ? null
            : 'Собеседник для получения сведений недоступен.'
    }
    return validateTravelObjective(issuer, entry, environment)
}

function validateTravelObjective(
    issuer: GameCharacter,
    entry: Extract<QuestObjective, { kind: 'visit' | 'defeat' }>,
    environment: QuestValidationEnvironment
): string | null {
    const location = getWorldLocationDefinition(entry.locationId)
    if (
        location === undefined ||
        (entry.kind === 'defeat' && location.dangerLevel === 0)
    ) {
        return 'Такой цели в доступном мире нет.'
    }
    if (entry.kind === 'visit' && entry.position !== undefined) {
        const navigation = environment.navigationFor({
            locationId: entry.locationId,
        })
        const clamped = navigation.clampWorld(entry.position)
        if (
            clamped.x !== entry.position.x ||
            clamped.y !== entry.position.y ||
            navigation.isSolidTile(navigation.worldToTile(entry.position))
        ) {
            return 'Указанная точка недоступна для посещения.'
        }
        if (!questPointReachable(issuer, entry, navigation)) {
            return 'К указанной точке нет доступного пути.'
        }
    }
    return null
}

function questPointReachable(
    issuer: GameCharacter,
    entry: Extract<QuestObjective, { kind: 'visit' }>,
    navigation: NavigationService
): boolean {
    const destination = entry.position
    if (destination === undefined) {
        return true
    }
    if (issuer.locationId === entry.locationId) {
        return navigation.findPathWorld(issuer.position, destination).length > 0
    }
    const { worldWidth, worldHeight } = navigation.summary
    const approaches = [
        { x: 0, y: worldHeight / 2 },
        { x: worldWidth, y: worldHeight / 2 },
        { x: worldWidth / 2, y: 0 },
        { x: worldWidth / 2, y: worldHeight },
    ]
    return approaches.some(
        (point) =>
            navigation.findPathWorld(navigation.clampWorld(point), destination)
                .length > 0
    )
}

function parseAuthoredDraft(value: unknown): {
    handled: boolean
    draft?: QuestDraft
} {
    if (!record(value) || value['authoredId'] === undefined) {
        return { handled: false }
    }
    if (!boundedString(value['authoredId'], 120)) {
        return { handled: true }
    }
    if (Object.keys(value).length !== 1) {
        return { handled: false }
    }
    return {
        handled: true,
        draft: {
            authoredId: value['authoredId'],
            title: 'Авторский заказ',
            description: 'Условия определяет сервер.',
            objectives: [],
            rewardGold: 0,
            rewardItems: [],
            funding: 'city',
        },
    }
}
