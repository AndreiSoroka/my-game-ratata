import { h, type VNodeChild } from 'vue'

export type StorySlot = 'none' | 'block' | 'text' | 'example'

export function storySlotControl(name: string) {
    return {
        name,
        options: ['none', 'block', 'text', 'example'],
        control: {
            type: 'select' as const,
            labels: {
                none: 'Без слота',
                block: 'Пустой блок с фоном',
                text: 'Текст',
                example: 'Пример',
            },
        },
    }
}

export function storySlot<Props = Record<string, never>>(
    mode: StorySlot,
    text: string,
    example: (props: Props) => VNodeChild,
    { inline = false, color = '#946f9e' } = {}
): ((props: Props) => VNodeChild) | undefined {
    if (mode === 'none') return undefined
    if (mode === 'text') return () => (inline ? h('span', text) : text)
    if (mode === 'example') return example
    return () =>
        h(inline ? 'span' : 'div', {
            style: {
                display: inline ? 'inline-block' : 'block',
                inlineSize: inline ? '1em' : '100%',
                minBlockSize: '1em',
                backgroundColor: color,
            },
        })
}
