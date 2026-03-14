import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                width: '100%',
                padding: '0.6rem 1rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--bg-base)',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: '0.75rem',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--border-bright)';
                e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-secondary)';
            }}
        >
            {/* Track */}
            <span style={{
                position: 'relative',
                display: 'inline-flex',
                width: '42px',
                height: '24px',
                borderRadius: '999px',
                background: isDark
                    ? 'linear-gradient(135deg, #1e1b4b, #312e81)'
                    : 'linear-gradient(135deg, #fde68a, #fb923c)',
                border: `2px solid ${isDark ? 'rgba(99,102,241,0.4)' : 'rgba(251,146,60,0.5)'}`,
                transition: 'all 0.35s ease',
                flexShrink: 0,
                boxShadow: isDark
                    ? '0 0 8px rgba(99,102,241,0.3)'
                    : '0 0 8px rgba(251,146,60,0.4)',
            }}>
                {/* Thumb */}
                <span style={{
                    position: 'absolute',
                    top: '2px',
                    left: isDark ? '2px' : '18px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: isDark ? '#818cf8' : '#fff',
                    transition: 'left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9px',
                    boxShadow: isDark
                        ? '0 1px 4px rgba(0,0,0,0.5)'
                        : '0 1px 4px rgba(0,0,0,0.2)',
                }}>
                    {isDark ? '🌙' : '☀️'}
                </span>
            </span>
            <span style={{ flex: 1, textAlign: 'left' }}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
            </span>
        </button>
    );
}
