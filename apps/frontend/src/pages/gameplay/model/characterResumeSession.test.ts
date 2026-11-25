import { beforeEach, expect, it, vi } from 'vitest'

import { createCharacterResumeSession } from './characterResumeSession'

const firstToken = 'A'.repeat(43)
const secondToken = 'B'.repeat(43)

beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
})

it('keeps browser credentials across tabs but only auto-enters the active tab', () => {
    const first = createCharacterResumeSession()
    expect(first.canPersist).toBe(true)
    first.remember('Милава', firstToken)
    first.remember('Ждан', secondToken)
    expect(createCharacterResumeSession().automatic()).toBe('Ждан')
    first.pause()
    expect(createCharacterResumeSession().automatic()).toBeUndefined()

    sessionStorage.clear()
    const next = createCharacterResumeSession()
    expect(next.tokenFor('  МИЛАВА  ')).toBe(firstToken)
    expect(next.tokenFor('Ждан')).toBe(secondToken)
    expect(next.automatic()).toBeUndefined()
    next.retire('Ждан')
    expect(next.tokenFor('Ждан')).toBeUndefined()
    expect(next.tokenFor('Милава')).toBe(firstToken)
})

it('isolates credentials by backend and removes only an exactly rejected token', () => {
    vi.stubEnv('VITE_BACKEND_WS_URL', 'wss://first.example.test/ws')
    const first = createCharacterResumeSession()
    first.remember('Милава', firstToken)
    first.forget('Милава', secondToken)
    expect(first.automatic()).toBe('Милава')

    vi.stubEnv('VITE_BACKEND_WS_URL', 'wss://second.example.test/ws')
    const second = createCharacterResumeSession()
    expect(second.automatic()).toBeUndefined()
    expect(second.tokenFor('Милава')).toBeUndefined()

    first.forget('Милава', firstToken)
    expect(first.automatic()).toBeUndefined()
    expect(first.tokenFor('Милава')).toBeUndefined()
})

it('uses tab storage when browser storage rejects writes and can detect no writable storage', () => {
    const previous = Storage.prototype.setItem
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key,
        value
    ) {
        if (this === localStorage) throw new Error('Storage blocked')
        previous.call(this, key, value)
    })
    const session = createCharacterResumeSession()
    expect(session.canPersist).toBe(true)
    session.remember('Милава', firstToken)
    expect(createCharacterResumeSession().tokenFor('Милава')).toBe(firstToken)
    expect(createCharacterResumeSession().automatic()).toBe('Милава')

    blocked.mockImplementation(() => {
        throw new Error('Storage blocked')
    })
    expect(createCharacterResumeSession().canPersist).toBe(false)
})
