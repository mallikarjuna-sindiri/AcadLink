import axios from 'axios';

// Dynamically use the host the app is loaded from, so network devices connect correctly
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocalhost ? 'http://localhost:8000' : `http://${window.location.hostname}:8000`;

const api = axios.create({ baseURL: API_BASE });

// Attach JWT token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('acadlink_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Auto-logout on 401
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('acadlink_token');
            localStorage.removeItem('acadlink_user');
            window.location.href = '/';
        }
        return Promise.reject(err);
    }
);

export default api;
