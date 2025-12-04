import axios from 'axios';

const TOKEN_KEY = 'soulmate_auth_token';

export const setToken = (tokenInfo) => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenInfo));
};

export const getToken = () => {
    const tokenStr = localStorage.getItem(TOKEN_KEY);
    if (!tokenStr) return null;
    try {
        return JSON.parse(tokenStr);
    } catch (e) {
        return null;
    }
};

export const removeToken = () => {
    localStorage.removeItem(TOKEN_KEY);
};

export const isAuthenticated = () => {
    return !!getToken();
};

// Configure axios to always send the token
axios.interceptors.request.use(
    (config) => {
        const tokenInfo = getToken();
        if (tokenInfo && tokenInfo.access_token) {
            config.headers.Authorization = `Bearer ${tokenInfo.access_token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Optional: Handle 401s globally
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Token expired or invalid
            removeToken();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);
