import {
    h,
    mergeProps,
    type Ref,
    vModelDynamic,
    vModelSelect,
    vModelText,
    type VNode,
    withDirectives,
} from 'vue'

/** Keep Vue's native input semantics, including IME, checkbox collections and modifiers. */
export function nativeField<T>(options: {
    tag: 'input' | 'select' | 'textarea'
    attrs: Record<string, unknown>
    model: Ref<T | undefined>
    modifiers: Partial<Record<'number' | 'trim' | 'lazy', boolean>>
    modeled: boolean
    bind: (element: unknown) => void
    type?: string
    children?: VNode[]
}): VNode {
    const attrs = { ...options.attrs }
    delete attrs.modelModifiers
    const props = mergeProps(attrs, {
        class: `game-${options.tag}`,
        ref: options.bind,
        ...(options.type ? { type: options.type } : {}),
    })
    if (options.modeled) {
        props['onUpdate:modelValue'] = (value: T) => {
            options.model.value = value
        }
    }
    const node = h(options.tag, props, options.children)
    if (!options.modeled) {
        return node
    }
    const directive =
        options.tag === 'input'
            ? vModelDynamic
            : options.tag === 'select'
              ? vModelSelect
              : vModelText
    return withDirectives(node, [[directive, options.model.value, undefined, options.modifiers]])
}
