/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps, no-empty */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../api/client';
import toast from 'react-hot-toast';
import { getAvatarFallback, getUserPicture, resolveAvatarUrl } from '../utils/avatar';

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
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [visitedQuestions, setVisitedQuestions] = useState({});
    const [reviewQuestions, setReviewQuestions] = useState({});
    const [myAttempts, setMyAttempts] = useState({});
    const [timer, setTimer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const timerRef = useRef(null);
    const [submittingTest, setSubmittingTest] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [isExamFullscreen, setIsExamFullscreen] = useState(false);

    // Chat
    const [messages, setMessages] = useState([]);
    const [chatMsg, setChatMsg] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);
    const [showQrPreview, setShowQrPreview] = useState(false);
    const [avatarErrors, setAvatarErrors] = useState({});
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
    const submittingTestRef = useRef(false);
    useEffect(() => { answersRef.current = myAnswers; }, [myAnswers]);
    useEffect(() => { submittingTestRef.current = submittingTest; }, [submittingTest]);

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
        setAvatarErrors({});
        chatLastSentAtRef.current = null;
        loadAll();
    }, [subjectId]);

    const getPictureUrl = (pictureValue) => resolveAvatarUrl(getUserPicture({ picture: pictureValue }));
    const hasAvatar = (key, pictureUrl) => Boolean(pictureUrl) && !avatarErrors[key];
    const handleAvatarError = (key) => {
        setAvatarErrors((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    };

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
            setCurrentQuestionIndex(0);
            setVisitedQuestions({ 0: true });
            setReviewQuestions({});
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
        if (!activeTestRef.current || submittingTestRef.current) return;
        const testIdToSubmit = activeTestRef.current.id;
        const answersToSubmit = [...answersRef.current];

        setSubmittingTest(true);
        submittingTestRef.current = true;
        clearTimeout(timerRef.current);

        const uploadData = async (videoBlob) => {
            let submitResponse;
            try {
                submitResponse = await api.post(`/api/subjects/${subjectId}/tests/${testIdToSubmit}/attempt`, {
                    answers: answersToSubmit
                });
            } catch (err) {
                toast.error(err.response?.data?.detail || 'Submission failed');
                setActiveTest(null);
                setIsExamFullscreen(false);
                setSubmittingTest(false);
                submittingTestRef.current = false;
                return;
            }

            const attemptId = submitResponse?.data?.attempt_id;

            setTestResult(submitResponse.data);
            setMyAttempts(prev => ({ ...prev, [testIdToSubmit]: { attempted: true, ...submitResponse.data } }));
            toast.success(`Exam submitted securely! Score: ${submitResponse.data.score}/${submitResponse.data.total}`);

            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
            if (document.fullscreenElement) document.exitFullscreen().catch(() => { });

            setActiveTest(null);
            setIsExamFullscreen(false);
            setShowSubmitConfirm(false);
            setSubmittingTest(false);
            submittingTestRef.current = false;

            if (videoBlob && attemptId) {
                try {
                    toast.loading('Uploading screen recording...', { id: 'vid-upload' });
                    const fd = new FormData();
                    fd.append('file', videoBlob, 'recording.webm');
                    await api.post(`/api/subjects/${subjectId}/tests/${testIdToSubmit}/attempts/${attemptId}/recording`, fd);
                    toast.success('Exam recording uploaded successfully!', { id: 'vid-upload' });
                } catch {
                    toast.error('Exam submitted, but screen recording upload failed.', { id: 'vid-upload' });
                }
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

    const confirmAndSubmitTest = async () => {
        if (submittingTest) return;
        setShowSubmitConfirm(true);
    };

    const submitTestFromModal = async () => {
        if (submittingTest) return;
        setShowSubmitConfirm(false);
        await handleSubmitTest();
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

    const splitLongTokenWithHyphens = (token, chunkSize = 22) => {
        if (!token || token.length <= chunkSize) return token;

        const chunks = [];
        for (let start = 0; start < token.length; start += chunkSize) {
            chunks.push(token.slice(start, start + chunkSize));
        }

        return chunks.join('-\n-');
    };

    const formatChatMessage = (text = '') => {
        if (!text) return '';
        return text
            .split(/(\s+)/)
            .map((part) => (/^\s+$/.test(part) ? part : splitLongTokenWithHyphens(part)))
            .join('');
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

    const formatExamClock = (secondsLeft) => {
        const safeSeconds = Math.max(0, secondsLeft || 0);
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const seconds = safeSeconds % 60;
        return {
            hours: String(hours).padStart(2, '0'),
            minutes: String(minutes).padStart(2, '0'),
            seconds: String(seconds).padStart(2, '0'),
        };
    };

    const goToQuestion = (index) => {
        if (index < 0 || index >= testQuestions.length) return;
        setCurrentQuestionIndex(index);
        setVisitedQuestions((prev) => (prev[index] ? prev : { ...prev, [index]: true }));
    };

    const answerCurrentQuestion = (optionIndex) => {
        if (!isExamFullscreen) {
            toast.error('Return to full screen to answer.');
            return;
        }
        setMyAnswers((prev) => {
            const updated = [...prev];
            updated[currentQuestionIndex] = optionIndex;
            return updated;
        });
    };

    const toggleCurrentQuestionReview = () => {
        setReviewQuestions((prev) => ({
            ...prev,
            [currentQuestionIndex]: !prev[currentQuestionIndex],
        }));
    };

    const getQuestionStatus = (index) => {
        if (index === currentQuestionIndex) return 'current';
        if (reviewQuestions[index]) return 'review';
        if (myAnswers[index] !== -1) return 'answered';
        if (visitedQuestions[index]) return 'not-answered';
        return 'not-attempted';
    };

    const examClock = formatExamClock(timeLeft);
    const currentQuestion = testQuestions[currentQuestionIndex];
    const answeredCount = myAnswers.filter((value) => value !== -1).length;
    const reviewCount = Object.values(reviewQuestions).filter(Boolean).length;
    const notAnsweredCount = Math.max(Object.keys(visitedQuestions).length - answeredCount, 0);
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
        const unansweredCount = myAnswers.filter((answer) => answer === -1).length;
        const maxFullscreenExits = 3;
        const remainingFullscreenExits = Math.max(maxFullscreenExits - escCount, 0);
        return (
            <div className="exam-shell">
                <div className="exam-layout">
                    <section className="exam-main">
                        <header className="exam-main-header">
                            <div>
                                <h2>{activeTest.title}</h2>
                                <div className="exam-question-no-row">
                                    <p>Question {currentQuestionIndex + 1} of {testQuestions.length}</p>
                                </div>
                                <div className="exam-header-meta">
                                    <span className="exam-chip success">Answered: {answeredCount}/{testQuestions.length}</span>
                                    <span className="exam-chip warning">Review: {reviewCount}</span>
                                    <span className="exam-chip warning">Fullscreen Exits: {escCount}/{maxFullscreenExits}</span>
                                    <span className={`exam-chip ${isExamFullscreen ? 'info' : 'danger'}`}>
                                        {isExamFullscreen ? 'Fullscreen On' : 'Fullscreen Off'}
                                    </span>
                                </div>
                            </div>
                            {!isExamFullscreen && (
                                <button className="btn btn-danger btn-sm" onClick={requestExamFullscreen}>
                                    Return to Fullscreen
                                </button>
                            )}
                        </header>

                        {!isExamFullscreen && (
                            <div className="exam-warning">
                                <strong>Reason:</strong> Exam proctoring requires fullscreen mode to prevent tab/app switching.
                                <br />
                                <strong>What happens:</strong> If you exit fullscreen {maxFullscreenExits} times, the test is auto-submitted.
                                <br />
                                <strong>Status:</strong> {remainingFullscreenExits} exit{remainingFullscreenExits === 1 ? '' : 's'} remaining before auto-submit.
                            </div>
                        )}

                        {currentQuestion ? (
                            <div className="exam-question-card">
                                <div className="exam-question-title-row">
                                    <h3>
                                        Quant - Question {currentQuestionIndex + 1}
                                    </h3>
                                    <button type="button" className="exam-btn review" onClick={toggleCurrentQuestionReview}>
                                        {reviewQuestions[currentQuestionIndex] ? 'Unmark Review' : 'Mark for review'}
                                    </button>
                                </div>
                                <p className="exam-question-text">{currentQuestion.question_text}</p>
                                <div className="exam-options">
                                    {(currentQuestion.options || []).map((option, optionIndex) => (
                                        option ? (
                                            <button
                                                key={optionIndex}
                                                type="button"
                                                className={`exam-option ${myAnswers[currentQuestionIndex] === optionIndex ? 'selected' : ''}`}
                                                onClick={() => answerCurrentQuestion(optionIndex)}
                                            >
                                                <span className="exam-option-letter">{String.fromCharCode(65 + optionIndex)}.</span>
                                                <span>{option}</span>
                                            </button>
                                        ) : null
                                    ))}
                                </div>

                                <div className="exam-question-nav">
                                    <button
                                        type="button"
                                        className="exam-btn nav"
                                        disabled={currentQuestionIndex === 0}
                                        onClick={() => goToQuestion(currentQuestionIndex - 1)}
                                    >
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        className="exam-btn nav"
                                        disabled={currentQuestionIndex === testQuestions.length - 1}
                                        onClick={() => goToQuestion(currentQuestionIndex + 1)}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="exam-question-card">
                                <p className="text-sm text-muted">No questions loaded for this test.</p>
                            </div>
                        )}

                        <footer className="exam-footer">
                            <button type="button" className="exam-btn submit" onClick={confirmAndSubmitTest} disabled={submittingTest}>
                                {submittingTest ? 'Submitting…' : 'Submit Test'}
                            </button>
                        </footer>

                        <div className="exam-legend">
                            <span><i className="dot current" /> Current</span>
                            <span><i className="dot not-attempted" /> Not Attempted</span>
                            <span><i className="dot answered" /> Answered</span>
                            <span><i className="dot not-answered" /> Not Answered</span>
                            <span><i className="dot review" /> Review</span>
                        </div>
                    </section>

                    <aside className="exam-side">
                        <div className="exam-timer-card">
                            <h4>Time Left</h4>
                            <div className="exam-clock">
                                <div><strong>{examClock.hours}</strong><span>hours</span></div>
                                <div><strong>{examClock.minutes}</strong><span>minutes</span></div>
                                <div><strong>{examClock.seconds}</strong><span>seconds</span></div>
                            </div>
                        </div>

                        <div className="exam-stats-card">
                            <span>Answered: <strong>{answeredCount}/{testQuestions.length}</strong></span>
                            <span>Not Answered: <strong>{notAnsweredCount}</strong></span>
                            <span>Review: <strong>{reviewCount}</strong></span>
                        </div>

                        <div className="exam-palette-card">
                            <h4>Questions</h4>
                            <div className="exam-palette-grid">
                                {testQuestions.map((_, questionIndex) => (
                                    <button
                                        key={questionIndex}
                                        type="button"
                                        className={`exam-qbtn ${getQuestionStatus(questionIndex)}`}
                                        onClick={() => goToQuestion(questionIndex)}
                                    >
                                        {questionIndex + 1}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>

                    <div className="exam-webcam">
                        <video ref={videoRef} autoPlay muted playsInline />
                        <div className="exam-webcam-badge">
                            <span /> Live
                        </div>
                    </div>

                    {showSubmitConfirm && (
                        <div className="modal-overlay" onClick={() => !submittingTest && setShowSubmitConfirm(false)}>
                            <div className="modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <span className="modal-title">Confirm Test Submission</span>
                                    <button
                                        className="modal-close"
                                        onClick={() => setShowSubmitConfirm(false)}
                                        disabled={submittingTest}
                                    >
                                        ✕
                                    </button>
                                </div>
                                <p className="text-sm mb-2">Are you sure you want to submit your test now?</p>
                                {unansweredCount > 0 ? (
                                    <p className="text-sm text-muted mb-3">
                                        You still have <strong>{unansweredCount}</strong> unanswered question(s).
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted mb-3">All questions are answered.</p>
                                )}
                                <div className="flex gap-2 justify-end">
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setShowSubmitConfirm(false)}
                                        disabled={submittingTest}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={submitTestFromModal}
                                        disabled={submittingTest}
                                    >
                                        {submittingTest ? 'Submitting…' : 'Yes, Submit'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
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
                                {subject.qr_code && (
                                    <button
                                        type="button"
                                        onClick={() => setShowQrPreview(true)}
                                        style={{
                                            border: '1px solid var(--border)',
                                            borderRadius: 6,
                                            padding: 0,
                                            background: 'transparent',
                                            cursor: 'zoom-in',
                                            lineHeight: 0,
                                        }}
                                    >
                                        <img
                                            src={subject.qr_code}
                                            alt="Subject QR"
                                            style={{ width: 34, height: 34, borderRadius: 6 }}
                                        />
                                    </button>
                                )}
                                {hasAvatar('subject-teacher', getPictureUrl(subject.teacher_picture)) ? (
                                    <img
                                        src={getPictureUrl(subject.teacher_picture)}
                                        alt={subject.teacher_name}
                                        className="avatar avatar-sm"
                                        style={{ width: 28, height: 28 }}
                                        onError={() => handleAvatarError('subject-teacher')}
                                    />
                                ) : (
                                    <div
                                        className="avatar avatar-sm avatar-placeholder"
                                        style={{
                                            width: 28,
                                            height: 28,
                                            fontSize: '0.8rem',
                                            background: getAvatarFallback(subject.teacher_name).background,
                                        }}
                                    >
                                        {getAvatarFallback(subject.teacher_name).initial}
                                    </div>
                                )}
                                <span className="text-sm text-muted"><strong>{subject.teacher_name}</strong></span>
                            </div>
                        </div>
                    )}
                </div>

                {showQrPreview && subject?.qr_code && (
                    <div className="modal-overlay" onClick={() => setShowQrPreview(false)}>
                        <div className="modal" style={{ maxWidth: '380px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <span className="modal-title">QR Code — {subject.name}</span>
                                <button className="modal-close" onClick={() => setShowQrPreview(false)}>✕</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <img
                                    src={subject.qr_code}
                                    alt="QR Code"
                                    className="qr-img"
                                    style={{ width: 200, height: 200 }}
                                />
                                <div>
                                    <p className="text-xs text-muted mb-1">Subject Code</p>
                                    <p className="font-mono font-bold" style={{ fontSize: '1.4rem', color: 'var(--accent-light)', letterSpacing: '0.1em' }}>
                                        {subject.subject_code}
                                    </p>
                                </div>
                                <button className="btn btn-outline btn-sm" onClick={() => {
                                    navigator.clipboard.writeText(subject.subject_code);
                                    toast.success('Code copied!');
                                }}>📋 Copy Code</button>
                            </div>
                        </div>
                    </div>
                )}


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
                                                    <div className="assignment-status-wrap">
                                                        <span className="assignment-status-chip success">✓ Submitted</span>
                                                        <div>
                                                            {mySub.marks_obtained !== null && mySub.marks_obtained !== undefined ? (
                                                                <span className="assignment-status-chip score">Marks: {mySub.marks_obtained}/{a.max_marks}</span>
                                                            ) : (
                                                                <span className="assignment-status-chip pending">Marks: Pending</span>
                                                            )}
                                                        </div>
                                                        {mySub.feedback && <p className="assignment-feedback">{mySub.feedback}</p>}
                                                    </div>
                                                ) : isPast ? (
                                                    <div className="assignment-status-wrap">
                                                        <span className="assignment-status-chip expired">Deadline passed</span>
                                                    </div>
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
                                    const senderAvatarUrl = getPictureUrl(m.sender_picture);
                                    const senderAvatarKey = `chat-${m.id}-${m.sender_id}`;
                                    return (
                                        <div key={m.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '50%' }}>
                                            {!isMe && (
                                                <div className="flex items-center gap-1 mb-1">
                                                    {hasAvatar(senderAvatarKey, senderAvatarUrl) ? (
                                                        <img
                                                            src={senderAvatarUrl}
                                                            alt={m.sender_name}
                                                            style={{ borderRadius: '50%', width: 18, height: 18 }}
                                                            onError={() => handleAvatarError(senderAvatarKey)}
                                                        />
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
                                                {formatChatMessage(m.message)}
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
