import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers'

import { afterEach, expect, it, vi } from 'vitest'

import type { withVectorCacheLock } from '../src/ai/vectorCacheFile'

const fs =
    await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
const directories: string[] = []
const immediate = () => new Promise<void>((resolve) => setImmediate(resolve))
const options = { attempts: 2, wait: immediate }
const marker = (pid: number, number = 1) =>
    `${String(pid)}-00000000-0000-4000-8000-${String(number).padStart(12, '0')}.json`

afterEach(async () => {
    vi.restoreAllMocks()
    vi.doUnmock('node:fs/promises')
    vi.resetModules()
    for (const directory of directories.splice(0)) {
        await fs.rm(directory, { recursive: true, force: true })
    }
})

async function setup(
    overrides: Partial<typeof fs> = {}
): Promise<{ file: string; lock: string; run: typeof withVectorCacheLock }> {
    const directory = await fs.mkdtemp(join(tmpdir(), 'ratata-cache-lock-'))
    directories.push(directory)
    vi.resetModules()
    vi.doMock('node:fs/promises', () => ({ ...fs, ...overrides }))
    const { withVectorCacheLock: run } =
        await import('../src/ai/vectorCacheFile')
    const file = join(directory, 'vectors.json')
    return { file, lock: `${file}.lock`, run }
}

it('serializes live writers and enters work only with its unique owner marker', async () => {
    const { file, lock, run } = await setup()
    let active = 0,
        maximum = 0
    const results = await Promise.all(
        Array.from({ length: 4 }, (_, number) =>
            run(
                file,
                async () => {
                    active++
                    maximum = Math.max(maximum, active)
                    const owners = await fs.readdir(lock)
                    expect(owners).toHaveLength(1)
                    expect(owners[0]).toMatch(
                        new RegExp(`^${String(process.pid)}-`)
                    )
                    await immediate()
                    active--
                    return number
                },
                { attempts: 500, wait: immediate }
            )
        )
    )
    expect(results).toEqual([0, 1, 2, 3])
    expect(maximum).toBe(1)
    await expect(fs.stat(lock)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('reclaims only a dead owner marker and recovers the empty directory', async () => {
    const { file, lock, run } = await setup()
    await fs.mkdir(lock)
    await fs.writeFile(join(lock, marker(999_999_999)), '')
    const work = vi.fn(() => Promise.resolve('done'))
    expect(await run(file, work, { attempts: 5, wait: immediate })).toBe('done')
    expect(work).toHaveBeenCalledTimes(1)
    await expect(fs.stat(lock)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('recognizes a live owner from its filename before JSON initialization completes', async () => {
    const { file, lock, run } = await setup()
    const owner = marker(process.pid)
    await fs.mkdir(lock)
    await fs.writeFile(join(lock, owner), '')
    const work = vi.fn(() => Promise.resolve())
    await expect(run(file, work, options)).rejects.toThrow('lock is busy')
    expect(work).not.toHaveBeenCalled()
    expect(await fs.readdir(lock)).toEqual([owner])
})

it('never deletes an unknown marker even in an old lock directory', async () => {
    const { file, lock, run } = await setup()
    await fs.mkdir(lock)
    await fs.writeFile(join(lock, 'unknown-owner'), 'opaque')
    await fs.utimes(lock, new Date(0), new Date(0))
    await expect(run(file, () => Promise.resolve(), options)).rejects.toThrow(
        'lock is busy'
    )
    expect(await fs.readFile(join(lock, 'unknown-owner'), 'utf8')).toBe(
        'opaque'
    )
})

it.each([false, true])(
    'reclaims abandoned empty directories only after the initialization grace period (old:%s)',
    async (old) => {
        const { file, lock, run } = await setup()
        await fs.mkdir(lock)
        if (old) {
            await fs.utimes(lock, new Date(0), new Date(0))
        }
        const work = vi.fn(() => Promise.resolve('done'))
        if (old) {
            expect(
                await run(file, work, { attempts: 5, wait: immediate })
            ).toBe('done')
        } else {
            await expect(run(file, work, options)).rejects.toThrow(
                'lock is busy'
            )
            expect(work).not.toHaveBeenCalled()
        }
    }
)

it('keeps a replacement live directory when it appears after stale-marker removal before rmdir', async () => {
    let target = '',
        replaced = false
    const live = marker(process.pid, 2)
    const { file, lock, run } = await setup({
        rmdir: async (...args) => {
            if (String(args[0]) === target && !replaced) {
                replaced = true
                expect(await fs.readdir(target)).toEqual([])
                await fs.rmdir(target)
                await fs.mkdir(target)
                await fs.writeFile(join(target, live), '')
            }
            return fs.rmdir(...args)
        },
    })
    target = lock
    await fs.mkdir(lock)
    await fs.writeFile(join(lock, marker(999_999_999)), '')
    const work = vi.fn(() => Promise.resolve())
    await expect(run(file, work, options)).rejects.toThrow('lock is busy')
    expect(replaced).toBe(true)
    expect(work).not.toHaveBeenCalled()
    expect(await fs.readdir(lock)).toEqual([live])
})

it('retries acquisition if stale cleanup removes its empty directory before marker creation', async () => {
    let target = '',
        removed = false
    const { file, lock, run } = await setup({
        open: async (...args) => {
            if (String(args[0]).startsWith(`${target}/`) && !removed) {
                removed = true
                await fs.rmdir(target)
            }
            return fs.open(...args)
        },
    })
    target = lock
    const work = vi.fn(() => Promise.resolve('done'))
    expect(await run(file, work, { attempts: 5, wait: immediate })).toBe('done')
    expect(removed).toBe(true)
    expect(work).toHaveBeenCalledTimes(1)
})

it('does not enter work when initialization adds its marker to a replacement owner directory', async () => {
    let target = '',
        replaced = false
    const live = marker(process.pid, 3)
    const { file, lock, run } = await setup({
        open: async (...args) => {
            if (String(args[0]).startsWith(`${target}/`) && !replaced) {
                replaced = true
                await fs.rmdir(target)
                await fs.mkdir(target)
                await fs.writeFile(join(target, live), '')
            }
            return fs.open(...args)
        },
    })
    target = lock
    const work = vi.fn(() => Promise.resolve())
    await expect(run(file, work, options)).rejects.toThrow('lock is busy')
    expect(replaced).toBe(true)
    expect(work).not.toHaveBeenCalled()
    expect(await fs.readdir(lock)).toEqual([live])
})

it('cleanup removes only its own unique marker and keeps a replacement live owner', async () => {
    const { file, lock, run } = await setup()
    const replacement = marker(process.pid, 4)
    await run(
        file,
        async () => {
            const own = (await fs.readdir(lock))[0]
            if (own === undefined) {
                throw new Error('Missing owner fixture')
            }
            await fs.unlink(join(lock, own))
            await fs.rmdir(lock)
            await fs.mkdir(lock)
            await fs.writeFile(join(lock, replacement), '')
        },
        options
    )
    expect(await fs.readdir(lock)).toEqual([replacement])
})

it('treats an existing ordinary lock file as a conservative cache-write obstruction', async () => {
    const { file, lock, run } = await setup()
    await fs.writeFile(lock, 'legacy obstruction')
    await expect(
        run(file, () => Promise.resolve(), options)
    ).rejects.toMatchObject({ code: 'ENOTDIR' })
    expect(await fs.readFile(lock, 'utf8')).toBe('legacy obstruction')
})
