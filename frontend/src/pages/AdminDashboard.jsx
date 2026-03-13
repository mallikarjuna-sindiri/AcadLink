/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');
    const [showCreateTeacher, setShowCreateTeacher] = useState(false);
    const [form, setForm] = useState({ name: '', email: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        try {
            const [statsRes, teachersRes, studentsRes, subjectsRes] = await Promise.all([
                api.get('/api/admin/dashboard'),
                api.get('/api/admin/teachers'),
                api.get('/api/admin/students'),
                api.get('/api/admin/subjects'),
            ]);
            setStats(statsRes.data);
            setTeachers(teachersRes.data);
            setStudents(studentsRes.data);
            setSubjects(subjectsRes.data);
        } catch (err) {
            toast.error('Failed to load dashboard data');
        }
    };

    const createTeacher = async (e) => {
        e.preventDefault();
        if (!form.name || !form.email) {
            toast.error('Name and email are required');
            return;
        }
        setLoading(true);
        try {
            await api.post('/api/admin/create-teacher', form);
            toast.success(`Faculty account created for ${form.email}`);
            setForm({ name: '', email: '' });
            setShowCreateTeacher(false);
            loadDashboard();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create faculty');
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async (userId, currentStatus) => {
        try {
            await api.patch(`/api/admin/user/${userId}/toggle-status`);
            toast.success(`User ${currentStatus ? 'deactivated' : 'activated'}`);
            loadDashboard();
        } catch {
            toast.error('Failed to update user status');
        }
    };

    const deleteTeacher = async (id) => {
        if (!confirm('Delete this faculty account?')) return;
        try {
            await api.delete(`/api/admin/teacher/${id}`);
            toast.success('Faculty deleted');
            loadDashboard();
        } catch {
            toast.error('Failed to delete faculty');
        }
    };

    const deleteSubject = async (subject) => {
        if (!confirm(`Delete subject "${subject.name}" (${subject.subject_code})? This cannot be undone.`)) return;
        try {
            await api.delete(`/api/admin/subject/${subject.id}`);
            toast.success('Subject deleted');
            loadDashboard();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to delete subject');
        }
    };

    const TABS = [
        { id: 'overview', label: '📊 Overview' },
        { id: 'teachers', label: `👨‍🏫 Faculty (${teachers.length})` },
        { id: 'students', label: `👨‍🎓 Students (${students.length})` },
        { id: 'subjects', label: `📚 Subjects (${subjects.length})` },
    ];

    return (
        <div className="app-shell">
            <Sidebar />
            <div className="page-content">
                {/* Header */}
                <div className="page-header">
                    <div className="page-title-group">
                        <h1 className="page-title gradient-text">Admin Dashboard</h1>
                        <p className="page-subtitle">System-wide overview & management</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowCreateTeacher(true)}>
                        + Add Faculty
                    </button>
                </div>

                {/* Tabs */}
                <div className="tabs">
                    {TABS.map(tab => (
                        <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Overview */}
                {activeTab === 'overview' && stats && (
                    <div className="animate-fade">
                        <div className="grid-4 mb-4">
                            {[
                                { label: 'Total Users', value: stats.total_users, icon: '👥', cls: 'indigo' },
                                { label: 'Faculty', value: stats.total_teachers, icon: '👨‍🏫', cls: 'purple' },
                                { label: 'Students', value: stats.total_students, icon: '👨‍🎓', cls: 'teal' },
                                { label: 'Subjects', value: stats.total_subjects, icon: '📚', cls: 'amber' },
                                { label: 'Enrollments', value: stats.total_enrollments, icon: '🔗', cls: 'green' },
                            ].map(s => (
                                <div key={s.label} className="stat-card">
                                    <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                                    <div>
                                        <div className="stat-value">{s.value}</div>
                                        <div className="stat-label">{s.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="card">
                            <h3 style={{ marginBottom: '0.75rem' }}>🔔 System Info</h3>
                            <p className="text-sm text-muted">
                                Faculty can only be created by Admin. Students auto-register via Google OAuth.
                                All users must have <strong>@vnrvjiet.in</strong> email addresses.
                            </p>
                        </div>
                    </div>
                )}

                {/* Faculty */}
                {activeTab === 'teachers' && (
                    <div className="animate-fade">
                        {teachers.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">👨‍🏫</div>
                                <h3>No faculty yet</h3>
                                <p>Click "Add Faculty" to create a faculty account.</p>
                            </div>
                        ) : (
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Faculty</th>
                                            <th>Email</th>
                                            <th>Status</th>
                                            <th>Created</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teachers.map(t => (
                                            <tr key={t.id}>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        {t.picture ? (
                                                            <img src={t.picture} alt={t.name} className="avatar avatar-sm" />
                                                        ) : (
                                                            <div className="avatar avatar-sm avatar-placeholder">{t.name?.[0]}</div>
                                                        )}
                                                        <span className="font-bold">{t.name}</span>
                                                    </div>
                                                </td>
                                                <td className="text-sm text-muted">{t.email}</td>
                                                <td>
                                                    <span className={`badge ${t.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                                        {t.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="text-xs text-muted">
                                                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                                                </td>
                                                <td>
                                                    <div className="flex gap-1">
                                                        <button className="btn btn-outline btn-sm"
                                                            onClick={() => toggleStatus(t.id, t.is_active)}>
                                                            {t.is_active ? 'Deactivate' : 'Activate'}
                                                        </button>
                                                        <button className="btn btn-danger btn-sm"
                                                            onClick={() => deleteTeacher(t.id)}>
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Students */}
                {activeTab === 'students' && (
                    <div className="animate-fade">
                        {students.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">👨‍🎓</div>
                                <h3>No students yet</h3>
                                <p>Students register automatically when they login with their college email.</p>
                            </div>
                        ) : (
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr><th>Student</th><th>Email</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
                                    </thead>
                                    <tbody>
                                        {students.map(s => (
                                            <tr key={s.id}>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        {s.picture ? (
                                                            <img src={s.picture} alt={s.name} className="avatar avatar-sm" />
                                                        ) : (
                                                            <div className="avatar avatar-sm avatar-placeholder">{s.name?.[0]}</div>
                                                        )}
                                                        <span className="font-bold">{s.name}</span>
                                                    </div>
                                                </td>
                                                <td className="text-sm text-muted">{s.email}</td>
                                                <td>
                                                    <span className={`badge ${s.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                                        {s.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="text-xs text-muted">
                                                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                                                </td>
                                                <td>
                                                    <button className="btn btn-outline btn-sm"
                                                        onClick={() => toggleStatus(s.id, s.is_active)}>
                                                        {s.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Subjects */}
                {activeTab === 'subjects' && (
                    <div className="animate-fade">
                        {subjects.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">📚</div>
                                <h3>No subjects created yet</h3>
                                <p>Faculty create subjects from their dashboard.</p>
                            </div>
                        ) : (
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr><th>Subject</th><th>Code</th><th>Year / Sem / Branch</th><th>Faculty</th><th>Students</th><th>Created</th><th>Action</th></tr>
                                    </thead>
                                    <tbody>
                                        {subjects.map(s => (
                                            <tr key={s.id}>
                                                <td className="font-bold">{s.name}</td>
                                                <td><span className="font-mono" style={{ color: 'var(--accent-light)' }}>{s.subject_code}</span></td>
                                                <td className="text-sm text-muted">{s.year} · Sem {s.semester} · {s.branch}</td>
                                                <td className="text-sm">{s.teacher_name}</td>
                                                <td><span className="badge badge-student">{s.student_count} enrolled</span></td>
                                                <td className="text-xs text-muted">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                                                <td>
                                                    <button className="btn btn-danger btn-sm" onClick={() => deleteSubject(s)}>
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Create Faculty Modal */}
            {showCreateTeacher && (
                <div className="modal-overlay" onClick={() => setShowCreateTeacher(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">➕ Create Faculty Account</span>
                            <button className="modal-close" onClick={() => setShowCreateTeacher(false)}>✕</button>
                        </div>
                        <form onSubmit={createTeacher}>
                            <div className="modal-body">
                                <div className="alert alert-info">
                                    The faculty member will login using Google OAuth with this email.
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Full Name</label>
                                    <input className="form-input" placeholder="Dr. John Doe" value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">College Email</label>
                                    <input className="form-input" type="email" placeholder="teacher@vnrvjiet.in"
                                        value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })} required />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowCreateTeacher(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? <><span className="spinner" /> Creating…</> : 'Create Faculty'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
