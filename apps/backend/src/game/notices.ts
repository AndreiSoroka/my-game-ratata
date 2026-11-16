export interface NoticeState {
    notice: string | null
    noticeId: number
}

/** A receipt identifies a new action result, even when its text repeats. */
export function setNotice<Text extends string | null>(
    state: NoticeState,
    text: Text
): Text {
    state.notice = text
    state.noticeId += 1
    return text
}

export class NoticeStore {
    private readonly states = new Map<string, NoticeState>()

    public set(actorId: string, text: string): void {
        const state = this.states.get(actorId) ?? { notice: null, noticeId: 0 }
        setNotice(state, text)
        this.states.set(actorId, state)
    }

    public get(actorId: string): string | undefined {
        return this.states.get(actorId)?.notice ?? undefined
    }

    public idFor(actorId: string): number {
        return this.states.get(actorId)?.noticeId ?? 0
    }

    public delete(actorId: string): void {
        this.states.delete(actorId)
    }
}
