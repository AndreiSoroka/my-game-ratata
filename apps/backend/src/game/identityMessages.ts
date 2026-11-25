import {
    type CharacterArchetype,
    heroClasses,
    isGameLocale,
    isPlayerResumeToken,
    type JoinClientMessage,
} from '@my-game-ratata/contracts'

import type { ParseResult } from './messages'

export function parseAbandonLife(record: Record<string, unknown>): ParseResult {
    return Object.keys(record).length === 1
        ? { message: { type: 'abandon_life' } }
        : { error: 'Abandon life does not accept a target or owner' }
}

export function parseLocale(record: Record<string, unknown>): ParseResult {
    const locale = record['locale']
    return isGameLocale(locale) && Object.keys(record).length === 2
        ? { message: { type: 'set_locale', locale } }
        : { error: 'Unsupported game language' }
}

export function parseJoin(record: Record<string, unknown>): ParseResult {
    if (Object.hasOwn(record, 'creatureType')) {
        return { error: 'Creature type is assigned by the server' }
    }
    const nickname = record['nickname']

    if (typeof nickname !== 'string' || nickname.trim().length === 0) {
        return { error: 'Nickname is required' }
    }
    const parsed = parseJoinOptions(record)
    if ('error' in parsed) {
        return parsed
    }
    const resume = parseResumeOptions(record)
    if ('error' in resume) {
        return resume
    }
    return {
        message: {
            nickname: nickname.trim().normalize('NFC').slice(0, 24),
            type: 'join',
            ...parsed.options,
            ...resume.options,
        },
    }
}

function parseJoinOptions(
    record: Record<string, unknown>
): { options: Partial<JoinClientMessage> } | { error: string } {
    const createOnly = record['createOnly']
    if (createOnly !== undefined && typeof createOnly !== 'boolean') {
        return { error: 'join.createOnly must be a boolean' }
    }

    const locale = record['locale']
    if (locale !== undefined && !isGameLocale(locale)) {
        return { error: 'Unsupported game language' }
    }

    const heroClass = heroClasses.find(
        (candidate) => candidate === record['heroClass']
    )
    if (record['heroClass'] !== undefined && heroClass === undefined) {
        return { error: 'Unknown hero class' }
    }
    const archetype = parseArchetype(record['archetype'])
    return {
        options: {
            ...(createOnly === undefined ? {} : { createOnly }),
            ...(heroClass === undefined ? {} : { heroClass }),
            ...(locale === undefined ? {} : { locale }),
            ...(archetype === undefined ? {} : { archetype }),
        },
    }
}

function parseResumeOptions(
    record: Record<string, unknown>
):
    | { options: Pick<JoinClientMessage, 'requestResumeToken' | 'resumeToken'> }
    | { error: string } {
    const requestResumeToken = record['requestResumeToken']
    if (
        requestResumeToken !== undefined &&
        typeof requestResumeToken !== 'boolean'
    ) {
        return { error: 'join.requestResumeToken must be a boolean' }
    }
    const resumeToken = record['resumeToken']
    if (resumeToken !== undefined && !isPlayerResumeToken(resumeToken)) {
        return { error: 'Invalid player resume token format' }
    }
    return {
        options: {
            ...(requestResumeToken === undefined ? {} : { requestResumeToken }),
            ...(resumeToken === undefined ? {} : { resumeToken }),
        },
    }
}

function parseArchetype(input: unknown): CharacterArchetype | undefined {
    if (input === 'human' || input === 'skeleton' || input === 'slime') {
        return input
    }

    return undefined
}
