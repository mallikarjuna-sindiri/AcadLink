/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import { getAvatarFallback, getUserPicture, resolveAvatarUrl } from '../utils/avatar';

export default function AdminDashboard() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [stats, setStats] = useState(null);
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');
    const [showCreateTeacher, setShowCreateTeacher] = useState(false);
    const [form, setForm] = useState({ name: '', email: '' });
    const [loading, setLoading] = useState(false);
    const [holidayFile, setHolidayFile] = useState(null);
    const [holidayLoading, setHolidayLoading] = useState(false);
    const [holidayItems, setHolidayItems] = useState([]);
    const [brokenAvatarKeys, setBrokenAvatarKeys] = useState({});
    const yearOptions = ['2025', '2026', '2027'];
    const [selectedHolidayYear, setSelectedHolidayYear] = useState('2026');
    const [availableHolidayYears, setAvailableHolidayYears] = useState([]);
    const adminTabOptions = ['overview', 'teachers', 'students', 'subjects', 'holidays'];

    const holidayYearOptions = [...new Set([...yearOptions, ...availableHolidayYears])]
        .filter((year) => /^\d{4}$/.test(String(year)))
        .sort();

    const getHolidayYear = (item) => {
        if (item?.iso_date) return String(item.iso_date).slice(0, 4);
        const dateValue = String(item?.date || '');
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateValue)) return dateValue.slice(-4);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue.slice(0, 4);
        return '';
    };

    const sortedHolidayItems = holidayItems
        .slice()
        .sort((first, second) => {
        const parseHolidayDate = (value) => {
            const parts = String(value || '').split('-');
            if (parts.length !== 3) return Number.MAX_SAFE_INTEGER;
            const [day, month, year] = parts.map(Number);
            if (!day || !month || !year) return Number.MAX_SAFE_INTEGER;
            return new Date(year, month - 1, day).getTime();
        };
        return parseHolidayDate(first.date) - parseHolidayDate(second.date);
    });

    const getPictureUrl = (pictureValue) => resolveAvatarUrl(getUserPicture({ picture: pictureValue }));

    const hasAvatar = (key, avatarUrl) => Boolean(avatarUrl) && !brokenAvatarKeys[key];

    const markAvatarError = (key) => {
        setBrokenAvatarKeys((previous) => ({ ...previous, [key]: true }));
    };

    useEffect(() => {
        loadDashboard();
    }, []);

    useEffect(() => {
        const urlTab = searchParams.get('tab');
        if (!urlTab) {
            setActiveTab('overview');
            return;
        }
        if (adminTabOptions.includes(urlTab)) {
            setActiveTab(urlTab);
            return;
        }
        setActiveTab('overview');
    }, [searchParams]);

    const handleAdminTabChange = (tabId) => {
        setActiveTab(tabId);
        setSearchParams({ tab: tabId });
    };

    useEffect(() => {
        if (activeTab !== 'holidays') return;
        loadHolidayList(selectedHolidayYear);
    }, [activeTab, selectedHolidayYear]);

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

    const extractHolidaysFromImage = async () => {
        if (!holidayFile) {
            toast.error('Please choose a holiday list image');
            return;
        }

        setHolidayLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', holidayFile);

            const response = await api.post('/api/admin/holiday/extract-festivals', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            let nextSelectedYear = selectedHolidayYear;
            if (items.length > 0) {
                const extractedYears = [...new Set(items.map((item) => getHolidayYear(item)).filter(Boolean))];
                if (extractedYears.length > 0 && !extractedYears.includes(selectedHolidayYear)) {
                    nextSelectedYear = extractedYears[0];
                    setSelectedHolidayYear(nextSelectedYear);
                }
            }

            setHolidayItems(items);

            toast.success(`Extracted ${items.length} holidays`);
            await loadHolidayList(nextSelectedYear);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to extract holidays from image');
        } finally {
            setHolidayLoading(false);
        }
    };

    const loadHolidayList = async (year) => {
        const targetYear = year || selectedHolidayYear;
        try {
            const query = targetYear ? `?year=${targetYear}` : '';
            const response = await api.get(`/api/admin/holiday/list${query}`);
            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            const years = Array.isArray(response.data?.years)
                ? response.data.years.map((value) => String(value)).filter((value) => /^\d{4}$/.test(value))
                : [];

            setAvailableHolidayYears(years);

            setHolidayItems(items);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to load holiday list');
        }
    };

    const TABS = [
        { id: 'overview', label: '📊 Overview' },
        { id: 'teachers', label: `👨‍🏫 Faculty (${teachers.length})` },
        { id: 'students', label: `👨‍🎓 Students (${students.length})` },
        { id: 'subjects', label: `📚 Subjects (${subjects.length})` },
        { id: 'holidays', label: '🎉 Holidays' },
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
                            onClick={() => handleAdminTabChange(tab.id)}>
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
                                                        {hasAvatar(`teacher-${t.id}`, getPictureUrl(t.picture)) ? (
                                                            <img
                                                                src={getPictureUrl(t.picture)}
                                                                alt={t.name}
                                                                className="avatar avatar-sm"
                                                                onError={() => markAvatarError(`teacher-${t.id}`)}
                                                            />
                                                        ) : (
                                                            <div className="avatar avatar-sm avatar-placeholder" style={{ background: getAvatarFallback(t.name || '').background }}>
                                                                {getAvatarFallback(t.name || '').initial}
                                                            </div>
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
                                                        {hasAvatar(`student-${s.id}`, getPictureUrl(s.picture)) ? (
                                                            <img
                                                                src={getPictureUrl(s.picture)}
                                                                alt={s.name}
                                                                className="avatar avatar-sm"
                                                                onError={() => markAvatarError(`student-${s.id}`)}
                                                            />
                                                        ) : (
                                                            <div className="avatar avatar-sm avatar-placeholder" style={{ background: getAvatarFallback(s.name || '').background }}>
                                                                {getAvatarFallback(s.name || '').initial}
                                                            </div>
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

                {/* Holidays */}
                {activeTab === 'holidays' && (
                    <div className="animate-fade" style={{ display: 'grid', gap: '1rem' }}>
                        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
                            <h3 style={{ margin: 0 }}>Upload Holiday List Image</h3>
                            <p className="text-sm text-muted" style={{ margin: 0 }}>
                                Upload the holiday calendar image to extract festival names and dates.
                            </p>

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setHolidayFile(e.target.files?.[0] || null)}
                                />
                                <button className="btn btn-primary" onClick={extractHolidaysFromImage} disabled={holidayLoading}>
                                    {holidayLoading ? 'Extracting…' : 'Extract Holidays'}
                                </button>
                            </div>
                        </div>

                        <div className="table-wrapper">
                        <div className="card" style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            <label className="text-sm text-muted" style={{ minWidth: 'fit-content', fontWeight: 600 }}>Academic Year:</label>
                            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                {holidayYearOptions.map((year) => (
                                    <button
                                        key={year}
                                        type="button"
                                        className={`btn btn-sm ${selectedHolidayYear === year ? 'btn-primary' : 'btn-outline'}`}
                                        onClick={() => setSelectedHolidayYear(year)}
                                    >
                                        {year}
                                    </button>
                                ))}
                            </div>
                        </div>

                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Festival Name</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedHolidayItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="text-sm text-muted">
                                                upload the holiday list
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedHolidayItems.map((item, index) => (
                                            <tr key={`${item.date}-${item.festival}-${index}`}>
                                                <td className="font-mono">{item.date}</td>
                                                <td className="font-bold">{item.festival}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
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
