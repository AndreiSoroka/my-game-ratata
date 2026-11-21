import { nextTick } from 'vue'

export async function clickWithPointer(element: Element): Promise<void> {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    await nextTick()
}
