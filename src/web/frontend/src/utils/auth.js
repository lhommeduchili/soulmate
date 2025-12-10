import axios from 'axios';
import { supabase } from './supabase';

export const setToken = () => {};
export const getToken = () => null;
export const removeToken = () => {};
export const isAuthenticated = () => true;

axios.interceptors.request.use(
    async (config) => {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data.session?.access_token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${data.session.access_token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);
