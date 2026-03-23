import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';

const YEARS = ['BTech-I', 'BTech-II', 'BTech-III', 'BTech-IV'];
const SEMESTERS = ['I', 'II'];
const BRANCHES = ['CSE', 'CSBS', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT'];

export default function TeacherDashboard() {
    const navigate = useNavigate();
    const [subjects, setSubjects] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [showQR, setShowQR] = useState(null);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [form, setForm] = useState({ name: '', year: 'BTech-I', semester: 'I', branch: 'CSE' });

    useEffect(() => {
        loadSubjects();
    }, []);

    const loadSubjects = async () => {
        setFetching(true);
        try {
            const res = await api.get('/api/subjects/my');
            setSubjects(res.data);
        } catch {
            toast.error('Failed to load subjects');
        } finally {
            setFetching(false);
        }
    };

    const createSubject = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { toast.error('Subject name is required'); return; }
        setLoading(true);
        try {
            const res = await api.post('/api/subjects/', form);
            toast.success(`Subject created! Code: ${res.data.subject_code}`);
            setForm({ name: '', year: 'BTech-I', semester: 'I', branch: 'CSE' });
            setShowCreate(false);
            loadSubjects();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create subject');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="app-shell">
            <Sidebar />
            <div className="page-content">
                {/* Header */}
                <div className="page-header">
                    <div className="page-title-group">
                        <h1 className="page-title gradient-text">My Subjects</h1>
                        <p className="page-subtitle">Create and manage your classroom groups</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        + Create Subject
                    </button>
                </div>

                {/* Subjects Grid */}
                {fetching ? (
                    <div className="flex justify-center" style={{ padding: '4rem 0' }}>
                        <div className="spinner spinner-lg" />
                    </div>
                ) : subjects.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📚</div>
                        <h3>No subjects yet</h3>
                        <p>Create your first subject to start adding students and content.</p>
                        <button className="btn btn-primary mt-3" onClick={() => setShowCreate(true)}>+ Create Subject</button>
                    </div>
                ) : (
                    <div className="grid-2 animate-fade">
                        {subjects.map(s => (
                            <div key={s.id} className="subject-card card-interactive" onClick={() => navigate(`/teacher/subject/${s.id}`)}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="subject-code">{s.subject_code}</span>
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={e => { e.stopPropagation(); setShowQR(s); }}
                                    >QR</button>
                                </div>
                                <div className="subject-name">{s.name}</div>
                                <div className="subject-meta">
                                    <span>📅 {s.year}</span>
                                    <span>·</span>
                                    <span>🗓 Sem {s.semester}</span>
                                    <span>·</span>
                                    <span>🏫 {s.branch}</span>
                                </div>
                                <div className="flex items-center justify-between mt-3">
                                    <span className="badge badge-student">👥 {s.student_count} students</span>
                                    <span className="text-xs text-muted">
                                        {s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Subject Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">📚 Create New Subject</span>
                            <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
                        </div>
                        <form onSubmit={createSubject}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Subject Name</label>
                                    <input className="form-input" placeholder="e.g. Data Structures" value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Year</label>
                                        <select className="form-select" value={form.year}
                                            onChange={e => setForm({ ...form, year: e.target.value })}>
                                            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Semester</label>
                                        <select className="form-select" value={form.semester}
                                            onChange={e => setForm({ ...form, semester: e.target.value })}>
                                            {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Branch</label>
                                    <select className="form-select" value={form.branch}
                                        onChange={e => setForm({ ...form, branch: e.target.value })}>
                                        {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div className="alert alert-info">
                                    A unique subject code and QR code will be generated automatically.
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? <><span className="spinner" /> Creating…</> : '✨ Create Subject'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* QR Code Modal */}
            {showQR && (
                <div className="modal-overlay" onClick={() => setShowQR(null)}>
                    <div className="modal" style={{ maxWidth: '380px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">QR Code — {showQR.name}</span>
                            <button className="modal-close" onClick={() => setShowQR(null)}>✕</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                            {showQR.qr_code ? (
                                <img src={showQR.qr_code} alt="QR Code" className="qr-img" style={{ width: 200, height: 200 }} />
                            ) : (
                                <div className="text-muted">QR not available</div>
                            )}
                            <div>
                                <p className="text-xs text-muted mb-1">Subject Code</p>
                                <p className="font-mono font-bold" style={{ fontSize: '1.4rem', color: 'var(--accent-light)', letterSpacing: '0.1em' }}>
                                    {showQR.subject_code}
                                </p>
                            </div>
                            <button className="btn btn-outline btn-sm" onClick={() => {
                                navigator.clipboard.writeText(showQR.subject_code);
                                toast.success('Code copied!');
                            }}>📋 Copy Code</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
