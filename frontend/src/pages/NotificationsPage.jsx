import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const latestTimestampRef = useRef('');
    const lastFullSyncAtRef = useRef(0);

    useEffect(() => {
        latestTimestampRef.current = notifications[0]?.created_at || '';
    }, [notifications]);

    useEffect(() => {
        let intervalId;
        loadNotifications({ incremental: false, showLoader: true });
        intervalId = setInterval(() => {
            const shouldDoFullSync = Date.now() - lastFullSyncAtRef.current > 30000;
            loadNotifications({ incremental: !shouldDoFullSync, showLoader: false });
        }, 3000);

        return () => clearInterval(intervalId);
    }, []);

    const loadNotifications = async ({ incremental = false, showLoader = false } = {}) => {
        if (showLoader) setLoading(true);

        const latestTimestamp = latestTimestampRef.current;
        const params = incremental
            ? { since: latestTimestamp, limit: 50 }
            : { limit: 30 };

        try {
            const res = await api.get('/api/notifications/', { params });
            const incoming = Array.isArray(res.data) ? res.data : [];

            if (!incremental) {
                setNotifications(incoming);
                lastFullSyncAtRef.current = Date.now();
                return;
            }

            if (incoming.length === 0) return;

            setNotifications((prev) => {
                const existingIds = new Set(prev.map((n) => n.id));
                const fresh = incoming.filter((n) => !existingIds.has(n.id));
                if (fresh.length === 0) return prev;
                const merged = [...fresh, ...prev];
                merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
                return merged.slice(0, 150);
            });
        } catch {
            if (!incremental) {
                toast.error('Failed to load notifications');
                setNotifications([]);
            }
        } finally {
            if (showLoader) setLoading(false);
        }
    };

    const iconForType = (type) => {
        const map = {
            subject: '📚',
            join: '✅',
            material: '📄',
            assignment: '📝',
            test: '🧠',
            chat: '💬',
        };
        return map[type] || '🔔';
    };

    const labelForType = (type) => {
        const map = {
            subject: 'Subject',
            join: 'Joined',
            material: 'Material',
            assignment: 'Assignment',
            test: 'Test',
            chat: 'Chat',
        };
        return map[type] || 'Update';
    };

    const formatDateTime = (isoTime) => {
        if (!isoTime) return '—';
        const date = new Date(isoTime);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString();
    };

    const formatTimeAgo = (isoTime) => {
        if (!isoTime) return '';
        const date = new Date(isoTime);
        if (Number.isNaN(date.getTime())) return '';
        const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    const tabForType = (type) => {
        const map = {
            material: 'materials',
            assignment: 'assignments',
            test: 'tests',
            chat: 'chat',
            join: 'members',
        };
        return map[type] || 'materials';
    };

    const getNotificationTarget = (notification) => {
        const role = user?.role;
        const subjectId = notification?.subject_id;
        if (!subjectId) return null;
        if (role !== 'student' && role !== 'teacher') return null;

        const tab = tabForType(notification?.type);
        const teacherTab = tab === 'performance' ? 'materials' : tab;
        const studentTab = tab === 'members' ? 'materials' : tab;

        const resolvedTab = role === 'teacher' ? teacherTab : studentTab;
        return `/${role}/subject/${subjectId}?tab=${resolvedTab}`;
    };

    return (
        <div className="app-shell">
            <Sidebar />
            <div className="page-content">
                <div className="page-header">
                    <div className="page-title-group">
                        <h1 className="page-title gradient-text">Notifications</h1>
                        <p className="page-subtitle">Live updates across your subjects</p>
                    </div>
                    <button className="btn btn-outline" onClick={() => loadNotifications({ incremental: false, showLoader: true })}>
                        Refresh
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center" style={{ padding: '4rem 0' }}>
                        <div className="spinner spinner-lg" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🔔</div>
                        <h3>No notifications yet</h3>
                        <p>When updates happen in your subjects, they will appear here.</p>
                    </div>
                ) : (
                    <div className="card animate-fade notifications-shell">
                        <div className="notifications-list">
                            {notifications.map((n) => (
                                <div key={n.id} className="notification-item">
                                    <div className="notification-top-row">
                                        <div className="notification-title-wrap">
                                            <span className="notification-icon">{iconForType(n.type)}</span>
                                            <span className="notification-title">{n.title}</span>
                                            <span className="notification-type">{labelForType(n.type)}</span>
                                        </div>
                                        <div className="notification-actions">
                                            <span className="notification-time">{formatTimeAgo(n.created_at)}</span>
                                            {getNotificationTarget(n) && (
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => navigate(getNotificationTarget(n))}
                                                >
                                                    Open
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="notification-message">{n.message}</div>
                                    <div className="notification-meta">
                                        <span className="notification-subject">{n.subject_name || 'Subject'}</span>
                                        <span>•</span>
                                        <span>{formatDateTime(n.created_at)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {user?.role && (
                    <div className="text-xs text-muted mt-3" style={{ opacity: 0.8 }}>
                        Logged in as {user.role}
                    </div>
                )}
            </div>
        </div>
    );
}
