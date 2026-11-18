export function normalizeNickname(nickname: string): string {
    return nickname.trim().toLocaleLowerCase('en-US').normalize('NFC')
}
