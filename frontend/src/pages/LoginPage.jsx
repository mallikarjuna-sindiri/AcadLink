/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

// Safe Google Login — catches crash if origin not registered
function SafeGoogleLogin({ onSuccess, onError }) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        // Try to load google identity services but catch failures
        const timer = setTimeout(() => {
            try {
                if (window.google) {
                    window.google.accounts.id.initialize({
                        client_id: '298297489949-gpm3ldends0d6rdqok7o2agtd44j1h2t.apps.googleusercontent.com',
                        callback: (response) => {
                            if (response.credential) {
                                onSuccess({ credential: response.credential });
                            }
                        },
                    });
                    window.google.accounts.id.renderButton(
                        document.getElementById('google-btn-container'),
                        { theme: 'filled_black', size: 'large', width: 280 }
                    );
                } else {
                    setFailed(true);
                }
            } catch {
                setFailed(true);
                onError();
            }
        }, 800);
        return () => clearTimeout(timer);
    }, []);

    if (failed) {
        return (
            <div style={{
                background: 'rgba(244,63,94,0.08)',
                border: '1px solid rgba(244,63,94,0.2)',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                fontSize: '0.78rem',
                color: '#fb7185',
                textAlign: 'center',
            }}>
                ⚠️ Google login unavailable (origin not registered).<br />
                Use the quick access buttons below.
            </div>
        );
    }

    return <div id="google-btn-container" style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />;
}

export default function LoginPage() {
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const [devLoading, setDevLoading] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (user) redirectByRole(user.role);
    }, [user]);

    const redirectByRole = (role) => {
        const params = new URLSearchParams(window.location.search);
        const joinCode = params.get('joinCode');

        if (role === 'admin') navigate('/admin');
        else if (role === 'teacher') navigate('/teacher');
        else navigate(joinCode ? `/student?joinCode=${joinCode}` : '/student');
    };

    const handleGoogleSuccess = async ({ credential }) => {
        setError('');
        try {
            const res = await api.post('/api/auth/google', { credential });
            login(res.data.token, res.data.user);
            toast.success(`Welcome, ${res.data.user.name}!`);
            redirectByRole(res.data.user.role);
        } catch (err) {
            const msg = err.response?.data?.detail || 'Login failed.';
            setError(msg);
            toast.error(msg);
        }
    };

    // ── Dev bypass ─────────────────────────────────────────────
    const handleDevLogin = async (role) => {
        setDevLoading(role);
        setError('');
        try {
            const res = await api.post('/api/auth/dev-login', { role });
            login(res.data.token, res.data.user);
            toast.success(`Signed in as ${res.data.user.name}`);
            redirectByRole(role);
        } catch (err) {
            const msg = err.response?.data?.detail || 'Dev login failed.';
            setError(msg);
            toast.error(msg);
        } finally {
            setDevLoading('');
        }
    };

    const DEV_ROLES = [
        { role: 'admin', icon: '🛡️', label: 'Admin', color: '#f59e0b' },
        { role: 'teacher', icon: '👨‍🏫', label: 'Teacher', color: '#6366f1' },
        { role: 'student', icon: '👨‍🎓', label: 'Student', color: '#14b8a6' },
    ];

    return (
        <div className="login-page">
            <div className="orb orb-1" />
            <div className="orb orb-2" />
            <div className="orb orb-3" />

            <div className="login-card">
                {/* Brand */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '2.8rem', marginBottom: '0.4rem' }}>🎓</div>
                    <h1 className="gradient-text" style={{ fontSize: '2.2rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
                        AcadLink
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                        Learning Management System
                    </p>
                    <p style={{ color: 'var(--accent-light)', fontSize: '0.73rem', fontWeight: 600, marginTop: '0.15rem' }}>
                        VNR Vignana Jyothi Institute of Engineering &amp; Technology
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="alert alert-error" style={{ marginBottom: '1rem', fontSize: '0.82rem' }}>
                        {error}
                    </div>
                )}

                {/* Google Sign-In */}
                <div style={{ marginBottom: '0.75rem' }}>
                    <p className="text-xs text-muted" style={{ textAlign: 'center', marginBottom: '0.6rem' }}>
                        Sign in with your college Google account
                    </p>
                    <SafeGoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setError('Google sign-in failed — use quick access below.')}
                    />
                </div>

                {/* Divider */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    margin: '1rem 0', color: 'var(--text-muted)', fontSize: '0.73rem',
                }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                    <span>Quick Access (Dev)</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                </div>

                {/* Dev Bypass Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {DEV_ROLES.map(({ role, icon, label, color }) => (
                        <button
                            key={role}
                            onClick={() => handleDevLogin(role)}
                            disabled={!!devLoading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.6rem',
                                width: '100%',
                                padding: '0.7rem',
                                background: `rgba(255,255,255,0.04)`,
                                border: `1px solid ${color}30`,
                                borderRadius: '10px',
                                color: 'var(--text-primary)',
                                fontSize: '0.875rem',
                                fontWeight: 700,
                                fontFamily: 'inherit',
                                cursor: devLoading ? 'not-allowed' : 'pointer',
                                opacity: devLoading && devLoading !== role ? 0.5 : 1,
                                transition: 'all 0.18s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = `${color}18`;
                                e.currentTarget.style.borderColor = `${color}70`;
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                e.currentTarget.style.borderColor = `${color}30`;
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            {devLoading === role ? (
                                <><span className="spinner" /> Signing in…</>
                            ) : (
                                <><span style={{ fontSize: '1.1rem' }}>{icon}</span> Continue as {label}</>
                            )}
                        </button>
                    ))}
                </div>

                {/* Footer note */}
                <p style={{
                    textAlign: 'center', marginTop: '1.25rem',
                    fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5,
                }}>
                    🔒 Google login: <span style={{ color: 'var(--accent-light)' }}>@vnrvjiet.in</span> only &nbsp;·&nbsp;
                    Students auto-register on first sign-in
                </p>
            </div>
        </div>
    );
}
