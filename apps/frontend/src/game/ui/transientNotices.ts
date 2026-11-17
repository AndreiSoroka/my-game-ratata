interface SnapshotNotice {
    notice: string | null
    noticeId?: number | string
}

export interface TransientNotices {
    show: (text: string) => void
    observe: (source: string, value: SnapshotNotice | undefined) => void
    reset: () => void
}

/** Receipt identity, not repeated snapshot arrival, starts the display deadline. */
export function createTransientNotices(
    publish: (text: string) => void,
    durationMs = 5_000
): TransientNotices {
    const receipts = new Map<string, number | string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = (text: string): void => {
        clearTimeout(timer)
        publish(text)
        timer = text ? setTimeout(() => publish(''), durationMs) : undefined
    }
    return {
        show,
        observe(source, value): void {
            if (!value?.notice) return
            const receipt = value.noticeId ?? value.notice
            if (receipts.get(source) === receipt) return
            receipts.set(source, receipt)
            show(value.notice)
        },
        reset(): void {
            clearTimeout(timer)
            timer = undefined
            receipts.clear()
            publish('')
        },
    }
}
