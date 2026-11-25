import { onBeforeUnmount, onMounted } from 'vue'

import type { useHeroName } from '../../../game/names/useHeroName'
import { createCharacterResumeSession } from './characterResumeSession'

type HeroName = ReturnType<typeof useHeroName>
type EntryRequest = ReturnType<HeroName['attempt']> & {
    requestResumeToken: boolean
    resumeToken?: string | undefined
    onResumeToken: (nickname: string, token: string) => void
    onJoinRejected: (code: string | undefined) => void
}

export function useCharacterEntry(options: {
    heroName: Pick<HeroName, 'attempt' | 'setManually'>
    canEnterWorld: () => Promise<boolean>
    started: () => boolean
    activate: (request: EntryRequest) => Promise<void>
}) {
    const resume = createCharacterResumeSession()
    let entering = false
    let disposed = false

    async function joinGame(): Promise<void> {
        if (entering || options.started() || disposed) return
        const attempt = options.heroName.attempt()
        entering = true
        try {
            if (!(await options.canEnterWorld()) || disposed || options.started()) return
            const current = options.heroName.attempt()
            if (current.nickname !== attempt.nickname || current.createOnly !== attempt.createOnly)
                return
            const token = attempt.createOnly ? undefined : resume.tokenFor(attempt.nickname)
            await options.activate({
                ...attempt,
                requestResumeToken: resume.canPersist,
                resumeToken: token,
                onResumeToken: resume.remember,
                onJoinRejected: (code) => {
                    if (code === 'resume_invalid' && token) resume.forget(attempt.nickname, token)
                },
            })
        } finally {
            entering = false
        }
    }

    onMounted(() => {
        const previous = resume.automatic()
        if (!previous || options.started()) return
        options.heroName.setManually(previous)
        void joinGame()
    })
    onBeforeUnmount(() => {
        disposed = true
    })

    return { joinGame, pauseEntry: resume.pause, retireCharacter: resume.retire }
}
