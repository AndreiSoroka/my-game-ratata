import { ref } from 'vue'

import { generateHeroName } from './generateHeroName'

/** The proposal belongs to the application, not to a repeatedly mounted login form. */
export function useHeroName(language = () => document.documentElement.lang, changed?: () => void) {
    const nickname = ref(generateHeroName({ language: language() }))
    const createOnly = ref(true)
    let revision = 0
    function edited(): void {
        revision += 1
        createOnly.value = false
        changed?.()
    }
    function setManually(name: string): void {
        nickname.value = name
        edited()
    }
    function regenerate(): void {
        nickname.value = generateHeroName({ language: language(), currentName: nickname.value })
        revision += 1
        createOnly.value = true
        changed?.()
    }
    function attempt() {
        const currentRevision = revision
        return {
            nickname: nickname.value,
            createOnly: createOnly.value,
            onJoinAccepted: () => {
                if (revision === currentRevision) createOnly.value = false
            },
        }
    }
    return { nickname, createOnly, edited, setManually, regenerate, attempt }
}
