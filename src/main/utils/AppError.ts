export class AppError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly fallbackMessage?: string
    ) {
        super(message)
        this.name = 'AppError'
        Object.setPrototypeOf(this, AppError.prototype)
    }
}
