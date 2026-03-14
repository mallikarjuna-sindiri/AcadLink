const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, var(--accent), var(--accent-dark))',
    'linear-gradient(135deg, var(--teal), var(--accent))',
    'linear-gradient(135deg, var(--purple), var(--accent))',
    'linear-gradient(135deg, var(--rose), var(--purple))',
    'linear-gradient(135deg, var(--amber), var(--rose))',
    'linear-gradient(135deg, var(--green), var(--teal))',
];

const hashString = (value = '') => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = value.charCodeAt(index) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
};

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:');

export const getUserPicture = (user = {}) => {
    if (!user || typeof user !== 'object') return '';

    const raw =
        user.picture ||
        user.profile_picture ||
        user.profilePhoto ||
        user.photo ||
        user.photo_url ||
        user.avatar ||
        '';

    if (typeof raw !== 'string') return '';

    const normalized = raw.trim();
    if (!normalized) return '';

    const lowered = normalized.toLowerCase();
    if (lowered === 'null' || lowered === 'undefined' || lowered === 'none' || lowered === 'n/a') {
        return '';
    }

    return normalized;
};

export const resolveAvatarUrl = (picture = '') => {
    if (!picture || typeof picture !== 'string') return '';

    const trimmed = picture.trim();
    if (!trimmed) return '';
    if (isAbsoluteUrl(trimmed)) return trimmed;

    const envBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const computedBase = isLocalhost
        ? 'http://localhost:8000'
        : `${window.location.protocol}//${window.location.hostname}:8000`;
    const apiBase = (envBase || computedBase).replace(/\/$/, '');

    return `${apiBase}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

export const getAvatarFallback = (name = '') => {
    const trimmedName = name.trim();
    const initial = (trimmedName[0] || '?').toUpperCase();
    const colorIndex = hashString(trimmedName || initial) % AVATAR_GRADIENTS.length;

    return {
        initial,
        background: AVATAR_GRADIENTS[colorIndex],
    };
};
