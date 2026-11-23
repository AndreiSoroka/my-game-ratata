import {
    authoredMessage,
    authoredRussian,
    type AuthoredTextKey,
    type LocalizedMessage,
} from '@my-game-ratata/contracts'

export interface NoticeState {
    notice: string | null
    noticeId: number
    noticeMessage?: LocalizedMessage
}

/** A receipt identifies a new action result, even when its text repeats. */
export function setNotice<Text extends string | null>(
    state: NoticeState,
    text: Text,
    message?: LocalizedMessage
): Text {
    state.notice = text
    if (message === undefined) {
        delete state.noticeMessage
    } else {
        state.noticeMessage = message
    }
    state.noticeId += 1
    return text
}

export function setAuthoredNotice(
    state: NoticeState,
    key: AuthoredTextKey,
    params?: LocalizedMessage['params']
): string {
    return setNotice(
        state,
        authoredRussian(key, params),
        authoredMessage(key, params)
    )
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
