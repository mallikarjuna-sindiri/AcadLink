import { useMemo, useState } from 'react';
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
    const [avatarLoadErrorFor, setAvatarLoadErrorFor] = useState('');
    const [miniCalendarDate, setMiniCalendarDate] = useState(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    });
    const [miniSelectedDateKey, setMiniSelectedDateKey] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });
    const avatarFallback = getAvatarFallback(user?.name || '');
    const avatarUrl = resolveAvatarUrl(getUserPicture(user));

    const hasValidAvatar = Boolean(avatarUrl) && avatarLoadErrorFor !== avatarUrl;
    const notificationsPath = user ? `/${user.role}/notifications` : '/';
    const isSubjectContext = !!subjectTabs;
    const dashboardPath = user ? `/${user.role}` : '/';
    const isAdmin = user?.role === 'admin';
    const isStudent = user?.role === 'student';
    const isFaculty = user?.role === 'teacher';
    const showMiniCalendar = isStudent || isFaculty;
    const isTestsView = location.pathname === dashboardPath && new URLSearchParams(location.search).get('tab') === 'tests';
    const isTeacherHolidaysView = location.pathname === '/teacher/holidays';
    const isStudentCalendarView = location.pathname === '/student/calendar';
    const isTeacherCalendarView = location.pathname === '/teacher/calendar';
    const adminTab = new URLSearchParams(location.search).get('tab') || 'overview';
    const isAdminDashboardView = location.pathname === '/admin';
    const calendarPath = isStudent ? '/student/calendar' : '/teacher/calendar';

    const pad = (value) => String(value).padStart(2, '0');
    const today = new Date();
    const todayDateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const selectedDateFromQuery = (isStudentCalendarView || isTeacherCalendarView)
        ? new URLSearchParams(location.search).get('date')
        : null;
    const selectedDateKey = selectedDateFromQuery || miniSelectedDateKey;

    const queryDrivenCalendarDate = useMemo(() => {
        if (!selectedDateFromQuery) return null;
        const [yearStr, monthStr] = selectedDateFromQuery.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) return null;
        return new Date(year, month - 1, 1);
    }, [selectedDateFromQuery]);
    const activeMiniCalendarDate = queryDrivenCalendarDate || miniCalendarDate;

    const handleLogout = () => {
        setShowLogoutConfirm(false);
        logout();
        navigate('/');
    };

    const monthOptions = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = today.getFullYear();
    const yearOptions = Array.from({ length: 11 }, (_, index) => currentYear - 5 + index);

    const miniCalendar = useMemo(() => {
        const year = activeMiniCalendarDate.getFullYear();
        const month = activeMiniCalendarDate.getMonth();
        const monthLabel = activeMiniCalendarDate.toLocaleString(undefined, { month: 'long', year: 'numeric' });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        return {
            monthLabel,
            year,
            month,
            cells: Array.from({ length: firstDay }, (_, index) => ({ key: `empty-${index}`, value: null }))
                .concat(
                    Array.from({ length: daysInMonth }, (_, index) => {
                        const dateValue = index + 1;
                        const dateKey = `${year}-${pad(month + 1)}-${pad(dateValue)}`;
                        return {
                            key: `date-${dateValue}`,
                            value: dateValue,
                            dateKey,
                            isToday: dateKey === todayDateKey,
                            isSelected: dateKey === selectedDateKey,
                        };
                    })
                ),
        };
    }, [activeMiniCalendarDate, selectedDateKey, todayDateKey]);

    const goMiniPrevMonth = () => {
        setMiniCalendarDate((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1));
    };

    const goMiniNextMonth = () => {
        setMiniCalendarDate((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1));
    };

    const changeMiniMonth = (monthIndex) => {
        setMiniCalendarDate((previous) => new Date(previous.getFullYear(), monthIndex, 1));
    };

    const changeMiniYear = (year) => {
        setMiniCalendarDate((previous) => new Date(year, previous.getMonth(), 1));
    };

    const openCalendarOnDate = (dateKey) => {
        setMiniSelectedDateKey(dateKey);

        if (showMiniCalendar) {
            navigate(`${calendarPath}?date=${dateKey}`);
            setIsOpen(false);
        }
    };

    const goMiniToday = () => {
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        setMiniCalendarDate(new Date(now.getFullYear(), now.getMonth(), 1));
        setMiniSelectedDateKey(todayKey);

        if (showMiniCalendar) {
            openCalendarOnDate(todayKey);
        }
    };

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
                                {isAdmin ? (
                                    <>
                                        <button className={`sidebar-link ${isAdminDashboardView && adminTab === 'overview' ? 'active' : ''}`} onClick={() => navigate('/admin?tab=overview')}>
                                            <span className="icon">📊</span> Overview
                                        </button>
                                        <button className={`sidebar-link ${isAdminDashboardView && adminTab === 'teachers' ? 'active' : ''}`} onClick={() => navigate('/admin?tab=teachers')}>
                                            <span className="icon">👨‍🏫</span> Faculty
                                        </button>
                                        <button className={`sidebar-link ${isAdminDashboardView && adminTab === 'students' ? 'active' : ''}`} onClick={() => navigate('/admin?tab=students')}>
                                            <span className="icon">👨‍🎓</span> Students
                                        </button>
                                        <button className={`sidebar-link ${isAdminDashboardView && adminTab === 'subjects' ? 'active' : ''}`} onClick={() => navigate('/admin?tab=subjects')}>
                                            <span className="icon">📚</span> Subjects
                                        </button>
                                        <button className={`sidebar-link ${isAdminDashboardView && adminTab === 'holidays' ? 'active' : ''}`} onClick={() => navigate('/admin?tab=holidays')}>
                                            <span className="icon">🎉</span> Holidays
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button className={`sidebar-link ${location.pathname === dashboardPath && !isTestsView ? 'active' : ''}`} onClick={() => navigate(dashboardPath)}>
                                            <span className="icon">📚</span> My Subjects
                                        </button>
                                        {isFaculty && (
                                            <button className={`sidebar-link ${isTeacherHolidaysView ? 'active' : ''}`} onClick={() => navigate('/teacher/holidays')}>
                                                <span className="icon">🎉</span> Holidays
                                            </button>
                                        )}
                                        {isStudent && (
                                            <button className={`sidebar-link ${isTestsView ? 'active' : ''}`} onClick={() => navigate('/student?tab=tests')}>
                                                <span className="icon">📝</span> My Tests
                                            </button>
                                        )}
                                    </>
                                )}
                                <button className={`sidebar-link ${location.pathname === notificationsPath ? 'active' : ''}`} onClick={() => navigate(notificationsPath)}>
                                    <span className="icon">🔔</span> Notifications
                                </button>
                                {showMiniCalendar && (
                                    <button className={`sidebar-link ${(isStudentCalendarView || isTeacherCalendarView) ? 'active' : ''}`} onClick={() => navigate(calendarPath)}>
                                        <span className="icon">📅</span> Calendar
                                    </button>
                                )}
                                {/* Add generic placeholders for future global features if needed */}
                            </>
                        ) : (
                            // Context-Aware Subject Links
                            <>
                                {showMiniCalendar && (
                                    <button
                                        className={`sidebar-link ${(isStudentCalendarView || isTeacherCalendarView) ? 'active' : ''}`}
                                        onClick={() => {
                                            navigate(calendarPath);
                                            setIsOpen(false);
                                        }}
                                    >
                                        <span className="icon">📅</span> Calendar
                                    </button>
                                )}

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

                    {showMiniCalendar && (
                        <div
                            style={{
                                margin: '0.55rem 0.45rem 0',
                                padding: '0.58rem',
                                border: '1px solid var(--border)',
                                borderRadius: '14px',
                                background: 'var(--bg-card-hover)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem', marginBottom: '0.38rem' }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {miniCalendar.monthLabel}
                                </div>
                                <button className="btn btn-ghost btn-sm" type="button" onClick={goMiniToday} style={{ padding: '0.12rem 0.34rem', minWidth: 'unset', fontSize: '0.62rem' }}>
                                    Today
                                </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) minmax(0, 0.95fr) 18px', alignItems: 'center', gap: '0.2rem', marginBottom: '0.38rem', width: '100%' }}>
                                <button className="btn btn-ghost btn-sm" type="button" onClick={goMiniPrevMonth} style={{ width: '18px', height: '18px', minWidth: '18px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', lineHeight: 1 }}>‹</button>
                                <select
                                    className="input"
                                    value={miniCalendar.month}
                                    onChange={(event) => changeMiniMonth(Number(event.target.value))}
                                    style={{ width: '100%', minWidth: 0, maxWidth: '100%', padding: '0.2rem 0.24rem', fontSize: '0.72rem', lineHeight: 1.1 }}
                                >
                                    {monthOptions.map((name, monthIndex) => (
                                        <option key={name} value={monthIndex}>{name}</option>
                                    ))}
                                </select>
                                <select
                                    className="input"
                                    value={miniCalendar.year}
                                    onChange={(event) => changeMiniYear(Number(event.target.value))}
                                    style={{ width: '100%', minWidth: 0, maxWidth: '100%', padding: '0.2rem 0.28rem', fontSize: '0.72rem', lineHeight: 1.1 }}
                                >
                                    {yearOptions.map((year) => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                                <button className="btn btn-ghost btn-sm" type="button" onClick={goMiniNextMonth} style={{ width: '18px', height: '18px', minWidth: '18px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', lineHeight: 1 }}>›</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.14rem', textAlign: 'center' }}>
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
                                    <div key={`week-${label}-${index}`} style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                                        {label}
                                    </div>
                                ))}

                                {miniCalendar.cells.map((cell) => (
                                    <button
                                        key={cell.key}
                                        type="button"
                                        onClick={() => {
                                            if (cell.dateKey) openCalendarOnDate(cell.dateKey);
                                        }}
                                        disabled={!cell.value}
                                        style={{
                                            minHeight: '1.08rem',
                                            fontSize: '0.64rem',
                                            borderRadius: '999px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: cell.isSelected ? 'var(--accent)' : 'transparent',
                                            color: cell.isSelected ? '#fff' : 'var(--text-primary)',
                                            fontWeight: cell.isToday ? 800 : 500,
                                            border: 'none',
                                            cursor: cell.value ? 'pointer' : 'default',
                                            opacity: cell.value ? 1 : 0.45,
                                        }}
                                    >
                                        {cell.value || ''}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
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
                                    onError={() => setAvatarLoadErrorFor(avatarUrl)}
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
