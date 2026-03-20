/* eslint-disable no-unused-vars */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import { getAvatarFallback, getUserPicture, resolveAvatarUrl } from '../utils/avatar';

export default function StudentDashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const testsSectionRef = useRef(null);
    const marksChartContainerRef = useRef(null);
    const isTestsView = new URLSearchParams(location.search).get('tab') === 'tests';
    const [subjects, setSubjects] = useState([]);
    const [myTests, setMyTests] = useState([]);
    const [showQR, setShowQR] = useState(null);
    const [joinCode, setJoinCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [showJoin, setShowJoin] = useState(false);
    const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
    const [marksChartContainerWidth, setMarksChartContainerWidth] = useState(0);
    const [brokenAvatarKeys, setBrokenAvatarKeys] = useState({});

    const getPictureUrl = (pictureValue) => resolveAvatarUrl(getUserPicture({ picture: pictureValue }));
    const hasAvatar = (key, avatarUrl) => Boolean(avatarUrl) && !brokenAvatarKeys[key];
    const markAvatarError = (key) => {
        setBrokenAvatarKeys((previous) => ({ ...previous, [key]: true }));
    };

    const marksAnalysis = useMemo(() => {
        const attempts = myTests
            .filter(test => test.my_attempt?.attempted)
            .map(test => {
                const submittedAt = test.my_attempt?.submitted_at;
                const marks = Number(test.my_attempt?.percentage ?? 0);
                return {
                    id: test.id,
                    subjectId: test.subject_id,
                    title: test.title,
                    date: submittedAt ? new Date(submittedAt) : null,
                    dateLabel: submittedAt
                        ? new Date(submittedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'N/A',
                    fullDateLabel: submittedAt
                        ? new Date(submittedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : 'N/A',
                    marks,
                    score: test.my_attempt?.score,
                    totalQuestions: test.my_attempt?.total_questions,
                };
            })
            .filter(item => item.date)
            .sort((a, b) => a.date - b.date);

        const totalTests = myTests.length;
        const attemptedTests = attempts.length;
        const averageMarks = attemptedTests
            ? Math.round(attempts.reduce((sum, item) => sum + item.marks, 0) / attemptedTests)
            : 0;
        const latestMarks = attemptedTests ? Math.round(attempts[attempts.length - 1].marks) : 0;
        const bestMarks = attemptedTests ? Math.round(Math.max(...attempts.map(item => item.marks))) : 0;
        const lowestMarks = attemptedTests ? Math.round(Math.min(...attempts.map(item => item.marks))) : 0;

        return {
            attempts,
            totalTests,
            attemptedTests,
            averageMarks,
            latestMarks,
            bestMarks,
            lowestMarks,
        };
    }, [myTests]);

    const attemptedTestsList = useMemo(
        () => myTests.filter((test) => test.my_attempt?.attempted),
        [myTests]
    );

    const pendingTestsList = useMemo(
        () => myTests.filter((test) => {
            if (test.my_attempt?.attempted) return false;
            if (!test.deadline) return true;
            const deadlineTime = new Date(test.deadline).getTime();
            if (Number.isNaN(deadlineTime)) return true;
            return deadlineTime >= Date.now();
        }),
        [myTests]
    );

    const deadlineDoneTestsList = useMemo(
        () => myTests.filter((test) => {
            if (test.my_attempt?.attempted) return false;
            if (!test.deadline) return false;
            const deadlineTime = new Date(test.deadline).getTime();
            if (Number.isNaN(deadlineTime)) return false;
            return deadlineTime < Date.now();
        }),
        [myTests]
    );

    const attemptedCount = attemptedTestsList.length;
    const pendingCount = pendingTestsList.length;
    const deadlineDoneCount = deadlineDoneTestsList.length;
    const testRowCardWidth = viewportWidth < 768 ? 270 : 320;

    const curvedLinePath = (points) => {
        if (points.length < 2) return '';

        let path = `M ${points[0].x} ${points[0].y}`;
        for (let index = 0; index < points.length - 1; index += 1) {
            const previous = points[index - 1] || points[index];
            const current = points[index];
            const next = points[index + 1];
            const nextNext = points[index + 2] || next;

            const controlPoint1X = current.x + ((next.x - previous.x) / 6);
            const controlPoint1Y = current.y + ((next.y - previous.y) / 6);
            const controlPoint2X = next.x - ((nextNext.x - current.x) / 6);
            const controlPoint2Y = next.y - ((nextNext.y - current.y) / 6);

            path += ` C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${next.x} ${next.y}`;
        }

        return path;
    };

    const marksChart = useMemo(() => {
        const pointsCount = marksAnalysis.attempts.length;
        const isMobileViewport = viewportWidth < 768;
        const isTabletViewport = viewportWidth >= 768 && viewportWidth < 1024;
        const visiblePointsLimit = isMobileViewport ? 5 : (isTabletViewport ? 8 : 15);
        const shouldUseHorizontalScroll = pointsCount > visiblePointsLimit;

        const fallbackWidth = Math.max(300, viewportWidth - (isMobileViewport ? 28 : (isTabletViewport ? 72 : 96)));
        const containerWidth = Math.max(300, marksChartContainerWidth || fallbackWidth);
        const isNarrowContainer = containerWidth < 520;
        const isVeryNarrowContainer = containerWidth < 390;

        const minPointGapPx = isVeryNarrowContainer ? 28 : (isNarrowContainer ? 32 : (isTabletViewport ? 34 : 37.8));
        const leftPadding = isVeryNarrowContainer ? 42 : (isNarrowContainer ? 50 : 70);
        const rightPadding = isVeryNarrowContainer ? 16 : (isNarrowContainer ? 22 : 40);
        const topPadding = isVeryNarrowContainer ? 14 : (isNarrowContainer ? 18 : 28);
        const bottomPadding = isVeryNarrowContainer ? 58 : (isNarrowContainer ? 64 : 74);
        const xAxisStartGap = isVeryNarrowContainer ? 10 : (isNarrowContainer ? 14 : 28);
        const xAxisEndGap = isVeryNarrowContainer ? 8 : (isNarrowContainer ? 10 : 20);

        const requiredPlotWidth = Math.max(0, (pointsCount - 1) * minPointGapPx);
        const requiredChartWidth = leftPadding + xAxisStartGap + requiredPlotWidth + xAxisEndGap + rightPadding;
        const chartWidth = shouldUseHorizontalScroll ? Math.max(containerWidth, requiredChartWidth) : containerWidth;

        const plotWidth = Math.max(1, chartWidth - leftPadding - rightPadding);
        const plotHeight = Math.round(Math.min(378, Math.max(220, chartWidth * (isVeryNarrowContainer ? 0.62 : 0.52))));
        const yTickGapPx = plotHeight / 10;
        const chartHeight = topPadding + plotHeight + bottomPadding;
        const xAxisY = topPadding + plotHeight;
        const xAxisLabelY = xAxisY + (isVeryNarrowContainer ? 16 : (isNarrowContainer ? 20 : 28));
        const effectivePlotWidth = Math.max(1, plotWidth - xAxisStartGap - xAxisEndGap);
        const fixedGapRatioByCount = {
            2: 0.8,
            3: 1 / 3,
        };
        const fixedGapRatio = !shouldUseHorizontalScroll ? fixedGapRatioByCount[pointsCount] : null;
        const spacingSlotCount = shouldUseHorizontalScroll ? pointsCount : visiblePointsLimit;
        const slotDivisor = Math.max(1, spacingSlotCount - 1);
        const stepX = fixedGapRatio
            ? (effectivePlotWidth * fixedGapRatio)
            : (effectivePlotWidth / slotDivisor);
        const occupiedWidth = pointsCount > 1 ? (pointsCount - 1) * stepX : 0;
        const centeredOffsetX = pointsCount > 1 ? Math.max(0, (effectivePlotWidth - occupiedWidth) / 2) : (effectivePlotWidth / 2);

        const plottedPoints = marksAnalysis.attempts.map((item, index) => {
            const x = pointsCount === 1
                ? leftPadding + xAxisStartGap + (effectivePlotWidth / 2)
                : leftPadding + xAxisStartGap + centeredOffsetX + (index * stepX);
            return {
                ...item,
                x,
                y: topPadding + ((100 - item.marks) / 100) * plotHeight,
            };
        });

        const yTicks = Array.from({ length: 11 }, (_, index) => 100 - (index * 10)).map((value) => ({
            value,
            y: topPadding + ((100 - value) / 100) * plotHeight,
        }));

        return {
            chartWidth,
            chartHeight,
            shouldUseHorizontalScroll,
            leftPadding,
            rightPadding,
            topPadding,
            bottomPadding,
            xAxisY,
            xAxisLabelY,
            xAxisStartGap,
            xAxisEndGap,
            labelRotation: isVeryNarrowContainer ? -28 : (isNarrowContainer ? -35 : -45),
            xLabelFontSize: isVeryNarrowContainer ? 10 : (isNarrowContainer ? 11 : 12),
            yTickFontSize: isVeryNarrowContainer ? 8 : (isNarrowContainer ? 9 : 10),
            pointRadius: isVeryNarrowContainer ? 4 : (isMobileViewport ? 4.5 : 5.2),
            pointHaloRadius: isVeryNarrowContainer ? 6.5 : (isMobileViewport ? 7.5 : 9),
            plottedPoints,
            yTicks,
            curvePath: curvedLinePath(plottedPoints),
            areaPath: plottedPoints.length
                ? `${curvedLinePath(plottedPoints)} L ${plottedPoints[plottedPoints.length - 1].x} ${xAxisY} L ${plottedPoints[0].x} ${xAxisY} Z`
                : '',
        };
    }, [marksAnalysis, viewportWidth, marksChartContainerWidth]);

    useEffect(() => {
        loadSubjects();
        const params = new URLSearchParams(window.location.search);
        const code = params.get('joinCode');
        if (code) {
            setJoinCode(code.toUpperCase());
            setShowJoin(true);

            params.delete('joinCode');
            const nextQuery = params.toString();
            const nextUrl = nextQuery ? `/student?${nextQuery}` : '/student';
            window.history.replaceState({}, document.title, nextUrl);
        }
    }, []);

    useEffect(() => {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab === 'tests' && testsSectionRef.current) {
            setTimeout(() => {
                testsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        }
    }, [location.search, fetching]);

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        const container = marksChartContainerRef.current;
        if (!container) return undefined;

        const updateWidth = () => {
            setMarksChartContainerWidth(container.clientWidth || 0);
        };

        updateWidth();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateWidth);
            return () => window.removeEventListener('resize', updateWidth);
        }

        const observer = new ResizeObserver(updateWidth);
        observer.observe(container);

        return () => observer.disconnect();
    }, [isTestsView, marksAnalysis.attempts.length]);

    const loadSubjects = async () => {
        setFetching(true);
        try {
            const res = await api.get('/api/subjects/joined');
            const joinedSubjects = res.data || [];
            setSubjects(joinedSubjects);

            if (joinedSubjects.length === 0) {
                setMyTests([]);
                return;
            }

            const testsBySubject = await Promise.all(
                joinedSubjects.map(async (subject) => {
                    try {
                        const testsRes = await api.get(`/api/subjects/${subject.id}/tests/`);
                        const tests = Array.isArray(testsRes.data) ? testsRes.data : [];
                        const testsWithAttempts = await Promise.all(
                            tests.map(async (test) => {
                                try {
                                    const attemptRes = await api.get(`/api/subjects/${subject.id}/tests/${test.id}/my-attempt`);
                                    return {
                                        ...test,
                                        subject_id: subject.id,
                                        subject_name: subject.name,
                                        subject_code: subject.subject_code,
                                        my_attempt: attemptRes.data,
                                    };
                                } catch {
                                    return {
                                        ...test,
                                        subject_id: subject.id,
                                        subject_name: subject.name,
                                        subject_code: subject.subject_code,
                                        my_attempt: { attempted: false },
                                    };
                                }
                            })
                        );

                        return testsWithAttempts;
                    } catch {
                        return [];
                    }
                })
            );

            setMyTests(testsBySubject.flat());
        } catch {
            toast.error('Failed to load subjects');
            setMyTests([]);
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
                        <h1 className="page-title gradient-text">{isTestsView ? 'My Tests' : 'My Subjects'}</h1>
                        <p className="page-subtitle">
                            {isTestsView ? 'All tests from your joined subjects' : 'Access your enrolled subjects and study materials'}
                        </p>
                    </div>
                    {!isTestsView && (
                        <button className="btn btn-primary" onClick={() => setShowJoin(true)}>
                            + Join Subject
                        </button>
                    )}
                </div>

                {!isTestsView ? (
                    <>
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
                                            {hasAvatar(`subject-teacher-${s.id}`, getPictureUrl(s.teacher_picture)) ? (
                                                <div className="flex items-center gap-2">
                                                    <img
                                                        src={getPictureUrl(s.teacher_picture)}
                                                        alt={s.teacher_name}
                                                        className="avatar avatar-sm"
                                                        onError={() => markAvatarError(`subject-teacher-${s.id}`)}
                                                    />
                                                    <span className="text-sm text-muted">{s.teacher_name}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className="avatar avatar-sm avatar-placeholder" style={{ background: getAvatarFallback(s.teacher_name || '').background }}>
                                                        {getAvatarFallback(s.teacher_name || '').initial}
                                                    </div>
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
                    </>
                ) : (
                    <>
                        <div ref={testsSectionRef} />
                        {fetching ? (
                            <div className="flex justify-center" style={{ padding: '1rem 0 2rem' }}>
                                <div className="spinner" />
                            </div>
                        ) : myTests.length === 0 ? (
                            <div className="empty-state" style={{ marginTop: '0.5rem' }}>
                                <div className="empty-icon">📝</div>
                                <h3>No tests available yet</h3>
                                <p>Your subject tests will appear here as soon as faculty publishes them.</p>
                            </div>
                        ) : (
                            <div className="animate-fade">
                                <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
                                    <h2 className="page-title" style={{ fontSize: '1.2rem', margin: 0 }}>Pending Tests</h2>
                                    <span
                                        className="text-sm"
                                        style={{
                                            minWidth: '2rem',
                                            height: '2rem',
                                            borderRadius: '999px',
                                            border: '1px solid var(--border-color)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            color: 'var(--text-primary)',
                                            background: 'rgba(99,102,241,0.12)',
                                        }}
                                    >
                                        {pendingCount}
                                    </span>
                                </div>

                                {pendingTestsList.length === 0 ? (
                                    <div className="text-sm text-muted" style={{ marginBottom: '1rem' }}>No pending tests.</div>
                                ) : (
                                    <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '0.3rem', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '1rem', width: 'max-content', minWidth: '100%' }}>
                                            {pendingTestsList.map((test) => (
                                                <div
                                                    key={`${test.subject_id}-${test.id}`}
                                                    className="subject-card card-interactive"
                                                    onClick={() => navigate(`/student/subject/${test.subject_id}?tab=tests`)}
                                                    style={{ width: `${testRowCardWidth}px`, flex: '0 0 auto' }}
                                                >
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="subject-code">{test.subject_code}</span>
                                                        <span className="text-xs text-muted">{test.time_limit_minutes} min</span>
                                                    </div>
                                                    <div className="subject-name">{test.title}</div>
                                                    <div className="subject-meta">
                                                        <span>📘 {test.subject_name}</span>
                                                        <span>·</span>
                                                        <span>❓ {test.question_count || 0} questions</span>
                                                    </div>
                                                    <div className="subject-meta" style={{ marginTop: '0.25rem' }}>
                                                        <span>⏰ Deadline:</span>
                                                        <span
                                                            style={{
                                                                color: test.deadline ? 'var(--accent)' : 'var(--text-muted)',
                                                                fontWeight: test.deadline ? 700 : 500,
                                                            }}
                                                        >
                                                            {test.deadline ? new Date(test.deadline).toLocaleString() : 'Not set'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-3">
                                                        <span className="text-sm text-muted">Created by {test.created_by_name || 'Faculty'}</span>
                                                        <span className="text-xs text-muted">
                                                            {test.created_at ? new Date(test.created_at).toLocaleDateString() : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
                                    <h2 className="page-title" style={{ fontSize: '1.2rem', margin: 0 }}>Attempted Tests</h2>
                                    <span
                                        className="text-sm"
                                        style={{
                                            minWidth: '2rem',
                                            height: '2rem',
                                            borderRadius: '999px',
                                            border: '1px solid var(--border-color)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            color: 'var(--text-primary)',
                                            background: 'rgba(16,185,129,0.14)',
                                        }}
                                    >
                                        {attemptedCount}
                                    </span>
                                </div>

                                {attemptedTestsList.length === 0 ? (
                                    <div className="text-sm text-muted" style={{ marginBottom: '1rem' }}>No attempted tests yet.</div>
                                ) : (
                                    <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '0.3rem', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '1rem', width: 'max-content', minWidth: '100%' }}>
                                            {attemptedTestsList.map((test) => (
                                                <div
                                                    key={`${test.subject_id}-${test.id}`}
                                                    className="subject-card card-interactive"
                                                    onClick={() => navigate(`/student/subject/${test.subject_id}?tab=tests`)}
                                                    style={{ width: `${testRowCardWidth}px`, flex: '0 0 auto' }}
                                                >
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="subject-code">{test.subject_code}</span>
                                                        <span className="text-xs text-muted">{test.time_limit_minutes} min</span>
                                                    </div>
                                                    <div className="subject-name">{test.title}</div>
                                                    <div className="subject-meta">
                                                        <span>📘 {test.subject_name}</span>
                                                        <span>·</span>
                                                        <span>❓ {test.question_count || 0} questions</span>
                                                    </div>
                                                    <div className="subject-meta" style={{ marginTop: '0.25rem' }}>
                                                        <span>⏰ Deadline:</span>
                                                        <span>{test.deadline ? new Date(test.deadline).toLocaleString() : 'Not set'}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-3">
                                                        <span className="text-sm text-muted">Created by {test.created_by_name || 'Faculty'}</span>
                                                        <span className="text-xs text-muted">
                                                            {test.created_at ? new Date(test.created_at).toLocaleDateString() : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
                                    <h2 className="page-title" style={{ fontSize: '1.2rem', margin: 0 }}>Not Attempted Tests</h2>
                                    <span
                                        className="text-sm"
                                        style={{
                                            minWidth: '2rem',
                                            height: '2rem',
                                            borderRadius: '999px',
                                            border: '1px solid var(--border-color)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            color: 'var(--text-primary)',
                                            background: 'rgba(244,63,94,0.12)',
                                        }}
                                    >
                                        {deadlineDoneCount}
                                    </span>
                                </div>

                                {deadlineDoneTestsList.length === 0 ? (
                                    <div className="text-sm text-muted" style={{ marginBottom: '1rem' }}>No expired tests.</div>
                                ) : (
                                    <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '0.3rem', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '1rem', width: 'max-content', minWidth: '100%' }}>
                                            {deadlineDoneTestsList.map((test) => (
                                                <div
                                                    key={`${test.subject_id}-${test.id}`}
                                                    className="subject-card card-interactive"
                                                    onClick={() => navigate(`/student/subject/${test.subject_id}?tab=tests`)}
                                                    style={{ width: `${testRowCardWidth}px`, flex: '0 0 auto', opacity: 0.92 }}
                                                >
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="subject-code">{test.subject_code}</span>
                                                        <span className="text-xs text-muted">{test.time_limit_minutes} min</span>
                                                    </div>
                                                    <div className="subject-name">{test.title}</div>
                                                    <div className="subject-meta">
                                                        <span>📘 {test.subject_name}</span>
                                                        <span>·</span>
                                                        <span>❓ {test.question_count || 0} questions</span>
                                                    </div>
                                                    <div className="subject-meta" style={{ marginTop: '0.25rem' }}>
                                                        <span>⏰ Deadline:</span>
                                                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                                                            {test.deadline ? new Date(test.deadline).toLocaleString() : 'Not set'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-3">
                                                        <span className="text-sm text-muted">Created by {test.created_by_name || 'Faculty'}</span>
                                                        <span className="text-xs text-muted">
                                                            {test.created_at ? new Date(test.created_at).toLocaleDateString() : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="subject-card" style={{ marginTop: '1rem' }}>
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="subject-name" style={{ marginBottom: 0 }}>Marks Analysis</div>
                                        <div className="text-xs text-muted" style={{ textAlign: 'right', lineHeight: 1.35 }}>
                                            <div>X-axis: Test Name</div>
                                            <div>Y-axis: Marks (%)</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem', marginBottom: '0.9rem' }}>
                                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.5rem 0.7rem' }}>
                                            <div className="text-xs text-muted">Total / Attempted</div>
                                            <div style={{ fontWeight: 700 }}>{marksAnalysis.totalTests} / {marksAnalysis.attemptedTests}</div>
                                        </div>
                                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.5rem 0.7rem' }}>
                                            <div className="text-xs text-muted">Average</div>
                                            <div style={{ fontWeight: 700 }}>{marksAnalysis.averageMarks}%</div>
                                        </div>
                                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.5rem 0.7rem' }}>
                                            <div className="text-xs text-muted">Best / Lowest / Latest</div>
                                            <div style={{ fontWeight: 700 }}>{marksAnalysis.bestMarks}% / {marksAnalysis.lowestMarks}% / {marksAnalysis.latestMarks}%</div>
                                        </div>
                                    </div>

                                    {marksAnalysis.attempts.length === 0 ? (
                                        <div className="text-sm text-muted" style={{ padding: '0.5rem 0' }}>
                                            Attempt tests to see marks trend graph.
                                        </div>
                                    ) : (
                                        <>
                                            <div ref={marksChartContainerRef} style={{ width: '100%', overflowX: marksChart.shouldUseHorizontalScroll ? 'auto' : 'hidden', overflowY: 'hidden', paddingBottom: '0.35rem' }}>
                                                <div style={{ width: marksChart.shouldUseHorizontalScroll ? `${marksChart.chartWidth}px` : '100%' }}>
                                                    <svg
                                                        width={marksChart.chartWidth}
                                                        viewBox={`0 0 ${marksChart.chartWidth} ${marksChart.chartHeight}`}
                                                        preserveAspectRatio="xMinYMin meet"
                                                        style={{ height: `${marksChart.chartHeight}px`, overflow: 'hidden' }}
                                                    >
                                                        <defs>
                                                            <linearGradient id="marksAreaFill" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="var(--accent-light)" stopOpacity="0.35" />
                                                                <stop offset="100%" stopColor="var(--accent-light)" stopOpacity="0.02" />
                                                            </linearGradient>
                                                            <clipPath id="marksPlotClip">
                                                                <rect
                                                                    x={marksChart.leftPadding}
                                                                    y={marksChart.topPadding}
                                                                    width={Math.max(1, marksChart.chartWidth - marksChart.leftPadding - marksChart.rightPadding)}
                                                                    height={Math.max(1, marksChart.xAxisY - marksChart.topPadding)}
                                                                />
                                                            </clipPath>
                                                        </defs>

                                                        {marksChart.yTicks.map((tick) => (
                                                            <g key={`y-tick-${tick.value}`}>
                                                                <line
                                                                    x1={marksChart.leftPadding}
                                                                    y1={tick.y}
                                                                    x2={marksChart.chartWidth - marksChart.rightPadding}
                                                                    y2={tick.y}
                                                                    stroke="var(--border-color)"
                                                                    strokeWidth={tick.value % 50 === 0 ? '0.9' : '0.5'}
                                                                    strokeDasharray={tick.value % 50 === 0 ? '0' : '3 3'}
                                                                />
                                                                <line
                                                                    x1={marksChart.leftPadding - 6}
                                                                    y1={tick.y}
                                                                    x2={marksChart.leftPadding}
                                                                    y2={tick.y}
                                                                    stroke="var(--text-secondary)"
                                                                    strokeWidth="1"
                                                                />
                                                                <text
                                                                    x={marksChart.leftPadding - 12}
                                                                    y={tick.y + 1.5}
                                                                    textAnchor="end"
                                                                    fontSize={marksChart.yTickFontSize}
                                                                    fill="var(--text-muted)"
                                                                >
                                                                    {tick.value}
                                                                </text>
                                                            </g>
                                                        ))}

                                                        <line
                                                            x1={marksChart.leftPadding}
                                                            y1={marksChart.topPadding}
                                                            x2={marksChart.leftPadding}
                                                            y2={marksChart.topPadding + ((100 - 0) / 100) * (marksChart.chartHeight - marksChart.topPadding - marksChart.bottomPadding)}
                                                            stroke="var(--text-secondary)"
                                                            strokeWidth="1.8"
                                                        />
                                                        <line
                                                            x1={marksChart.leftPadding}
                                                            y1={marksChart.topPadding + ((100 - 0) / 100) * (marksChart.chartHeight - marksChart.topPadding - marksChart.bottomPadding)}
                                                            x2={marksChart.chartWidth - marksChart.rightPadding}
                                                            y2={marksChart.topPadding + ((100 - 0) / 100) * (marksChart.chartHeight - marksChart.topPadding - marksChart.bottomPadding)}
                                                            stroke="var(--text-secondary)"
                                                            strokeWidth="1.8"
                                                        />

                                                        {marksChart.plottedPoints.map((item, index) => (
                                                            <line
                                                                key={`x-tick-${item.id}-${index}`}
                                                                x1={item.x}
                                                                y1={marksChart.xAxisY}
                                                                x2={item.x}
                                                                y2={marksChart.xAxisY + 6}
                                                                stroke="var(--text-secondary)"
                                                                strokeWidth="1"
                                                            />
                                                        ))}

                                                        <g clipPath="url(#marksPlotClip)">
                                                            <path
                                                                d={marksChart.areaPath}
                                                                fill="url(#marksAreaFill)"
                                                            />

                                                            <path
                                                                d={marksChart.curvePath}
                                                                fill="none"
                                                                stroke="var(--accent)"
                                                                strokeWidth="3.2"
                                                                strokeLinecap="round"
                                                            />

                                                            {marksChart.plottedPoints.map((item, index) => (
                                                                <g key={`point-${item.id}-${index}`}>
                                                                    <circle cx={item.x} cy={item.y} r={marksChart.pointHaloRadius} fill="var(--accent-light)" fillOpacity="0.2" />
                                                                    <circle cx={item.x} cy={item.y} r={marksChart.pointRadius} fill="var(--accent-light)" stroke="var(--bg-primary)" strokeWidth="2" />
                                                                    <text
                                                                        x={item.x}
                                                                        y={item.y - 12}
                                                                        textAnchor="middle"
                                                                        fontSize="11"
                                                                        fill="var(--text-secondary)"
                                                                        style={{ fontWeight: 700 }}
                                                                    >
                                                                        {Math.round(item.marks)}%
                                                                    </text>
                                                                </g>
                                                            ))}
                                                        </g>

                                                        {marksChart.plottedPoints.map((item, index) => (
                                                            <text
                                                                key={`x-label-${item.id}-${index}`}
                                                                x={item.x}
                                                                y={marksChart.xAxisLabelY}
                                                                textAnchor="middle"
                                                                fontSize={marksChart.xLabelFontSize}
                                                                fill="var(--accent)"
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    fontWeight: 700,
                                                                }}
                                                                transform={`rotate(${marksChart.labelRotation} ${item.x} ${marksChart.xAxisLabelY})`}
                                                                onClick={() => navigate(`/student/subject/${item.subjectId}?tab=tests`)}
                                                            >
                                                                <title>{`${item.title} • ${item.fullDateLabel}`}</title>
                                                                {item.title}
                                                            </text>
                                                        ))}
                                                    </svg>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
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
