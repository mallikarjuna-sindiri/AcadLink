import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let intervalId;
        loadNotifications();
        intervalId = setInterval(loadNotifications, 15000);

        return () => clearInterval(intervalId);
    }, []);

    const loadNotifications = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/notifications/', { params: { limit: 100 } });
            setNotifications(Array.isArray(res.data) ? res.data : []);
        } catch {
            toast.error('Failed to load notifications');
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    };

    const iconForType = (type) => {
        const map = {
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

    return (
        <div className="app-shell">
            <Sidebar />
            <div className="page-content">
                <div className="page-header">
                    <div className="page-title-group">
                        <h1 className="page-title gradient-text">Notifications</h1>
                        <p className="page-subtitle">All updates across your subjects</p>
                    </div>
                    <button className="btn btn-outline" onClick={loadNotifications}>
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
                                        <span className="notification-time">{formatTimeAgo(n.created_at)}</span>
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
