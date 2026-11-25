import {
    type ClientMessage,
    type EquipmentActionKind,
    type EquipmentSlotId,
    equipmentSlotIds,
    type InventoryActionKind,
    type Vector2,
} from '@my-game-ratata/contracts'

import { parseControlCommand } from './characterControl'
import { isChestCommandType, parseChestCommand } from './chestCommands'
import { parseCombatReference } from './combatTargetParsing'
import { parseExtraCommand } from './extraCommands'
import { parseAbandonLife, parseJoin, parseLocale } from './identityMessages'
import { parseMotionPing } from './motionProbe'
import { parseStopCorrection } from './movementInputCommand'
import { parsePortalBoundary } from './portalCommand'
import {
    isAutomationCommand,
    parseAutomationBoundary,
} from './scenarioCommands'
import { parseViewportCommand } from './viewportCommand'
import { parseSocialBoundary } from './whisperCommands'
import { parsePickupCommand } from './worldPickup'

export interface ParseResult {
    error?: string
    message?: ClientMessage
    invalidStopCorrectionId?: number
}

export function readSocketMessage(raw: unknown): string | undefined {
    if (typeof raw === 'string') {
        return raw
    }

    if (raw instanceof ArrayBuffer) {
        return Buffer.from(raw).toString('utf-8')
    }

    if (ArrayBuffer.isView(raw)) {
        return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
            'utf-8'
        )
    }

    return undefined
}

export function parseClientMessage(
    raw: string,
    hasLocation?: (id: string) => boolean
): ParseResult {
    let input: unknown

    try {
        input = JSON.parse(raw) as unknown
    } catch {
        return { error: 'Invalid JSON' }
    }

    const record = asRecord(input)

    if (record === undefined) {
        return { error: 'Message must be an object' }
    }
    const location = parseLocationBoundary(record, hasLocation)
    if (location !== undefined) {
        return location
    }
    if (record['type'] === 'set_personal_hostility') {
        return parsePersonalHostility(record)
    }
    const social = parseSocialBoundary(record)
    if (social !== undefined) {
        return social
    }

    if (isAutomationCommand(record['type'])) {
        return parseAutomationBoundary(record)
    }

    if (isChestCommandType(record['type'])) {
        const message = parseChestCommand(record)
        return message === undefined
            ? { error: 'Invalid chest command' }
            : { message }
    }
    if (
        ['auto_action', 'auto_attack', 'follow', 'cancel_control'].includes(
            String(record['type'])
        )
    ) {
        const message = parseControlCommand(record)
        return message !== undefined
            ? { message }
            : { error: 'Invalid automatic control command' }
    }
    return parseRecord(record)
}

function parseLocationBoundary(
    record: Record<string, unknown>,
    hasLocation?: (id: string) => boolean
): ParseResult | undefined {
    switch (record['type']) {
        case 'use_portal':
            return parsePortalBoundary(record)
        case 'set_viewport':
            return parseViewportCommand(record, hasLocation)
        case 'snapshot_resync':
            return { message: { type: 'snapshot_resync' } }
        case 'motion_ping':
            return parseMotionPing(record['id'])
        default:
            return undefined
    }
}

function parseRecord(record: Record<string, unknown>): ParseResult {
    switch (record['type']) {
        case 'join':
            return parseJoin(record)
        case 'set_locale':
            return parseLocale(record)
        case 'move_input':
            return parseMoveInput(record)
        case 'move_to':
            return parseMoveTo(record)
        case 'attack':
            return parseAttack(record)
        case 'pickup_item': {
            const message = parsePickupCommand(record)
            return message === undefined
                ? { error: 'Invalid pickup target' }
                : { message }
        }
        case 'inventory_action':
            return parseInventoryAction(record)
        case 'equipment_action':
            return parseEquipmentAction(record)
        case 'chat':
            return parseChat(record)
        case 'abandon_life':
            return parseAbandonLife(record)
        default:
            return parseExtraCommand(record)
    }
}

function parsePersonalHostility(record: Record<string, unknown>): ParseResult {
    const targetId = record['targetId']
    const hostile = record['hostile']
    return typeof targetId === 'string' &&
        targetId.length > 0 &&
        targetId.length <= 100 &&
        typeof hostile === 'boolean'
        ? { message: { type: 'set_personal_hostility', targetId, hostile } }
        : { error: 'Invalid personal hostility command' }
}

function parseMoveInput(record: Record<string, unknown>): ParseResult {
    const axis = parseVector(record['axis'])

    if (axis === undefined) {
        return { error: 'move_input.axis must be a vector' }
    }

    const message = { axis, type: 'move_input' as const }
    if (axis.x !== 0 || axis.y !== 0) {
        return { message }
    }
    return parseStopCorrection(
        message,
        asRecord(record['stopCorrection']),
        parseVector
    )
}

function parseMoveTo(record: Record<string, unknown>): ParseResult {
    const target = parseVector(record['target'])

    if (target === undefined) {
        return { error: 'move_to.target must be a vector' }
    }

    if (
        record['append'] !== undefined &&
        typeof record['append'] !== 'boolean'
    ) {
        return { error: 'move_to.append must be a boolean' }
    }

    return {
        message: {
            target,
            type: 'move_to',
            ...(record['append'] === undefined
                ? {}
                : { append: record['append'] }),
        },
    }
}

function parseChat(record: Record<string, unknown>): ParseResult {
    const text = record['text']

    if (typeof text !== 'string') {
        return { error: 'chat.text must be a string' }
    }

    const trimmed = text.trim().slice(0, 400)

    if (trimmed.length === 0) {
        return { error: 'chat.text is required' }
    }

    const targetId = record['targetId']
    const focusKey = record['focusKey']
    if (
        focusKey !== undefined &&
        (typeof focusKey !== 'string' || focusKey.length > 180)
    ) {
        return { error: 'Invalid speech focus' }
    }
    if (
        targetId !== undefined &&
        (typeof targetId !== 'string' || targetId.length > 100)
    ) {
        return { error: 'Invalid speech target hint' }
    }
    return {
        message: {
            text: trimmed,
            type: 'chat',
            ...(focusKey === undefined ? {} : { focusKey }),
            ...(targetId === undefined ? {} : { targetId }),
        },
    }
}

function parseInventoryAction(record: Record<string, unknown>): ParseResult {
    const action = parseInventoryActionKind(record['action'])
    const itemInstanceId = record['itemInstanceId']

    if (action === undefined) {
        return { error: 'inventory_action.action is invalid' }
    }

    if (typeof itemInstanceId !== 'string' || itemInstanceId.length === 0) {
        return { error: 'inventory_action.itemInstanceId is required' }
    }

    return {
        message: {
            action,
            itemInstanceId,
            type: 'inventory_action',
        },
    }
}

function parseEquipmentAction(record: Record<string, unknown>): ParseResult {
    const action = parseEquipmentActionKind(record['action'])
    const slot = parseEquipmentSlot(record['slot'])

    if (action === undefined) {
        return { error: 'equipment_action.action is invalid' }
    }

    if (slot === undefined) {
        return { error: 'equipment_action.slot is invalid' }
    }

    return {
        message: {
            action,
            slot,
            type: 'equipment_action',
        },
    }
}

function parseVector(input: unknown): Vector2 | undefined {
    const record = asRecord(input)

    if (record === undefined) {
        return undefined
    }

    const x = record['x']
    const y = record['y']

    if (typeof x !== 'number' || typeof y !== 'number') {
        return undefined
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return undefined
    }

    return { x, y }
}

function parseInventoryActionKind(
    input: unknown
): InventoryActionKind | undefined {
    if (
        input === 'drop' ||
        input === 'eat' ||
        input === 'equip' ||
        input === 'stash'
    ) {
        return input
    }

    return undefined
}

function parseEquipmentActionKind(
    input: unknown
): EquipmentActionKind | undefined {
    return input === 'unequip' ? input : undefined
}

function parseEquipmentSlot(input: unknown): EquipmentSlotId | undefined {
    return equipmentSlotIds.find((slot) => slot === input)
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return undefined
    }

    return input as Record<string, unknown>
}

function parseAttack(record: Record<string, unknown>): ParseResult {
    const reference = parseCombatReference(record)
    return reference !== undefined
        ? { message: { type: 'attack', ...reference } }
        : { error: 'Invalid attack target' }
}
