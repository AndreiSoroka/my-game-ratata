export function required<T>(value: T | null | undefined): T {
    if (value === undefined || value === null) {
        throw new Error('Missing test fixture value')
    }
    return value
}
