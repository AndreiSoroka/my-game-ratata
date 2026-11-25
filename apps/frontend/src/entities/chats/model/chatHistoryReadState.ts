import { readonly, ref } from 'vue'

export function createChatHistoryReadState() {
    const unread = ref(0)
    let atBottom = true

    function updateScroll(isAtBottom: boolean): void {
        atBottom = isAtBottom
        if (atBottom) unread.value = 0
    }

    function receive(id: string | undefined): boolean {
        if (!id || atBottom) return true
        unread.value += 1
        return false
    }

    return { unread: readonly(unread), isAtBottom: () => atBottom, updateScroll, receive }
}
