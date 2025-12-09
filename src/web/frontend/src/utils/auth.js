import axios from 'axios';

// Legacy helpers kept for compatibility; auth now lives in an HTTP-only cookie.
export const setToken = () => {};
export const getToken = () => null;
export const removeToken = () => {
    localStorage.removeItem('soulmate_auth_token');
};
export const isAuthenticated = () => true;

const BASIC_KEY = 'soulmate_basic_auth';

const storeBasicAuth = (user, pass) => {
    const payload = { user, pass };
    sessionStorage.setItem(BASIC_KEY, JSON.stringify(payload));
};

const loadBasicAuth = () => {
    const raw = sessionStorage.getItem(BASIC_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
};

export const clearBasicAuth = () => {
    sessionStorage.removeItem(BASIC_KEY);
};

export const ensureBasicAuth = () => {
    const existing = loadBasicAuth();
    if (existing && existing.user && existing.pass) {
        return existing;
    }
    const user = window.prompt('Usuario (Basic Auth)');
    if (!user) return null;
    const pass = window.prompt('Contraseña (Basic Auth)');
    if (pass === null || pass === undefined) return null;
    storeBasicAuth(user, pass);
    return { user, pass };
};

const buildBasicHeader = () => {
    const creds = loadBasicAuth();
    if (!creds || !creds.user || !creds.pass) return null;
    const token = btoa(`${creds.user}:${creds.pass}`);
    return `Basic ${token}`;
};

// Attach Basic Auth header if available
axios.interceptors.request.use(
    (config) => {
        const basicHeader = buildBasicHeader();
        if (basicHeader) {
            config.headers.Authorization = basicHeader;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            clearBasicAuth();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);
