import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAvatarFallback, getUserPicture, resolveAvatarUrl } from '../utils/avatar';
import LogoutConfirmModal from './LogoutConfirmModal';
import ThemeToggle from './ThemeToggle';

export default function Sidebar({ subject, subjectTabs, activeTab, onTabSelect }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [avatarLoadError, setAvatarLoadError] = useState(false);
    const avatarFallback = getAvatarFallback(user?.name || '');
    const avatarUrl = resolveAvatarUrl(getUserPicture(user));

    const hasValidAvatar = Boolean(avatarUrl) && !avatarLoadError;
    const notificationsPath = user ? `/${user.role}/notifications` : '/';

    useEffect(() => {
        setAvatarLoadError(false);
    }, [avatarUrl]);

    const handleLogout = () => {
        setShowLogoutConfirm(false);
        logout();
        navigate('/');
    };

    const isSubjectContext = !!subjectTabs;
    const dashboardPath = user ? `/${user.role}` : '/';
    const isStudent = user?.role === 'student';
    const isTestsView = location.pathname === dashboardPath && new URLSearchParams(location.search).get('tab') === 'tests';

    return (
        <>
            {/* Mobile Top Header */}
            <div className="mobile-header d-md-none">
                <Link to={dashboardPath} className="navbar-brand" style={{ textDecoration: 'none', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 'bold' }}>
                    AcadLink
                </Link>
                <button className="btn-icon" onClick={() => setIsOpen(true)}>
                    ☰
                </button>
            </div>

            {/* Mobile Overlay */}
            {isOpen && (
                <div className="sidebar-overlay d-md-none" onClick={() => setIsOpen(false)} />
            )}

            {/* Main Sidebar */}
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <Link to={dashboardPath} className="navbar-brand" style={{ textDecoration: 'none', color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        AcadLink
                    </Link>
                    <button className="btn-icon d-md-none m-0" onClick={() => setIsOpen(false)} style={{ fontSize: '1.2rem', padding: '0.2rem' }}>✕</button>
                </div>

                <div className="sidebar-scrollable">
                    <nav className="sidebar-nav">
                        {!isSubjectContext ? (
                            // General Dashboard Links based on Role
                            <>
                                <button className={`sidebar-link ${location.pathname === dashboardPath && !isTestsView ? 'active' : ''}`} onClick={() => navigate(dashboardPath)}>
                                    <span className="icon">📚</span> My Subjects
                                </button>
                                {isStudent && (
                                    <button className={`sidebar-link ${isTestsView ? 'active' : ''}`} onClick={() => navigate('/student?tab=tests')}>
                                        <span className="icon">📝</span> My Tests
                                    </button>
                                )}
                                <button className={`sidebar-link ${location.pathname === notificationsPath ? 'active' : ''}`} onClick={() => navigate(notificationsPath)}>
                                    <span className="icon">🔔</span> Notifications
                                </button>
                                {/* Add generic placeholders for future global features if needed */}
                            </>
                        ) : (
                            // Context-Aware Subject Links
                            <>
                                {subject && (
                                    <div style={{ margin: '0.5rem 0 1rem', padding: '0 0.5rem' }}>
                                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                            Current Subject
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                                            {subject.name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: '0.2rem', fontWeight: 600 }}>
                                            {subject.subject_code}
                                        </div>
                                    </div>
                                )}

                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em', margin: '1rem 0.5rem 0.5rem' }}>
                                    Features
                                </div>

                                {subjectTabs.map(t => (
                                    <button
                                        key={t.id}
                                        className={`sidebar-link ${activeTab === t.id ? 'active' : ''}`}
                                        onClick={() => {
                                            if (onTabSelect) onTabSelect(t.id);
                                            setIsOpen(false);
                                        }}
                                    >
                                        <span className="icon">{t.icon}</span>
                                        {t.label}
                                    </button>
                                ))}

                            </>
                        )}
                    </nav>
                </div>

                <div className="sidebar-footer">
                    {user && (
                        <div className="user-profile mb-3">
                            {hasValidAvatar ? (
                                <img
                                    src={avatarUrl}
                                    alt={user.name}
                                    className="avatar"
                                    style={{ width: 36, height: 36, borderRadius: '50%' }}
                                    onError={() => setAvatarLoadError(true)}
                                />
                            ) : (
                                <div className="avatar avatar-placeholder" style={{ width: 36, height: 36, borderRadius: '50%', background: avatarFallback.background, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 'bold' }}>
                                    {avatarFallback.initial}
                                </div>
                            )}
                            <div className="user-info">
                                <span className="user-name">{user.name}</span>
                                <span className={`badge badge-${user.role}`} style={{ fontSize: '0.65rem', alignSelf: 'flex-start', marginTop: '0.2rem' }}>
                                    {user.role}
                                </span>
                            </div>
                        </div>
                    )}
                    <ThemeToggle />
                    <button className="btn btn-outline" style={{ width: '100%', borderColor: 'rgba(244,63,94,0.3)', color: '#fb7185' }} onClick={() => setShowLogoutConfirm(true)}>
                        Log Out
                    </button>
                </div>
            </aside>

            <LogoutConfirmModal
                open={showLogoutConfirm}
                onCancel={() => setShowLogoutConfirm(false)}
                onConfirm={handleLogout}
            />
        </>
    );
}
