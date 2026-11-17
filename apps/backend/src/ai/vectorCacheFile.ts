import { randomUUID } from 'node:crypto'
import {
    mkdir,
    open,
    readdir,
    rename,
    rmdir,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface CacheLockOptions {
    attempts?: number
    wait?: () => Promise<void>
}

const ownerPattern =
    /^([1-9]\d*)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/u

/** Unique marker paths are never reused by cooperative writers. */
async function removeMarker(path: string): Promise<void> {
    try {
        await unlink(path)
    } catch (error) {
        if (code(error) !== 'ENOENT' && code(error) !== 'ENOTDIR') {
            throw error
        }
    }
}

/** The kernel refuses to remove a replacement directory containing a live owner. */
async function removeEmptyLock(path: string): Promise<void> {
    try {
        await rmdir(path)
    } catch (error) {
        if (
            !['ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOTDIR'].includes(
                code(error) ?? ''
            )
        ) {
            throw error
        }
    }
}

function ownerIsDead(name: string): boolean {
    const match = ownerPattern.exec(name)
    const pid = match?.[1] === undefined ? undefined : Number(match[1])
    if (pid === undefined || !Number.isSafeInteger(pid)) {
        return false
    }
    try {
        process.kill(pid, 0)
        return false
    } catch (error) {
        return code(error) === 'ESRCH'
    }
}

/** Never unlink the shared pathname: stale cleanup only removes dead unique markers. */
async function reclaimStaleDirectory(path: string): Promise<void> {
    try {
        const entries = await readdir(path, { withFileTypes: true })
        if (entries.length === 0) {
            if (Date.now() - (await stat(path)).mtimeMs > 60_000) {
                await removeEmptyLock(path)
            }
            return
        }
        for (const entry of entries) {
            if (entry.isFile() && ownerIsDead(entry.name)) {
                await removeMarker(join(path, entry.name))
            }
        }
        await removeEmptyLock(path)
    } catch (error) {
        if (code(error) !== 'ENOENT') {
            throw error
        }
    }
}

async function createOwner(path: string): Promise<void> {
    const handle = await open(path, 'wx', 0o600)
    try {
        try {
            await handle.writeFile(JSON.stringify({ pid: process.pid }))
        } finally {
            await handle.close()
        }
    } catch (error) {
        await removeMarker(path)
        throw error
    }
}

export async function withVectorCacheLock<T>(
    path: string,
    work: () => Promise<T>,
    options: CacheLockOptions
): Promise<T> {
    await mkdir(dirname(path), { recursive: true })
    const lock = `${path}.lock`
    const wait =
        options.wait ??
        (() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
    for (let attempt = 0; attempt < (options.attempts ?? 50); attempt++) {
        try {
            await mkdir(lock, { mode: 0o700 })
        } catch (error) {
            if (code(error) !== 'EEXIST') {
                throw error
            }
            await reclaimStaleDirectory(lock)
            await wait()
            continue
        }
        const owner = `${String(process.pid)}-${randomUUID()}.json`
        const marker = join(lock, owner)
        let initialized = false
        let working = false
        try {
            await createOwner(marker)
            initialized = true
            const names = await readdir(lock)
            if (names.length === 1 && names[0] === owner) {
                working = true
                return await work()
            }
        } catch (error) {
            if (working || code(error) !== 'ENOENT') {
                throw error
            }
            // Stale cleanup may remove a replaced empty directory before initialization.
        } finally {
            if (initialized) {
                await removeMarker(marker)
            }
            await removeEmptyLock(lock)
        }
        await wait()
    }
    throw new Error('Vector cache writer lock is busy')
}

export async function atomicVectorCacheWrite(
    path: string,
    text: string
): Promise<void> {
    const temporary = `${path}.${String(process.pid)}.${randomUUID()}.tmp`
    try {
        await writeFile(temporary, text, { mode: 0o600, flag: 'wx' })
        await rename(temporary, path)
    } finally {
        await removeMarker(temporary)
    }
}

export function code(error: unknown): string | undefined {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
        ? error.code
        : undefined
}
