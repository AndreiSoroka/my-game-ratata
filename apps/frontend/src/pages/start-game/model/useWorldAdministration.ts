import type { WorldEmptyMode } from '@my-game-ratata/contracts'
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import {
    AdminSessionExpired,
    authorizeAdminCode,
    authorizeLocalAdmin,
    canUseRemoteAdmin,
    getWorldEmptyMode,
    localAdminOrigin,
    saveWorldEmptyMode,
    type WorldAdminSession,
} from '../api/startGameApi'

export type AdminAccessState = 'checking' | 'code' | 'unavailable' | 'authorized'
type Failure = 'invalidCode' | 'loadFailed' | 'saveFailed' | 'sessionExpired'

export function useWorldAdministration(backendReachable: () => boolean) {
    const localOrigin = localAdminOrigin()
    const remoteAvailable = canUseRemoteAdmin()
    const remoteAccess = (): AdminAccessState => (remoteAvailable ? 'code' : 'unavailable')
    const access = ref<AdminAccessState>(localOrigin ? 'checking' : remoteAccess())
    const open = ref(false)
    const busy = ref(false)
    const failure = ref<Failure>()
    const error = computed(() =>
        failure.value === undefined ? '' : tGame(`game.worldSettings.${failure.value}`)
    )
    const mode = ref<WorldEmptyMode>()
    const controller = new AbortController()
    const { signal } = controller
    let session: WorldAdminSession | undefined

    onScopeDispose(() => controller.abort())
    onMounted(() => void checkLocalAccess())
    watch(backendReachable, (reachable) => {
        if (reachable && !session && !busy.value && access.value !== 'checking')
            void checkLocalAccess()
    })

    async function checkLocalAccess(): Promise<void> {
        if (!localOrigin) return
        access.value = 'checking'
        try {
            accept(await authorizeLocalAdmin(localOrigin, signal))
        } catch {
            if (!signal.aborted) access.value = remoteAccess()
        }
    }

    async function enterCode(code: string): Promise<void> {
        if (access.value !== 'code') return
        await submit(async () => accept(await authorizeAdminCode(code, signal)), 'invalidCode')
    }

    function accept(accepted: WorldAdminSession): void {
        if (signal.aborted) return
        session = accepted
        access.value = 'authorized'
    }

    async function openPanel(): Promise<void> {
        const current = session
        if (!current || busy.value) return
        mode.value = undefined
        open.value = true
        await submit(async () => {
            mode.value = await getWorldEmptyMode(current, signal)
        }, 'loadFailed')
    }

    async function saveMode(nextMode: WorldEmptyMode): Promise<void> {
        const current = session
        if (!current || !open.value || mode.value === undefined) return
        await submit(async () => {
            mode.value = await saveWorldEmptyMode(current, signal, nextMode)
            open.value = false
        }, 'saveFailed')
    }

    async function submit(action: () => Promise<void>, fallback: Failure): Promise<void> {
        if (busy.value) return
        busy.value = true
        failure.value = undefined
        try {
            await action()
        } catch (cause) {
            if (signal.aborted) return
            if (cause instanceof AdminSessionExpired) {
                session = undefined
                open.value = false
                access.value = remoteAccess()
                failure.value = 'sessionExpired'
                await checkLocalAccess()
            } else {
                failure.value = fallback
            }
        } finally {
            busy.value = false
        }
    }

    return { access, busy, error, mode, open, enterCode, openPanel, saveMode }
}
