/* eslint-disable react-hooks/exhaustive-deps, no-empty */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import { getAvatarFallback } from '../utils/avatar';

export default function TeacherSubjectDetail() {
    const { subjectId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [subject, setSubject] = useState(null);
    const [activeTab, setActiveTab] = useState('materials');
    const [loading, setLoading] = useState(true);

    // Materials
    const [materials, setMaterials] = useState([]);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    // Assignments
    const [assignments, setAssignments] = useState([]);
    const [showAssignForm, setShowAssignForm] = useState(false);
    const [assignForm, setAssignForm] = useState({ title: '', description: '', deadline_date: '', deadline_time: '', max_marks: 10 });
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [submissions, setSubmissions] = useState([]);

    // MCQ
    const [tests, setTests] = useState([]);
    const [showTestForm, setShowTestForm] = useState(false);
    const [testForm, setTestForm] = useState({ title: '', time_limit_minutes: 30, questions: [] });
    const [newQuestion, setNewQuestion] = useState({ question_text: '', options: ['', '', '', ''], correct_answer: 0 });
    const [selectedTest, setSelectedTest] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [watchVideoUrl, setWatchVideoUrl] = useState(null);

    // Members
    const [members, setMembers] = useState([]);
    const [removingStudentId, setRemovingStudentId] = useState(null);

    // Chat
    const [messages, setMessages] = useState([]);
    const [chatMsg, setChatMsg] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);
    const chatEndRef = useRef(null);
    const chatPollRef = useRef(null);
    const chatLastSentAtRef = useRef(null);

    useEffect(() => {
        setMessages([]);
        chatLastSentAtRef.current = null;
        loadAll();
    }, [subjectId]);

    useEffect(() => {
        if (activeTab === 'chat') {
            loadChat(true);
            chatPollRef.current = setInterval(() => loadChat(false), 3000);
        } else {
            clearInterval(chatPollRef.current);
        }
        return () => clearInterval(chatPollRef.current);
    }, [activeTab]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [subRes, matRes, asgRes, testRes, memRes] = await Promise.all([
                api.get(`/api/subjects/${subjectId}`),
                api.get(`/api/subjects/${subjectId}/materials/`),
                api.get(`/api/subjects/${subjectId}/assignments/`),
                api.get(`/api/subjects/${subjectId}/tests/`),
                api.get(`/api/subjects/${subjectId}/members`),
            ]);
            setSubject(subRes.data);
            setMaterials(matRes.data);
            setAssignments(asgRes.data);
            setTests(testRes.data);
            setMembers(memRes.data);
        } catch {
            toast.error('Failed to load subject data');
        } finally {
            setLoading(false);
        }
    };

    const loadChat = async (forceInitial = false) => {
        try {
            const params = {};
            if (!forceInitial && chatLastSentAtRef.current) {
                params.since = chatLastSentAtRef.current;
            } else {
                params.limit = 120;
            }

            const res = await api.get(`/api/subjects/${subjectId}/chat/`, { params });
            const incoming = Array.isArray(res.data) ? res.data : [];
            if (incoming.length === 0) return;

            chatLastSentAtRef.current = incoming[incoming.length - 1]?.sent_at || chatLastSentAtRef.current;

            setMessages(prev => {
                if (forceInitial || prev.length === 0) return incoming;
                const existing = new Set(prev.map(m => m.id));
                const fresh = incoming.filter(m => !existing.has(m.id));
                if (fresh.length === 0) return prev;
                return [...prev, ...fresh];
            });
        } catch { }
    };

    // ── Upload Material ───────────────────────────────────────────
    const uploadMaterial = async (e) => {
        e.preventDefault();
        if (!uploadFile || !uploadTitle) { toast.error('Title and file required'); return; }
        setUploading(true);
        const fd = new FormData();
        fd.append('title', uploadTitle);
        fd.append('file', uploadFile);
        try {
            await api.post(`/api/subjects/${subjectId}/materials/`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Material uploaded');
            setUploadTitle(''); setUploadFile(null);
            const res = await api.get(`/api/subjects/${subjectId}/materials/`);
            setMaterials(res.data);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const deleteMaterial = async (id) => {
        if (!confirm('Delete this material?')) return;
        try {
            await api.delete(`/api/subjects/${subjectId}/materials/${id}`);
            toast.success('Deleted');
            setMaterials(prev => prev.filter(m => m.id !== id));
        } catch { toast.error('Delete failed'); }
    };

    const downloadMaterial = async (material) => {
        try {
            const res = await api.get(
                `/api/subjects/${subjectId}/materials/${material.id}/download`,
                { responseType: 'blob' }
            );
            const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = material.file_name || `${material.title || 'material'}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch {
            toast.error('Failed to download material');
        }
    };

    // ── Assignment ────────────────────────────────────────────────
    const createAssignment = async (e) => {
        e.preventDefault();

        if (!assignForm.deadline_date || !assignForm.deadline_time) {
            toast.error('Please select both deadline date and time');
            return;
        }

        const deadline = `${assignForm.deadline_date}T${assignForm.deadline_time}:00`;

        try {
            await api.post(`/api/subjects/${subjectId}/assignments/`, {
                title: assignForm.title,
                description: assignForm.description,
                deadline,
                max_marks: assignForm.max_marks,
            });
            toast.success('Assignment created');
            setAssignForm({ title: '', description: '', deadline_date: '', deadline_time: '', max_marks: 10 });
            setShowAssignForm(false);
            const res = await api.get(`/api/subjects/${subjectId}/assignments/`);
            setAssignments(res.data);
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    };

    const loadSubmissions = async (assignmentId) => {
        try {
            const res = await api.get(`/api/subjects/${subjectId}/assignments/${assignmentId}/submissions`);
            setSubmissions(res.data);
            setSelectedAssignment(assignmentId);
        } catch { toast.error('Failed to load submissions'); }
    };

    const gradeSubmission = async (assignmentId, submissionId, marks, max) => {
        const m = parseInt(prompt(`Marks out of ${max}:`));
        if (isNaN(m) || m < 0 || m > max) { toast.error(`Enter marks between 0 and ${max}`); return; }
        const fb = prompt('Feedback (optional):') || '';
        try {
            await api.patch(`/api/subjects/${subjectId}/assignments/${assignmentId}/submissions/${submissionId}/grade`,
                { marks_obtained: m, feedback: fb });
            toast.success('Graded!');
            loadSubmissions(assignmentId);
        } catch { toast.error('Grading failed'); }
    };

    // ── MCQ ──────────────────────────────────────────────────────
    const addQuestion = () => {
        const opts = newQuestion.options.filter(o => o.trim());
        if (!newQuestion.question_text.trim() || opts.length < 2) {
            toast.error('Question text and at least 2 options required');
            return;
        }
        setTestForm(prev => ({ ...prev, questions: [...prev.questions, newQuestion] }));
        setNewQuestion({ question_text: '', options: ['', '', '', ''], correct_answer: 0 });
        toast.success('Question added');
    };

    const createTest = async (e) => {
        e.preventDefault();
        if (testForm.questions.length === 0) { toast.error('Add at least one question'); return; }
        try {
            await api.post(`/api/subjects/${subjectId}/tests/`, testForm);
            toast.success('Test created!');
            setTestForm({ title: '', time_limit_minutes: 30, questions: [] });
            setShowTestForm(false);
            const res = await api.get(`/api/subjects/${subjectId}/tests/`);
            setTests(res.data);
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    };

    const loadAttempts = async (testId) => {
        try {
            const res = await api.get(`/api/subjects/${subjectId}/tests/${testId}/attempts`);
            setAttempts(res.data);
            setSelectedTest(testId);
        } catch { toast.error('Failed to load attempts'); }
    };

    const removeMember = async (studentId, studentName) => {
        if (!confirm(`Remove ${studentName} from this subject?`)) return;
        setRemovingStudentId(studentId);
        try {
            await api.delete(`/api/subjects/${subjectId}/members/${studentId}`);
            setMembers(prev => prev.filter(m => m.student_id !== studentId));
            setSubject(prev => prev ? { ...prev, student_count: Math.max((prev.student_count || 0) - 1, 0) } : prev);
            toast.success('Student removed from subject');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to remove student');
        } finally {
            setRemovingStudentId(null);
        }
    };

    // ── Chat ─────────────────────────────────────────────────────
    const sendMessage = async (e) => {
        e.preventDefault();
        const message = chatMsg.trim();
        if (!message || sendingMsg) return;
        setSendingMsg(true);
        setChatMsg('');
        try {
            const res = await api.post(`/api/subjects/${subjectId}/chat/`, { message });
            setMessages(prev => [...prev, res.data]);
            chatLastSentAtRef.current = res.data?.sent_at || chatLastSentAtRef.current;
        } catch (err) {
            let delivered = false;
            try {
                const recentRes = await api.get(`/api/subjects/${subjectId}/chat/`, { params: { limit: 20 } });
                const recent = Array.isArray(recentRes.data) ? recentRes.data : [];
                delivered = recent.some((m) => m.sender_id === user?.id && m.message === message);
                if (delivered && recent.length > 0) {
                    chatLastSentAtRef.current = recent[recent.length - 1]?.sent_at || chatLastSentAtRef.current;
                    setMessages(prev => {
                        const existing = new Set(prev.map(m => m.id));
                        const fresh = recent.filter(m => !existing.has(m.id));
                        return fresh.length ? [...prev, ...fresh] : prev;
                    });
                }
            } catch { }

            if (!delivered) {
                setChatMsg(message);
                toast.error(err?.response?.data?.detail || 'Failed to send');
            }
        } finally { setSendingMsg(false); }
    };

    const handleChatInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!sendingMsg && chatMsg.trim()) {
                e.currentTarget.form?.requestSubmit();
            }
        }
    };

    const parseChatDate = (isoTime) => {
        if (!isoTime) return new Date('');
        const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoTime);
        const normalized = hasTimezone ? isoTime : `${isoTime}Z`;
        return new Date(normalized);
    };

    const getDateKey = (isoTime) => {
        const date = parseChatDate(isoTime);
        if (Number.isNaN(date.getTime())) return '';
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    };

    const getOrdinalDay = (day) => {
        if (day > 3 && day < 21) return `${day}th`;
        switch (day % 10) {
            case 1: return `${day}st`;
            case 2: return `${day}nd`;
            case 3: return `${day}rd`;
            default: return `${day}th`;
        }
    };

    const formatChatDayLabel = (isoTime) => {
        const date = parseChatDate(isoTime);
        if (Number.isNaN(date.getTime())) return '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const target = new Date(date);
        target.setHours(0, 0, 0, 0);

        if (target.getTime() === today.getTime()) return 'Today';
        if (target.getTime() === yesterday.getTime()) return 'Yesterday';

        const month = date.toLocaleString('en-US', { month: 'short' });
        return `${getOrdinalDay(date.getDate())} ${month}, ${date.getFullYear()}`;
    };

    const buildChatTimeline = (items) => {
        const timeline = [];
        let lastDateKey = '';

        items.forEach((message) => {
            const dateKey = getDateKey(message.sent_at);
            if (dateKey && dateKey !== lastDateKey) {
                timeline.push({
                    type: 'separator',
                    id: `sep-${dateKey}`,
                    label: formatChatDayLabel(message.sent_at),
                });
                lastDateKey = dateKey;
            }
            timeline.push({ type: 'message', payload: message });
        });

        return timeline;
    };

    const fileTypeIcon = (t) => ({ pdf: '📄', ppt: '📊', doc: '📝', video: '🎬' }[t] || '📁');
    const fileTypeBadge = (t) => `badge badge-${t}`;
    const formatBytes = (b) => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

    const TABS = [
        { id: 'materials', icon: '📂', label: 'Materials' },
        { id: 'assignments', icon: '📝', label: `Assignments (${assignments.length})` },
        { id: 'tests', icon: '🧠', label: `MCQ Tests (${tests.length})` },
        { id: 'members', icon: '👥', label: `Members (${members.length})` },
        { id: 'chat', icon: '💬', label: 'Chat' },
    ];

    if (loading) return (
        <div className="app-shell">
            <Sidebar />
            <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
                <div className="spinner spinner-lg" />
            </div>
        </div>
    );

    return (
        <div className="app-shell">
            <Sidebar
                subject={subject}
                subjectTabs={TABS}
                activeTab={activeTab}
                onTabSelect={setActiveTab}
            />
            <div className="page-content">
                {/* Subject Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div className="flex justify-between items-center mb-3">
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher')} style={{ padding: 0 }}>
                            ← Back to Dashboard
                        </button>
                    </div>
                    {subject && (
                        <div className="card" style={{ padding: '1rem 1.5rem', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(20,184,166,0.06))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <div className="flex items-baseline gap-3">
                                    <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{subject.name}</h1>
                                    <div className="subject-code" style={{ fontSize: '0.9rem', color: 'var(--accent)' }}>{subject.subject_code}</div>
                                </div>
                                <div className="subject-meta mt-1" style={{ fontSize: '0.75rem' }}>
                                    <span>📅 {subject.year}</span>
                                    <span>·</span>
                                    <span>🗓 Sem {subject.semester}</span>
                                    <span>·</span>
                                    <span>🏫 {subject.branch}</span>
                                    <span>·</span>
                                    <span>👥 {subject.student_count} students</span>
                                </div>
                            </div>
                            <button className="btn btn-outline btn-sm" onClick={() => {
                                navigator.clipboard.writeText(subject.subject_code);
                                toast.success('Code copied!');
                            }}>📋 Copy Code</button>
                        </div>
                    )}
                </div>


                {/* ── MATERIALS ──────────────────────────────────────────── */}
                {activeTab === 'materials' && (
                    <div className="animate-fade">
                        {/* Upload form */}
                        <div className="card mb-4">
                            <h3 className="mb-3">📤 Upload Material</h3>
                            <form onSubmit={uploadMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Title</label>
                                    <input className="form-input" placeholder="e.g. Unit 1 Notes" value={uploadTitle}
                                        onChange={e => setUploadTitle(e.target.value)} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">File (PDF, PPT, DOC, Video)</label>
                                    <input className="form-input" type="file"
                                        accept=".pdf,.ppt,.pptx,.doc,.docx,.mp4,.webm,.avi,.mov"
                                        onChange={e => setUploadFile(e.target.files[0])} required
                                        style={{ padding: '0.4rem 0.9rem', cursor: 'pointer' }} />
                                </div>
                                <button type="submit" className="btn btn-teal" disabled={uploading} style={{ alignSelf: 'flex-start' }}>
                                    {uploading ? <><span className="spinner" /> Uploading…</> : '📤 Upload'}
                                </button>
                            </form>
                        </div>

                        {/* Material list */}
                        {materials.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">📂</div><p>No materials uploaded yet</p></div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {materials.map(m => (
                                    <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.2rem' }}>
                                        <span style={{ fontSize: '1.5rem' }}>{fileTypeIcon(m.content_type)}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="font-bold truncate">{m.title}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={fileTypeBadge(m.content_type)}>{m.content_type?.toUpperCase()}</span>
                                                <span className="text-xs text-muted">{formatBytes(m.file_size || 0)}</span>
                                                <span className="text-xs text-muted">{m.uploaded_at ? new Date(m.uploaded_at).toLocaleDateString() : ''}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="btn btn-outline btn-sm" onClick={() => downloadMaterial(m)}>
                                                ⬇ Download
                                            </button>
                                            <button className="btn btn-danger btn-sm" onClick={() => deleteMaterial(m.id)}>🗑</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── ASSIGNMENTS ─────────────────────────────────────────── */}
                {activeTab === 'assignments' && (
                    <div className="animate-fade">
                        <div className="flex justify-between items-center mb-3">
                            <h3>Assignments</h3>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowAssignForm(true)}>+ New Assignment</button>
                        </div>

                        {assignments.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">📝</div><p>No assignments created yet</p></div>
                        ) : (
                            <div className="grid-2">
                                {assignments.map(a => (
                                    <div key={a.id} className="card">
                                        <h3 style={{ marginBottom: '0.4rem' }}>{a.title}</h3>
                                        <p className="text-sm text-muted mb-3">{a.description}</p>
                                        <div className="flex items-center gap-3 text-xs text-muted mb-3">
                                            <span>⏰ Due: {a.deadline ? new Date(a.deadline).toLocaleString() : 'No deadline'}</span>
                                            <span>📊 Max: {a.max_marks} marks</span>
                                        </div>
                                        <button className="btn btn-outline btn-sm" onClick={() => loadSubmissions(a.id)}>
                                            View Submissions
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Submissions panel */}
                        {selectedAssignment && (
                            <div className="card mt-4">
                                <div className="flex justify-between items-center mb-3">
                                    <h3>Submissions</h3>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedAssignment(null)}>✕ Close</button>
                                </div>
                                {submissions.length === 0 ? (
                                    <p className="text-muted text-sm">No submissions yet</p>
                                ) : (
                                    <div className="table-wrapper">
                                        <table>
                                            <thead>
                                                <tr><th>Student</th><th>Submitted</th><th>Answer</th><th>Marks</th><th>Action</th></tr>
                                            </thead>
                                            <tbody>
                                                {submissions.map(s => {
                                                    const maxMarks = assignments.find(a => a.id === selectedAssignment)?.max_marks || 10;
                                                    return (
                                                        <tr key={s.id}>
                                                            <td>{s.student_name}</td>
                                                            <td className="text-xs text-muted">{new Date(s.submitted_at).toLocaleString()}</td>
                                                            <td className="text-sm">{s.text_answer || (s.file_name ? `📎 ${s.file_name}` : '—')}</td>
                                                            <td>
                                                                {s.marks_obtained !== null && s.marks_obtained !== undefined
                                                                    ? <span className="badge badge-active">{s.marks_obtained}/{maxMarks}</span>
                                                                    : <span className="badge badge-inactive">Not graded</span>}
                                                            </td>
                                                            <td>
                                                                <button className="btn btn-primary btn-sm"
                                                                    onClick={() => gradeSubmission(selectedAssignment, s.id, s.marks_obtained, maxMarks)}>
                                                                    Grade
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── MCQ TESTS ───────────────────────────────────────────── */}
                {activeTab === 'tests' && (
                    <div className="animate-fade">
                        <div className="flex justify-between items-center mb-3">
                            <h3>MCQ Tests</h3>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowTestForm(true)}>+ Create Test</button>
                        </div>

                        {tests.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">🧠</div><p>No tests created yet</p></div>
                        ) : (
                            <div className="grid-2">
                                {tests.map(t => (
                                    <div key={t.id} className="card">
                                        <h3 style={{ marginBottom: '0.3rem' }}>{t.title}</h3>
                                        <div className="flex gap-3 text-xs text-muted mb-3">
                                            <span>⏱ {t.time_limit_minutes} min</span>
                                            <span>❓ {t.question_count} questions</span>
                                        </div>
                                        <button className="btn btn-outline btn-sm" onClick={() => loadAttempts(t.id)}>View Results</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Attempts panel */}
                        {selectedTest && (
                            <div className="card mt-4">
                                <div className="flex justify-between items-center mb-3">
                                    <h3>Test Results</h3>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTest(null)}>✕ Close</button>
                                </div>
                                {attempts.length === 0 ? (
                                    <p className="text-muted text-sm">No students have attempted this test yet</p>
                                ) : (
                                    <div className="table-wrapper">
                                        <table>
                                            <thead>
                                                <tr><th>Student</th><th>Score</th><th>Percentage</th><th>Submitted</th><th>Recording</th></tr>
                                            </thead>
                                            <tbody>
                                                {attempts.map((a, i) => (
                                                    <tr key={i}>
                                                        <td>{a.student_name}</td>
                                                        <td className="font-bold">{a.score}/{a.total_questions}</td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div style={{ width: 80 }}>
                                                                    <div className="progress-bar">
                                                                        <div className="progress-fill green" style={{ width: `${a.percentage}%` }} />
                                                                    </div>
                                                                </div>
                                                                <span className="text-sm">{a.percentage}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="text-xs text-muted">{new Date(a.submitted_at).toLocaleString()}</td>
                                                        <td>
                                                            {a.recording_url ? (
                                                                <button className="btn btn-outline btn-sm hover:bg-accent"
                                                                    onClick={() => setWatchVideoUrl(`http://${window.location.hostname}:8000${a.recording_url}`)}>
                                                                    🎥 Watch
                                                                </button>
                                                            ) : (
                                                                <span className="text-xs text-muted">No recording</span>
                                                            )}
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
                )}

                {/* ── MEMBERS ─────────────────────────────────────────────── */}
                {activeTab === 'members' && (
                    <div className="animate-fade">
                        <h3 className="mb-3">Enrolled Students ({members.length})</h3>
                        {members.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">👥</div>
                                <p>No students enrolled yet. Share the subject code or QR for them to join.</p>
                            </div>
                        ) : (
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr><th>#</th><th>Student</th><th>Email</th><th>Joined</th><th>Action</th></tr>
                                    </thead>
                                    <tbody>
                                        {members.map((m, i) => (
                                            <tr key={m.student_id}>
                                                <td className="text-muted text-sm">{i + 1}</td>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        {m.student_picture ? (
                                                            <img src={m.student_picture} alt={m.student_name} className="avatar avatar-sm" />
                                                        ) : (
                                                            <div
                                                                className="avatar avatar-sm avatar-placeholder"
                                                                style={{ background: getAvatarFallback(m.student_name).background }}
                                                            >
                                                                {getAvatarFallback(m.student_name).initial}
                                                            </div>
                                                        )}
                                                        <span className="font-bold">{m.student_name}</span>
                                                    </div>
                                                </td>
                                                <td className="text-sm text-muted">{m.student_email}</td>
                                                <td className="text-xs text-muted">{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}</td>
                                                <td>
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => removeMember(m.student_id, m.student_name)}
                                                        disabled={removingStudentId === m.student_id}
                                                    >
                                                        {removingStudentId === m.student_id ? 'Removing…' : 'Remove'}
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

                {/* ── CHAT ────────────────────────────────────────────────── */}
                {activeTab === 'chat' && (
                    <div className="animate-fade">
                        <div className="chat-container">
                            <div className="chat-messages">
                                {messages.length === 0 && (
                                    <div className="empty-state" style={{ flex: 1 }}>
                                        <p>No messages yet. Start the conversation!</p>
                                    </div>
                                )}
                                {buildChatTimeline(messages).map((item) => {
                                    if (item.type === 'separator') {
                                        return (
                                            <div key={item.id} style={{ display: 'flex', justifyContent: 'center', margin: '0.4rem 0' }}>
                                                <span className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)' }}>
                                                    {item.label}
                                                </span>
                                            </div>
                                        );
                                    }

                                    const m = item.payload;
                                    const isMe = m.sender_id === user?.id;
                                    return (
                                        <div key={m.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '50%' }}>
                                            {!isMe && (
                                                <div className="flex items-center gap-1 mb-1">
                                                    {m.sender_picture ? (
                                                        <img src={m.sender_picture} className="avatar-sm" style={{ borderRadius: '50%', width: 18, height: 18 }} />
                                                    ) : (
                                                        <div
                                                            className="avatar avatar-sm avatar-placeholder"
                                                            style={{
                                                                width: 18,
                                                                height: 18,
                                                                fontSize: '0.55rem',
                                                                background: getAvatarFallback(m.sender_name).background,
                                                            }}
                                                        >
                                                            {getAvatarFallback(m.sender_name).initial}
                                                        </div>
                                                    )}
                                                    <span className="text-xs text-muted">{m.sender_name}</span>
                                                    <span className={`badge badge-${m.sender_role}`} style={{ fontSize: '0.6rem' }}>
                                                        {m.sender_role === 'teacher' ? 'FACULTY' : String(m.sender_role || '').toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`chat-bubble ${isMe ? 'mine' : 'other'}`}>
                                                {m.message}
                                                <div className="chat-meta">{parseChatDate(m.sent_at).toLocaleTimeString()}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <form className="chat-input-bar" onSubmit={sendMessage}>
                                <input className="chat-input" placeholder="Type a message…"
                                    value={chatMsg} onChange={e => setChatMsg(e.target.value)} onKeyDown={handleChatInputKeyDown} />
                                <button type="submit" className="btn btn-primary btn-sm" disabled={sendingMsg || !chatMsg.trim()}>
                                    Send
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Assignment Modal */}
            {
                showAssignForm && (
                    <div className="modal-overlay" onClick={() => setShowAssignForm(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <span className="modal-title">📝 Create Assignment</span>
                                <button className="modal-close" onClick={() => setShowAssignForm(false)}>✕</button>
                            </div>
                            <form onSubmit={createAssignment}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Title</label>
                                        <input className="form-input" placeholder="Assignment title" value={assignForm.title}
                                            onChange={e => setAssignForm({ ...assignForm, title: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Description</label>
                                        <textarea className="form-textarea" placeholder="Assignment description…" value={assignForm.description}
                                            onChange={e => setAssignForm({ ...assignForm, description: e.target.value })} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Deadline Date</label>
                                            <input className="form-input" type="date" value={assignForm.deadline_date}
                                                onChange={e => setAssignForm({ ...assignForm, deadline_date: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Deadline Time</label>
                                            <input className="form-input" type="time" value={assignForm.deadline_time}
                                                onChange={e => setAssignForm({ ...assignForm, deadline_time: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Max Marks</label>
                                            <input className="form-input" type="number" min="1" value={assignForm.max_marks}
                                                onChange={e => setAssignForm({ ...assignForm, max_marks: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-outline" onClick={() => setShowAssignForm(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Create MCQ Test Modal */}
            {
                showTestForm && (
                    <div className="modal-overlay" onClick={() => setShowTestForm(false)}>
                        <div className="modal" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <span className="modal-title">🧠 Create MCQ Test</span>
                                <button className="modal-close" onClick={() => setShowTestForm(false)}>✕</button>
                            </div>
                            <form onSubmit={createTest}>
                                <div className="modal-body">
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Test Title</label>
                                            <input className="form-input" placeholder="e.g. Unit 1 Quiz" value={testForm.title}
                                                onChange={e => setTestForm({ ...testForm, title: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Time Limit (min)</label>
                                            <input className="form-input" type="number" min="1" value={testForm.time_limit_minutes}
                                                onChange={e => setTestForm({ ...testForm, time_limit_minutes: parseInt(e.target.value) })} />
                                        </div>
                                    </div>

                                    {/* Question builder */}
                                    <div className="card" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <h4 className="mb-2">Add Question</h4>
                                        <div className="form-group mb-2">
                                            <label className="form-label">Question</label>
                                            <input className="form-input" placeholder="Enter question text" value={newQuestion.question_text}
                                                onChange={e => setNewQuestion({ ...newQuestion, question_text: e.target.value })} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                            {newQuestion.options.map((opt, i) => (
                                                <div key={i} className="form-group">
                                                    <label className="form-label">Option {String.fromCharCode(65 + i)}</label>
                                                    <input className="form-input" placeholder={`Option ${String.fromCharCode(65 + i)}`} value={opt}
                                                        onChange={e => {
                                                            const opts = [...newQuestion.options];
                                                            opts[i] = e.target.value;
                                                            setNewQuestion({ ...newQuestion, options: opts });
                                                        }} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="form-group mb-2">
                                            <label className="form-label">Correct Answer</label>
                                            <select className="form-select" value={newQuestion.correct_answer}
                                                onChange={e => setNewQuestion({ ...newQuestion, correct_answer: parseInt(e.target.value) })}>
                                                {['A', 'B', 'C', 'D'].map((l, i) => <option key={i} value={i}>Option {l}</option>)}
                                            </select>
                                        </div>
                                        <button type="button" className="btn btn-teal btn-sm" onClick={addQuestion}>+ Add Question</button>
                                    </div>

                                    {/* Added questions list */}
                                    {testForm.questions.length > 0 && (
                                        <div>
                                            <p className="text-sm text-muted mb-1">{testForm.questions.length} question(s) added:</p>
                                            {testForm.questions.map((q, i) => (
                                                <div key={i} className="mcq-question-card mb-2">
                                                    <p className="text-sm font-bold">{i + 1}. {q.question_text}</p>
                                                    <p className="text-xs text-muted mt-1">Correct: Option {String.fromCharCode(65 + q.correct_answer)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-outline" onClick={() => setShowTestForm(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={testForm.questions.length === 0}>
                                        ✨ Create Test ({testForm.questions.length} Q)
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
            {/* Watch Recording Modal */}
            {
                watchVideoUrl && (
                    <div className="modal-overlay" onClick={() => setWatchVideoUrl(null)}>
                        <div className="modal" style={{ maxWidth: '800px', width: '100%', padding: '1rem' }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <span className="modal-title">🎥 Proctoring Recording</span>
                                <button className="modal-close" onClick={() => setWatchVideoUrl(null)}>✕</button>
                            </div>
                            <div className="modal-body" style={{ padding: 0, marginTop: '1rem', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                                <video src={watchVideoUrl} controls autoPlay style={{ width: '100%', maxHeight: '70vh', display: 'block' }} />
                            </div>
                            <div className="modal-footer" style={{ marginTop: '1rem' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setWatchVideoUrl(null)}>Close</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
