import type { InjectionKey, Ref } from 'vue'

export const marketWindowContext: InjectionKey<{
    shopOpen: Ref<boolean>
    whisperPartnerId: Ref<string | undefined>
}> = Symbol('market window')
