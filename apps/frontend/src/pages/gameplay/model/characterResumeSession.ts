import { resolveBackendWebSocketUrl } from '@/shared/api'

const resumeTokenPattern = /^[A-Za-z0-9_-]{43}$/u

function nicknameKey(nickname: string): string {
    return nickname.trim().normalize('NFC').slice(0, 24).toLocaleLowerCase('en-US').normalize('NFC')
}

export function createCharacterResumeSession() {
    const scope = `ratata:character-resume:${encodeURIComponent(resolveBackendWebSocketUrl())}`
    const automaticKey = `${scope}:automatic`
    const browserStorage = getStorage('localStorage')
    const tabStorage = getStorage('sessionStorage')
    const canPersist = canWrite(browserStorage, scope) || canWrite(tabStorage, scope)
    const memory = new Map<string, string>()

    function tokenKey(nickname: string): string {
        return `${scope}:token:${nicknameKey(nickname)}`
    }

    function tokenFor(nickname: string): string | undefined {
        const key = tokenKey(nickname)
        for (const token of [memory.get(key), read(browserStorage, key), read(tabStorage, key)]) {
            if (token !== undefined && resumeTokenPattern.test(token)) return token
        }
    }

    function remember(nickname: string, token: string): void {
        if (!resumeTokenPattern.test(token)) return
        const key = tokenKey(nickname)
        memory.set(key, token)
        if (write(browserStorage, key, token)) write(tabStorage, key, undefined)
        else write(tabStorage, key, token)
        write(tabStorage, automaticKey, nickname)
    }

    function forget(nickname: string, token: string): void {
        const key = tokenKey(nickname)
        if (memory.get(key) === token) memory.delete(key)
        for (const storage of [browserStorage, tabStorage]) {
            if (read(storage, key) === token) write(storage, key, undefined)
        }
        const automatic = read(tabStorage, automaticKey)
        if (automatic && nicknameKey(automatic) === nicknameKey(nickname) && !tokenFor(automatic))
            pause()
    }

    function pause(): void {
        write(tabStorage, automaticKey, undefined)
    }

    function retire(nickname: string): void {
        const token = tokenFor(nickname)
        if (token) forget(nickname, token)
    }

    return {
        automatic: () => {
            const nickname = read(tabStorage, automaticKey)
            return nickname && tokenFor(nickname) ? nickname : undefined
        },
        canPersist,
        tokenFor,
        remember,
        forget,
        pause,
        retire,
    }
}

function getStorage(name: 'localStorage' | 'sessionStorage'): Storage | undefined {
    try {
        return window[name]
    } catch {
        return undefined
    }
}

function read(storage: Storage | undefined, key: string): string | undefined {
    try {
        return storage?.getItem(key) ?? undefined
    } catch {
        return undefined
    }
}

function write(storage: Storage | undefined, key: string, value: string | undefined): boolean {
    if (!storage) return false
    try {
        if (value === undefined) storage.removeItem(key)
        else storage.setItem(key, value)
        return true
    } catch {
        return false
    }
}

function canWrite(storage: Storage | undefined, scope: string): boolean {
    const key = `${scope}:probe`
    if (!write(storage, key, '')) return false
    write(storage, key, undefined)
    return true
}
