const tokenPattern =
    /\s*(("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(->|[,(){}]))/y

export class Line {
    private readonly values: string[] = []
    private index = 0

    constructor(source: string) {
        let position = 0
        while (position < source.length) {
            tokenPattern.lastIndex = position
            const match = tokenPattern.exec(source)
            if (match === null) {
                const remaining = source.slice(position).trimStart()
                if (remaining.length === 0 || remaining.startsWith('//')) {
                    break
                }
                throw new Error('Unexpected character.')
            }
            this.values.push(match[1] ?? '')
            position = tokenPattern.lastIndex
        }
    }

    public peek(): string | undefined {
        return this.values[this.index]
    }

    public take(): string {
        const value = this.peek()
        if (value === undefined) {
            throw new Error('Unexpected end of line.')
        }
        this.index += 1
        return value
    }

    public accept(token: string): boolean {
        if (this.peek() !== token) {
            return false
        }
        this.index += 1
        return true
    }

    public expect(token: string): void {
        if (!this.accept(token)) {
            throw new Error(`Expected ${token}.`)
        }
    }

    public string(): string {
        const value = this.take()
        if (!value.startsWith('"')) {
            throw new Error('Expected quoted text.')
        }
        try {
            return JSON.parse(value) as string
        } catch {
            throw new Error('Invalid quoted text.')
        }
    }

    public number(): number {
        const token = this.take()
        if (!/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) {
            throw new Error('Expected a number.')
        }
        return Number(token)
    }

    public duration(): number {
        const time = this.number()
        const unit = this.take()
        if (unit !== 'ms' && unit !== 's') {
            throw new Error('Expected ms or s.')
        }
        return unit === 'ms' ? time : Math.round(time * 1000)
    }

    public end(): void {
        if (this.peek() !== undefined) {
            throw new Error('Unexpected extra arguments.')
        }
    }

    public optionalString(key: string): string | undefined {
        return this.accept(key) ? this.string() : undefined
    }

    public optionalWord(key: string): string | undefined {
        return this.accept(key) ? this.take() : undefined
    }
}
