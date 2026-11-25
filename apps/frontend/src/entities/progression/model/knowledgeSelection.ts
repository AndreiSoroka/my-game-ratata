import { ref } from 'vue'

export function createKnowledgeSelectionStore() {
    const selectedId = ref('')

    return {
        select(id: string): void {
            selectedId.value = id
        },
        current<T extends { id: string }>(candidates: readonly T[]): T | undefined {
            return candidates.find(({ id }) => id === selectedId.value) ?? candidates[0]
        },
    }
}
