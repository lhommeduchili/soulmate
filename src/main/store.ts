import Store from 'electron-store'

interface StoreType {
    spotify: {
        accessToken?: string
        refreshToken?: string
        expiresAt?: number
    }
    soulseek?: {
        username?: string
        password?: string
    }
}

export const store = new Store<StoreType>({
    defaults: {
        spotify: {},
        soulseek: {}
    }
})
