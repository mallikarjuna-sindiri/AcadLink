/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';

export default function StudentDashboard() {
    const navigate = useNavigate();
    const [subjects, setSubjects] = useState([]);
    const [showQR, setShowQR] = useState(null);
    const [joinCode, setJoinCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [showJoin, setShowJoin] = useState(false);

    useEffect(() => {
        loadSubjects();
        const params = new URLSearchParams(window.location.search);
        const code = params.get('joinCode');
        if (code) {
            setJoinCode(code.toUpperCase());
            setShowJoin(true);

            // Clean up the URL so reloads don't keep opening it
            window.history.replaceState({}, document.title, '/student');
        }
    }, []);

    const loadSubjects = async () => {
        setFetching(true);
        try {
            const res = await api.get('/api/subjects/joined');
            setSubjects(res.data);
        } catch {
            toast.error('Failed to load subjects');
        } finally {
            setFetching(false);
        }
    };

    const joinSubject = async (e) => {
        e.preventDefault();
        if (!joinCode.trim()) { toast.error('Enter a subject code'); return; }
        setJoining(true);
        try {
            const res = await api.post('/api/subjects/join', { subject_code: joinCode.trim().toUpperCase() });
            toast.success(res.data.message);
            setJoinCode('');
            setShowJoin(false);
            loadSubjects();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to join subject');
        } finally {
            setJoining(false);
        }
    };

    const autoJoinSubject = async (subjectCode) => {
        toast.loading('Joining subject...', { id: 'auto-join' });
        try {
            const res = await api.post('/api/subjects/join', { subject_code: subjectCode });
            toast.success(res.data.message, { id: 'auto-join' });
            navigate(`/student/subject/${res.data.subject_id}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to auto-join subject', { id: 'auto-join' });
            loadSubjects();
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
                        <p className="page-subtitle">Access your enrolled subjects and study materials</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowJoin(true)}>
                        + Join Subject
                    </button>
                </div>

                {/* Subject Grid */}
                {fetching ? (
                    <div className="flex justify-center" style={{ padding: '4rem 0' }}>
                        <div className="spinner spinner-lg" />
                    </div>
                ) : subjects.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📚</div>
                        <h3>No subjects joined yet</h3>
                        <p>Ask your faculty for the subject code or QR code, then click "Join Subject".</p>
                        <button className="btn btn-primary mt-3" onClick={() => setShowJoin(true)}>+ Join Subject</button>
                    </div>
                ) : (
                    <div className="grid-2 animate-fade">
                        {subjects.map(s => (
                            <div key={s.id} className="subject-card card-interactive"
                                onClick={() => navigate(`/student/subject/${s.id}`)}>
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
                                    {s.teacher_picture ? (
                                        <div className="flex items-center gap-2">
                                            <img src={s.teacher_picture} alt={s.teacher_name} className="avatar avatar-sm" />
                                            <span className="text-sm text-muted">{s.teacher_name}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="avatar avatar-sm avatar-placeholder">{s.teacher_name?.[0]}</div>
                                            <span className="text-sm text-muted">{s.teacher_name}</span>
                                        </div>
                                    )}
                                    <span className="text-xs text-muted">
                                        {s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}
                                    </span>
                                </div>
                            </div>
                        ))}
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

            {/* Join Subject Modal */}
            {showJoin && (
                <div className="modal-overlay" onClick={() => setShowJoin(false)}>
                    <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">🔗 Join Subject</span>
                            <button className="modal-close" onClick={() => setShowJoin(false)}>✕</button>
                        </div>
                        <form onSubmit={joinSubject}>
                            <div className="modal-body">
                                <div className="alert alert-info">
                                    Enter the subject code provided by your faculty.
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Subject Code</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. ABC1234"
                                        value={joinCode}
                                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                        style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '0.15em', textAlign: 'center' }}
                                        maxLength={7}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowJoin(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={joining}>
                                    {joining ? <><span className="spinner" /> Joining…</> : '🔗 Join'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
