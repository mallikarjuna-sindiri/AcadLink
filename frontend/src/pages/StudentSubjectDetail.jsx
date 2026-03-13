/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps, no-empty */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function StudentSubjectDetail() {
    const { subjectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const allowedTabs = new Set(['materials', 'assignments', 'tests', 'performance', 'chat']);
    const requestedTab = new URLSearchParams(location.search).get('tab');
    const initialTab = allowedTabs.has(requestedTab) ? requestedTab : 'materials';

    const [subject, setSubject] = useState(null);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [loading, setLoading] = useState(true);

    // Materials
    const [materials, setMaterials] = useState([]);

    // Assignments
    const [assignments, setAssignments] = useState([]);
    const [mySubmissions, setMySubmissions] = useState({});
    const [submitForm, setSubmitForm] = useState({ assignmentId: null, textAnswer: '', file: null });
    const [submitting, setSubmitting] = useState(false);

    // MCQ Test & Proctoring
    const [tests, setTests] = useState([]);
    const [activeTest, setActiveTest] = useState(null);
    const [testQuestions, setTestQuestions] = useState([]);
    const [myAnswers, setMyAnswers] = useState([]);
    const [myAttempts, setMyAttempts] = useState({});
    const [timer, setTimer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const timerRef = useRef(null);
    const [submittingTest, setSubmittingTest] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [isExamFullscreen, setIsExamFullscreen] = useState(false);

    // Chat
    const [messages, setMessages] = useState([]);
    const [chatMsg, setChatMsg] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);
    const chatEndRef = useRef(null);
    const chatPollRef = useRef(null);
    const chatLastSentAtRef = useRef(null);

    // Proctoring State
    const [escCount, setEscCount] = useState(0);
    const videoRef = useRef(null);
    const activeTestRef = useRef(null); // to access in event listener
    const escCountRef = useRef(0);
    const streamRef = useRef(null);

    const recorderRef = useRef(null);
    const screenStreamRef = useRef(null);
    const chunksRef = useRef([]);

    // Keep refs in sync for event listeners
    useEffect(() => { activeTestRef.current = activeTest; }, [activeTest]);
    useEffect(() => { escCountRef.current = escCount; }, [escCount]);

    useEffect(() => {
        const nextTab = new URLSearchParams(location.search).get('tab');
        if (!nextTab) return;
        if (allowedTabs.has(nextTab) && nextTab !== activeTab) {
            setActiveTab(nextTab);
        }
        navigate(location.pathname, { replace: true });
    }, [location.search, location.pathname]);
    const answersRef = useRef([]);
    useEffect(() => { answersRef.current = myAnswers; }, [myAnswers]);

    const requestExamFullscreen = async () => {
        try {
            await document.documentElement.requestFullscreen();
            setIsExamFullscreen(true);
        } catch {
            setIsExamFullscreen(!!document.fullscreenElement);
        }
    };

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

    // Timer countdown
    useEffect(() => {
        if (timeLeft > 0 && activeTest) {
            timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0 && activeTest) {
            handleSubmitTest();
        }
        return () => clearTimeout(timerRef.current);
    }, [timeLeft, activeTest]);

    // Fullscreen Monitor
    useEffect(() => {
        const handleFullscreenChange = () => {
            const inFullscreen = !!document.fullscreenElement;
            if (activeTestRef.current) {
                setIsExamFullscreen(inFullscreen);
            }

            if (activeTestRef.current && !inFullscreen) {
                const currentCount = escCountRef.current + 1;
                setEscCount(currentCount);
                if (currentCount >= 3) {
                    toast.error('❌ Exam auto-submitted due to multiple full-screen exits.', { duration: 6000 });
                    handleSubmitTest();
                } else {
                    toast.error('⚠️ Warning: You exited full screen. Return to full screen immediately.', { duration: 5000 });
                    setTimeout(() => {
                        if (activeTestRef.current && !document.fullscreenElement) {
                            requestExamFullscreen();
                        }
                    }, 200);
                }
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [subRes, matRes, asgRes, testRes] = await Promise.all([
                api.get(`/api/subjects/${subjectId}`),
                api.get(`/api/subjects/${subjectId}/materials/`),
                api.get(`/api/subjects/${subjectId}/assignments/`),
                api.get(`/api/subjects/${subjectId}/tests/`),
            ]);
            setSubject(subRes.data);
            setMaterials(matRes.data);
            setAssignments(asgRes.data);
            setTests(testRes.data);

            const subs = {};
            for (const a of asgRes.data) {
                try {
                    const r = await api.get(`/api/subjects/${subjectId}/assignments/${a.id}/my-submission`);
                    subs[a.id] = r.data;
                } catch { }
            }
            setMySubmissions(subs);

            const atts = {};
            for (const t of testRes.data) {
                try {
                    const r = await api.get(`/api/subjects/${subjectId}/tests/${t.id}/my-attempt`);
                    atts[t.id] = r.data;
                } catch { }
            }
            setMyAttempts(atts);
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

    // ── Submit Assignment ─────────────────────────────────────────
    const handleSubmitAssignment = async (assignmentId) => {
        if (!submitForm.textAnswer.trim() && !submitForm.file) {
            toast.error('Enter a text answer or upload a file');
            return;
        }
        setSubmitting(true);
        const fd = new FormData();
        fd.append('text_answer', submitForm.textAnswer);
        if (submitForm.file) fd.append('file', submitForm.file);
        try {
            await api.post(`/api/subjects/${subjectId}/assignments/${assignmentId}/submit`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Assignment submitted!');
            setSubmitForm({ assignmentId: null, textAnswer: '', file: null });
            const r = await api.get(`/api/subjects/${subjectId}/assignments/${assignmentId}/my-submission`);
            setMySubmissions(prev => ({ ...prev, [assignmentId]: r.data }));
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Submission failed');
        } finally {
            setSubmitting(false);
        }
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

    // ── Start MCQ Test (Proctored) ────────────────────────────────
    const startTest = async (test) => {
        try {
            // 1. Request Screen Recording (Compressed)
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'monitor',
                    width: { max: 1280 },
                    height: { max: 720 },
                    frameRate: { max: 10 }
                }
            });
            screenStreamRef.current = screenStream;

            // 2. Request Camera and Microphone for PiP
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;

            // 3. Start MediaRecorder with low bitrate
            chunksRef.current = [];
            const mediaRecorder = new MediaRecorder(screenStream, {
                mimeType: 'video/webm',
                videoBitsPerSecond: 250000 // 250 kbps
            });
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorderRef.current = mediaRecorder;
            mediaRecorder.start();

            // 4. Request Full Screen
            await requestExamFullscreen();

            // 5. Load Test
            const res = await api.get(`/api/subjects/${subjectId}/tests/${test.id}`);
            const questions = res.data.questions || [];
            setActiveTest(test);
            setTestQuestions(questions);
            setMyAnswers(new Array(questions.length).fill(-1));
            setTimeLeft(test.time_limit_minutes * 60);
            setTestResult(null);
            setEscCount(0);
            setIsExamFullscreen(!!document.fullscreenElement);

            // Connect video feed
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            }, 500);

            toast.success('Exam started! Screen & Camera recording active.');
        } catch (err) {
            console.error(err);
            toast.error('You must allow Screen Share, Camera & Full Screen to take the exam.');
            if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            setIsExamFullscreen(false);
        }
    };

    const handleSubmitTest = async () => {
        if (!activeTestRef.current) return;
        const testIdToSubmit = activeTestRef.current.id;
        const answersToSubmit = answersRef.current.map(a => a === -1 ? 0 : a);

        setSubmittingTest(true);
        clearTimeout(timerRef.current);

        const uploadData = async (videoBlob) => {
            try {
                const res = await api.post(`/api/subjects/${subjectId}/tests/${testIdToSubmit}/attempt`, {
                    answers: answersToSubmit
                });

                const attemptId = res.data.attempt_id;

                setTestResult(res.data);
                setMyAttempts(prev => ({ ...prev, [testIdToSubmit]: { attempted: true, ...res.data } }));
                toast.success(`Exam submitted securely! Score: ${res.data.score}/${res.data.total}`);

                // Immediately clean up UI and streams so student isn't blocked
                if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
                if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
                if (document.fullscreenElement) document.exitFullscreen().catch(() => { });

                setActiveTest(null);
                setIsExamFullscreen(false);
                setSubmittingTest(false);

                // Background upload screen share recording
                if (videoBlob && attemptId) {
                    toast.loading('Uploading screen recording...', { id: 'vid-upload' });
                    const fd = new FormData();
                    fd.append('file', videoBlob, 'recording.webm');
                    await api.post(`/api/subjects/${subjectId}/tests/${testIdToSubmit}/attempts/${attemptId}/recording`, fd);
                    toast.success('Exam recording uploaded successfully!', { id: 'vid-upload' });
                }
            } catch (err) {
                toast.error(err.response?.data?.detail || 'Submission failed');
                setActiveTest(null);
                setIsExamFullscreen(false);
                setSubmittingTest(false);
            }
        };

        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                uploadData(blob);
            };
            recorderRef.current.stop();
        } else {
            uploadData(null);
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

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const fileTypeIcon = (t) => ({ pdf: '📄', ppt: '📊', doc: '📝', video: '🎬' }[t] || '📁');
    const formatBytes = (b) => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

    const TABS = [
        { id: 'materials', icon: '📂', label: 'Materials' },
        { id: 'assignments', icon: '📝', label: `Assignments (${assignments.length})` },
        { id: 'tests', icon: '🧠', label: `Tests (${tests.length})` },
        { id: 'performance', icon: '📊', label: 'Performance' },
        { id: 'chat', icon: '💬', label: 'Doubts' },
    ];

    if (loading) return (
        <div className="app-shell">
            <Sidebar />
            <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
                <div className="spinner spinner-lg" />
            </div>
        </div>
    );

    // ── Active MCQ Test View ──────────────────────────────────────
    if (activeTest) {
        return (
            <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '2rem', color: '#fff' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto', position: 'relative' }}>

                    {/* Proctoring Header */}
                    <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span style={{ color: '#fb7185', fontWeight: 'bold' }}>🔴 Proctoring Active</span>
                            <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '4px' }}>Camera, microphone, and fullscreen monitoring enabled</div>
                            {!isExamFullscreen && (
                                <div style={{ marginTop: '0.5rem' }}>
                                    <button className="btn btn-danger btn-sm" onClick={requestExamFullscreen}>
                                        Return to Fullscreen
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className={`timer ${timeLeft < 60 ? 'animate-pulse' : ''}`} style={{ fontSize: '1.5rem', fontWeight: 900, color: timeLeft < 60 ? '#fb7185' : '#fff' }}>
                            ⏱ {formatTime(timeLeft)}
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <h2 style={{ fontSize: '1.8rem' }}>{activeTest.title}</h2>
                        <button className="btn btn-primary" onClick={handleSubmitTest} disabled={submittingTest}>
                            {submittingTest ? <><span className="spinner" /> Submitting…</> : 'Submit Exam'}
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '4rem' }}>
                        {!isExamFullscreen && (
                            <div className="alert alert-error" style={{ marginBottom: '0.5rem' }}>
                                Fullscreen is required to answer questions. Click "Return to Fullscreen" to continue.
                            </div>
                        )}
                        {testQuestions.map((q, qi) => (
                            <div key={qi} className="mcq-question-card animate-fade" style={{ background: '#171717', border: '1px solid #333' }}>
                                <p className="font-bold mb-3" style={{ fontSize: '1.05rem' }}>
                                    Q{qi + 1}. {q.question_text}
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {q.options.map((opt, oi) => (
                                        opt && (
                                            <div key={oi} className={`mcq-option ${myAnswers[qi] === oi ? 'selected' : ''}`}
                                                style={{ border: myAnswers[qi] === oi ? '1px solid var(--accent)' : '1px solid #444', background: myAnswers[qi] === oi ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                                                onClick={() => {
                                                    if (!isExamFullscreen) {
                                                        toast.error('Return to full screen to answer.');
                                                        return;
                                                    }
                                                    const updated = [...myAnswers];
                                                    updated[qi] = oi;
                                                    setMyAnswers(updated);
                                                }}>
                                                <div className="mcq-option-letter">{String.fromCharCode(65 + oi)}</div>
                                                {opt}
                                            </div>
                                        )
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Floating WebCam */}
                    <div style={{
                        position: 'fixed',
                        bottom: '2rem',
                        right: '2rem',
                        width: '220px',
                        height: '150px',
                        background: '#000',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        border: '2px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.8)'
                    }}>
                        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                        <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} /> Live
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/student')} style={{ padding: 0 }}>
                            ← Back to Dashboard
                        </button>
                    </div>
                    {subject && (
                        <div className="card" style={{ padding: '1rem 1.5rem', background: 'linear-gradient(135deg, rgba(20,184,166,0.08), rgba(99,102,241,0.06))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <div className="flex items-baseline gap-3">
                                    <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{subject.name}</h1>
                                    <div className="subject-code" style={{ fontSize: '0.9rem', color: 'var(--teal)' }}>{subject.subject_code}</div>
                                </div>
                                <div className="subject-meta mt-1" style={{ fontSize: '0.75rem' }}>
                                    <span>📅 {subject.year}</span>
                                    <span>·</span>
                                    <span>🗓 Sem {subject.semester}</span>
                                    <span>·</span>
                                    <span>🏫 {subject.branch}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {subject.teacher_picture ? (
                                    <img src={subject.teacher_picture} alt={subject.teacher_name} className="avatar avatar-sm" style={{ width: 28, height: 28 }} />
                                ) : (
                                    <div className="avatar avatar-sm avatar-placeholder" style={{ width: 28, height: 28, fontSize: '0.8rem' }}>{subject.teacher_name?.[0]}</div>
                                )}
                                <span className="text-sm text-muted"><strong>{subject.teacher_name}</strong></span>
                            </div>
                        </div>
                    )}
                </div>


                {/* ── MATERIALS ─────────────────────────────────────────── */}
                {activeTab === 'materials' && (
                    <div className="animate-fade">
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
                                                <span className={`badge badge-${m.content_type}`}>{m.content_type?.toUpperCase()}</span>
                                                <span className="text-xs text-muted">{formatBytes(m.file_size || 0)}</span>
                                                <span className="text-xs text-muted">{m.uploaded_at ? new Date(m.uploaded_at).toLocaleDateString() : ''}</span>
                                            </div>
                                        </div>
                                        <button className="btn btn-teal btn-sm" onClick={() => downloadMaterial(m)}>
                                            ⬇ Download
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── ASSIGNMENTS ──────────────────────────────────────── */}
                {activeTab === 'assignments' && (
                    <div className="animate-fade">
                        {assignments.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">📝</div><p>No assignments posted yet</p></div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {assignments.map(a => {
                                    const mySub = mySubmissions[a.id];
                                    const isPast = a.deadline && new Date(a.deadline) < new Date();
                                    return (
                                        <div key={a.id} className="card">
                                            <div className="flex justify-between items-start flex-wrap gap-2">
                                                <div>
                                                    <h3>{a.title}</h3>
                                                    <p className="text-sm text-muted mt-1">{a.description}</p>
                                                    <div className="flex gap-3 text-xs text-muted mt-2">
                                                        <span>⏰ Due: {a.deadline ? new Date(a.deadline).toLocaleString() : 'No deadline'}</span>
                                                        <span>📊 Max: {a.max_marks} marks</span>
                                                    </div>
                                                </div>
                                                {mySub?.submitted ? (
                                                    <div className="text-right">
                                                        <span className="badge badge-active">✓ Submitted</span>
                                                        {mySub.marks_obtained !== null && mySub.marks_obtained !== undefined && (
                                                            <div className="mt-1">
                                                                <span className="font-bold" style={{ color: 'var(--green)' }}>
                                                                    {mySub.marks_obtained}/{a.max_marks} marks
                                                                </span>
                                                                {mySub.feedback && <p className="text-xs text-muted mt-1">{mySub.feedback}</p>}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : isPast ? (
                                                    <span className="badge badge-inactive">Deadline passed</span>
                                                ) : (
                                                    <button className="btn btn-primary btn-sm"
                                                        onClick={() => setSubmitForm({ assignmentId: a.id, textAnswer: '', file: null })}>
                                                        Submit
                                                    </button>
                                                )}
                                            </div>

                                            {/* Submit form inline */}
                                            {submitForm.assignmentId === a.id && (
                                                <div className="card mt-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                                    <h4 className="mb-2">Your Submission</h4>
                                                    <div className="form-group mb-2">
                                                        <label className="form-label">Text Answer</label>
                                                        <textarea className="form-textarea" placeholder="Write your answer here…"
                                                            value={submitForm.textAnswer}
                                                            onChange={e => setSubmitForm({ ...submitForm, textAnswer: e.target.value })} />
                                                    </div>
                                                    <div className="form-group mb-3">
                                                        <label className="form-label">Or Upload File</label>
                                                        <input className="form-input" type="file"
                                                            onChange={e => setSubmitForm({ ...submitForm, file: e.target.files[0] })}
                                                            style={{ padding: '0.4rem', cursor: 'pointer' }} />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button className="btn btn-primary btn-sm" disabled={submitting}
                                                            onClick={() => handleSubmitAssignment(a.id)}>
                                                            {submitting ? <><span className="spinner" /> Submitting…</> : '✓ Submit'}
                                                        </button>
                                                        <button className="btn btn-ghost btn-sm"
                                                            onClick={() => setSubmitForm({ assignmentId: null, textAnswer: '', file: null })}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── MCQ TESTS ─────────────────────────────────────────── */}
                {activeTab === 'tests' && (
                    <div className="animate-fade">
                        {/* Test result toast */}
                        {testResult && (
                            <div className="alert alert-success mb-3">
                                🎉 Test submitted! Score: <strong>{testResult.score}/{testResult.total}</strong> ({testResult.percentage}%)
                                <button className="btn btn-ghost btn-sm ml-2" onClick={() => setTestResult(null)}>✕</button>
                            </div>
                        )}
                        {tests.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">🧠</div><p>No tests available yet</p></div>
                        ) : (
                            <div className="grid-2">
                                {tests.map(t => {
                                    const attempt = myAttempts[t.id];
                                    return (
                                        <div key={t.id} className="card">
                                            <h3 style={{ marginBottom: '0.3rem' }}>{t.title}</h3>
                                            <div className="flex gap-3 text-xs text-muted mb-3">
                                                <span>⏱ {t.time_limit_minutes} min</span>
                                                <span>❓ {t.question_count} questions</span>
                                            </div>
                                            {attempt?.attempted ? (
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="score-circle">
                                                            <span style={{ fontSize: '0.85rem' }}>{attempt.score}</span>
                                                            <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>/{t.question_count}</span>
                                                        </div>
                                                        <div>
                                                            <div className="font-bold" style={{ fontSize: '1.1rem' }}>{attempt.percentage}%</div>
                                                            <div className="text-xs text-muted">Score</div>
                                                            <div className="progress-bar mt-1" style={{ width: 100 }}>
                                                                <div className="progress-fill green" style={{ width: `${attempt.percentage}%` }} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="badge badge-active mt-2">✓ Completed</span>
                                                </div>
                                            ) : (
                                                <button className="btn btn-primary btn-sm" onClick={() => startTest(t)}>
                                                    ▶ Start Test
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── PERFORMANCE ──────────────────────────────────────── */}
                {activeTab === 'performance' && (
                    <div className="animate-fade">
                        <h3 className="mb-3">My Performance</h3>
                        <div className="grid-3 mb-4">
                            {[
                                { label: 'Assignments Done', value: Object.values(mySubmissions).filter(s => s.submitted).length, total: assignments.length, icon: '📝', cls: 'indigo' },
                                { label: 'Tests Completed', value: Object.values(myAttempts).filter(a => a.attempted).length, total: tests.length, icon: '🧠', cls: 'purple' },
                                {
                                    label: 'Avg Test Score',
                                    value: (() => {
                                        const done = Object.values(myAttempts).filter(a => a.attempted);
                                        if (!done.length) return '—';
                                        return Math.round(done.reduce((s, a) => s + (a.percentage || 0), 0) / done.length) + '%';
                                    })(),
                                    total: null, icon: '📊', cls: 'teal'
                                },
                            ].map(s => (
                                <div key={s.label} className="stat-card">
                                    <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                                    <div>
                                        <div className="stat-value">{s.value}{s.total !== null ? `/${s.total}` : ''}</div>
                                        <div className="stat-label">{s.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Test scores breakdown */}
                        {tests.length > 0 && (
                            <div className="card">
                                <h4 className="mb-3">Test Scores</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {tests.map(t => {
                                        const att = myAttempts[t.id];
                                        return (
                                            <div key={t.id} className="flex items-center gap-3">
                                                <div style={{ flex: 1 }}>
                                                    <div className="text-sm font-bold">{t.title}</div>
                                                    {att?.attempted ? (
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="progress-bar" style={{ width: 150 }}>
                                                                <div className="progress-fill accent" style={{ width: `${att.percentage}%` }} />
                                                            </div>
                                                            <span className="text-xs">{att.score}/{t.question_count} ({att.percentage}%)</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted">Not attempted</span>
                                                    )}
                                                </div>
                                                {att?.attempted && (
                                                    <span className="badge" style={{ background: att.percentage >= 70 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: att.percentage >= 70 ? 'var(--green)' : 'var(--amber)' }}>
                                                        {att.percentage >= 70 ? '✓ Pass' : '⚠ Review'}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── CHAT ─────────────────────────────────────────────── */}
                {activeTab === 'chat' && (
                    <div className="animate-fade">
                        <div className="chat-container">
                            <div className="chat-messages">
                                {messages.length === 0 && (
                                    <div className="empty-state" style={{ flex: 1 }}>
                                        <p>No messages yet. Ask your doubts!</p>
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
                                                    {m.sender_picture ? <img src={m.sender_picture} style={{ borderRadius: '50%', width: 18, height: 18 }} /> : null}
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
                                <div ref={chatEndRef} />
                            </div>
                            <form className="chat-input-bar" onSubmit={sendMessage}>
                                <input className="chat-input" placeholder="Ask a doubt or message your faculty…"
                                    value={chatMsg} onChange={e => setChatMsg(e.target.value)} onKeyDown={handleChatInputKeyDown} />
                                <button type="submit" className="btn btn-primary btn-sm" disabled={sendingMsg || !chatMsg.trim()}>
                                    Send
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
