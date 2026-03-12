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

export const getAvatarFallback = (name = '') => {
    const trimmedName = name.trim();
    const initial = (trimmedName[0] || '?').toUpperCase();
    const colorIndex = hashString(trimmedName || initial) % AVATAR_GRADIENTS.length;

    return {
        initial,
        background: AVATAR_GRADIENTS[colorIndex],
    };
};
