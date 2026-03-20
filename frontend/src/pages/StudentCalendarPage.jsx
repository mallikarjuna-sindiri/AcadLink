import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDateOnly = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const timelineHours = Array.from({ length: 24 }, (_, index) => index);

const formatHourLabel = (hour) => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
};

const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const addMonthsClamped = (date, monthsToAdd, anchorDay) => {
    const result = new Date(date);
    result.setDate(1);
    result.setMonth(result.getMonth() + monthsToAdd);
    const daysInMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(anchorDay, daysInMonth));
    return result;
};

export default function StudentCalendarPage() {
    const location = useLocation();
    const { user } = useAuth();
    const isTeacher = user?.role === 'teacher';
    const calendarApiScope = isTeacher ? 'teacher' : 'student';
    const taskTitleInputRef = useRef(null);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [selectedDate, setSelectedDate] = useState(() => toDateOnly(new Date()));
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addingTask, setAddingTask] = useState(false);
    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    const [pendingDeleteTask, setPendingDeleteTask] = useState(null);
    const [editingTask, setEditingTask] = useState(null);
    const [selectedEventDetail, setSelectedEventDetail] = useState(null);
    const [taskForm, setTaskForm] = useState({
        title: '',
        description: '',
        date: toDateOnly(new Date()),
        startTime: '10:00',
        endTime: '',
        allDay: false,
        repeat: 'none',
        deadlineEnabled: false,
        deadlineAt: '',
    });

    const monthLabel = useMemo(
        () => currentMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
        [currentMonth]
    );

    const monthGrid = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const startWeekDay = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells = [];
        for (let index = 0; index < startWeekDay; index += 1) {
            cells.push({ type: 'empty', key: `empty-${index}` });
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(year, month, day);
            cells.push({
                type: 'day',
                key: `day-${day}`,
                day,
                dateKey: toDateOnly(date),
            });
        }
        return cells;
    }, [currentMonth]);

    const expandedEvents = useMemo(() => {
        const rangeStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1, 0, 0, 0, 0);
        const rangeEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0, 23, 59, 59, 999);

        const expanded = [];

        events.forEach((event) => {
            const repeat = event.repeat || 'none';
            const isRecurring = event.source === 'personal' && ['daily', 'weekly', 'monthly'].includes(repeat);
            const baseStart = new Date(event.start_at || event.due_at);

            if (!isRecurring || Number.isNaN(baseStart.getTime())) {
                expanded.push(event);
                return;
            }

            const baseEnd = event.end_at ? new Date(event.end_at) : null;
            const hasExplicitEnd = Boolean(baseEnd) && !Number.isNaN(baseEnd.getTime()) && baseEnd.getTime() > baseStart.getTime();
            const durationMs = hasExplicitEnd
                ? Math.max(15 * 60 * 1000, baseEnd.getTime() - baseStart.getTime())
                : 0;

            let occurrence = new Date(baseStart);
            const anchorDay = baseStart.getDate();

            while (occurrence < rangeStart) {
                if (repeat === 'daily') occurrence = addDays(occurrence, 1);
                else if (repeat === 'weekly') occurrence = addDays(occurrence, 7);
                else occurrence = addMonthsClamped(occurrence, 1, anchorDay);
            }

            while (occurrence <= rangeEnd) {
                const occurrenceEnd = hasExplicitEnd ? new Date(occurrence.getTime() + durationMs) : null;
                const dateKey = toDateOnly(occurrence);

                expanded.push({
                    ...event,
                    id: `${event.id}-occ-${dateKey}`,
                    recurring_parent_id: event.id,
                    start_at: occurrence.toISOString(),
                    due_at: occurrence.toISOString(),
                    end_at: occurrenceEnd ? occurrenceEnd.toISOString() : null,
                });

                if (repeat === 'daily') occurrence = addDays(occurrence, 1);
                else if (repeat === 'weekly') occurrence = addDays(occurrence, 7);
                else occurrence = addMonthsClamped(occurrence, 1, anchorDay);
            }
        });

        return expanded;
    }, [events, currentMonth]);

    const eventsByDate = useMemo(() => {
        const grouped = {};
        expandedEvents.forEach((event) => {
            const anchorDate = event.start_at || event.due_at;
            const dateKey = toDateOnly(anchorDate);
            if (!dateKey) return;
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(event);
        });

        Object.values(grouped).forEach((items) => {
            items.sort((a, b) => new Date(a.start_at || a.due_at) - new Date(b.start_at || b.due_at));
        });

        return grouped;
    }, [expandedEvents]);

    const selectedDateEvents = eventsByDate[selectedDate] || [];

    const timelineEvents = useMemo(() => {
        const baseEvents = selectedDateEvents
            .map((event) => {
                if (event.all_day) {
                    return null;
                }

                const startDate = new Date(event.start_at || event.due_at);
                if (Number.isNaN(startDate.getTime())) return null;

                const fallbackEnd = new Date(startDate.getTime() + 45 * 60 * 1000);
                const endDate = event.end_at ? new Date(event.end_at) : fallbackEnd;
                const safeEndDate = Number.isNaN(endDate.getTime()) ? fallbackEnd : endDate;

                const startMinutes = (startDate.getHours() * 60) + startDate.getMinutes();
                const hasExplicitEnd = Boolean(event.end_at)
                    && !Number.isNaN(endDate.getTime())
                    && safeEndDate.getTime() > startDate.getTime();
                const rawEndMinutes = (safeEndDate.getHours() * 60) + safeEndDate.getMinutes();
                const endMinutes = hasExplicitEnd ? Math.max(startMinutes + 15, rawEndMinutes) : startMinutes;
                const durationMinutes = hasExplicitEnd ? Math.max(15, endMinutes - startMinutes) : 0;

                return {
                    ...event,
                    minutesFromMidnight: startMinutes,
                    endMinutes,
                    durationMinutes,
                    isPointEvent: !hasExplicitEnd,
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.minutesFromMidnight - b.minutesFromMidnight);

        if (baseEvents.length <= 1) {
            return baseEvents.map((event) => ({
                ...event,
                columnIndex: 0,
                columnCount: 1,
            }));
        }

        const overlaps = (first, second) => first.minutesFromMidnight < second.endMinutes && second.minutesFromMidnight < first.endMinutes;

        const visited = new Set();
        const components = [];

        for (let index = 0; index < baseEvents.length; index += 1) {
            if (visited.has(index)) continue;

            const queue = [index];
            visited.add(index);
            const componentIndices = [];

            while (queue.length > 0) {
                const current = queue.shift();
                componentIndices.push(current);

                for (let candidate = 0; candidate < baseEvents.length; candidate += 1) {
                    if (visited.has(candidate)) continue;
                    if (overlaps(baseEvents[current], baseEvents[candidate])) {
                        visited.add(candidate);
                        queue.push(candidate);
                    }
                }
            }

            components.push(componentIndices);
        }

        const laidOut = baseEvents.map((event) => ({
            ...event,
            columnIndex: 0,
            columnCount: 1,
        }));

        components.forEach((componentIndices) => {
            const indices = [...componentIndices].sort((first, second) => {
                const firstEvent = baseEvents[first];
                const secondEvent = baseEvents[second];
                if (firstEvent.minutesFromMidnight !== secondEvent.minutesFromMidnight) {
                    return firstEvent.minutesFromMidnight - secondEvent.minutesFromMidnight;
                }
                return firstEvent.endMinutes - secondEvent.endMinutes;
            });

            const active = [];
            let maxColumns = 0;

            indices.forEach((eventIndex) => {
                const event = baseEvents[eventIndex];

                for (let activeIndex = active.length - 1; activeIndex >= 0; activeIndex -= 1) {
                    if (active[activeIndex].endMinutes <= event.minutesFromMidnight) {
                        active.splice(activeIndex, 1);
                    }
                }

                const usedColumns = new Set(active.map((item) => item.columnIndex));
                let columnIndex = 0;
                while (usedColumns.has(columnIndex)) {
                    columnIndex += 1;
                }

                laidOut[eventIndex].columnIndex = columnIndex;
                active.push({ endMinutes: event.endMinutes, columnIndex });
                maxColumns = Math.max(maxColumns, columnIndex + 1);
            });

            indices.forEach((eventIndex) => {
                laidOut[eventIndex].columnCount = maxColumns;
            });
        });

        return laidOut;
    }, [selectedDateEvents]);

    const loadEvents = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/api/calendar/${calendarApiScope}/events`);
            setEvents(Array.isArray(response.data) ? response.data : []);
        } catch {
            toast.error('Failed to load calendar events');
            setEvents([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
    }, [calendarApiScope]);

    useEffect(() => {
        const queryDate = new URLSearchParams(location.search).get('date');
        if (!queryDate) return;
        const parsedDate = new Date(`${queryDate}T00:00:00`);
        if (Number.isNaN(parsedDate.getTime())) return;

        setSelectedDate(queryDate);
        setCurrentMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
    }, [location.search]);

    useEffect(() => {
        if (!showCreateTaskModal) return;
        requestAnimationFrame(() => {
            taskTitleInputRef.current?.focus();
        });
    }, [showCreateTaskModal]);

    const goToPreviousMonth = () => {
        setCurrentMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1));
    };

    const submitTask = async (event) => {
        event.preventDefault();
        const title = taskForm.title.trim() || 'Untitled Task';
        if (!taskForm.date) {
            toast.error('Task date is required');
            return;
        }
        if (!taskForm.allDay && !taskForm.startTime) {
            toast.error('Start time is required');
            return;
        }

        const toIso = (date, time) => {
            const local = new Date(`${date}T${time}`);
            if (Number.isNaN(local.getTime())) return null;
            return local.toISOString();
        };

        const dueAtIso = taskForm.allDay
            ? toIso(taskForm.date, '00:00')
            : toIso(taskForm.date, taskForm.startTime);

        const endAtIso = taskForm.allDay
            ? toIso(taskForm.date, '23:59')
            : (taskForm.endTime ? toIso(taskForm.date, taskForm.endTime) : null);

        if (!dueAtIso) {
            toast.error('Invalid date/time selected');
            return;
        }

        const deadlineIso = taskForm.deadlineEnabled && taskForm.deadlineAt
            ? (() => {
                const d = new Date(taskForm.deadlineAt);
                return Number.isNaN(d.getTime()) ? null : d.toISOString();
            })()
            : null;

        if (taskForm.deadlineEnabled && !deadlineIso) {
            toast.error('Invalid deadline selected');
            return;
        }

        setAddingTask(true);
        try {
            const payload = {
                title,
                description: taskForm.description.trim(),
                due_at: dueAtIso,
                start_at: dueAtIso,
                end_at: endAtIso,
                all_day: taskForm.allDay,
                repeat: taskForm.repeat,
                deadline_at: deadlineIso,
            };

            if (editingTask) {
                const editId = editingTask.recurring_parent_id || editingTask.id;
                await api.put(`/api/calendar/${calendarApiScope}/tasks/${editId}`, payload);
                toast.success('Task updated');
            } else {
                await api.post(`/api/calendar/${calendarApiScope}/tasks`, payload);
                toast.success('Task added to calendar');
            }

            setTaskForm((previous) => ({
                ...previous,
                title: '',
                description: '',
                startTime: '10:00',
                endTime: '',
                allDay: false,
                repeat: 'none',
                deadlineEnabled: false,
                deadlineAt: '',
            }));
            setShowCreateTaskModal(false);
            setEditingTask(null);
            loadEvents();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to add task');
        } finally {
            setAddingTask(false);
        }
    };

    const deleteTask = async (taskOrId) => {
        const resolvedTaskId = typeof taskOrId === 'string'
            ? taskOrId
            : (taskOrId?.recurring_parent_id || taskOrId?.id);
        if (!resolvedTaskId) return;

        try {
            await api.delete(`/api/calendar/${calendarApiScope}/tasks/${resolvedTaskId}`);
            toast.success('Task removed');
            loadEvents();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to remove task');
        }
    };

    const formatDateTime = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Invalid date';
        return date.toLocaleString(undefined, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const todayKey = toDateOnly(new Date());
    const selectedDateObj = selectedDate ? new Date(`${selectedDate}T00:00:00`) : null;
    const selectedDateLabel = selectedDateObj
        ? selectedDateObj.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
        : 'Selected date';

    const hourRowHeight = 58;
    const timelineHeight = timelineHours.length * hourRowHeight;

    const handleCreateClick = () => {
        setEditingTask(null);
        setShowCreateTaskModal(true);
        setTaskForm((previous) => ({
            ...previous,
            date: selectedDate,
            startTime: previous.startTime || '10:00',
            endTime: previous.endTime || '',
        }));
    };

    const toLocalDate = (isoValue) => {
        if (!isoValue) return '';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '';
        return toDateOnly(date);
    };

    const toLocalTime = (isoValue) => {
        if (!isoValue) return '';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '';
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    const toLocalDateTimeInput = (isoValue) => {
        if (!isoValue) return '';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '';
        return `${toDateOnly(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    const handleEditTask = (task) => {
        const anchorStart = task.start_at || task.due_at;
        setEditingTask(task);
        setTaskForm((previous) => ({
            ...previous,
            title: task.title || '',
            description: task.description || '',
            date: toLocalDate(anchorStart) || selectedDate,
            startTime: toLocalTime(anchorStart) || '10:00',
            endTime: toLocalTime(task.end_at) || '',
            allDay: Boolean(task.all_day),
            repeat: task.repeat || 'none',
            deadlineEnabled: Boolean(task.deadline_at),
            deadlineAt: toLocalDateTimeInput(task.deadline_at),
        }));
        setShowCreateTaskModal(true);
    };

    const fieldBaseStyle = {
        width: '100%',
        border: '1px solid var(--border-bright)',
        background: 'var(--bg-card-hover)',
        color: 'var(--text-primary)',
        borderRadius: '14px',
        padding: '0.65rem 0.85rem',
        fontSize: '0.96rem',
        fontWeight: 500,
        outline: 'none',
    };

    const fieldRowStyle = {
        ...fieldBaseStyle,
        height: '2.9rem',
    };

    const textAreaStyle = {
        ...fieldBaseStyle,
        minHeight: '5.8rem',
        resize: 'vertical',
    };

    return (
        <div className="app-shell">
            <Sidebar />
            <div className="page-content">
                <div className="page-header">
                    <div className="page-title-group">
                        <h1 className="page-title gradient-text">My Calendar</h1>
                        <p className="page-subtitle">
                            {isTeacher
                                ? 'Manage tasks and plan your schedule'
                                : 'Google Calendar style view for deadlines and personal tasks'}
                        </p>
                    </div>
                    <button className="btn btn-outline" onClick={loadEvents}>
                        Refresh
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: '1rem', alignItems: 'start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '1rem' }}>
                        <div className="card animate-fade" style={{ padding: '1.2rem', borderRadius: '22px' }}>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={handleCreateClick}
                                style={{ width: '100%', justifyContent: 'center', marginBottom: '1rem', fontSize: '1rem', padding: '0.85rem 1rem', borderRadius: '16px', fontWeight: 800 }}
                            >
                                + Create
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                                <button className="btn btn-ghost btn-sm" onClick={goToPreviousMonth} aria-label="Previous month" style={{ fontSize: '1.25rem', fontWeight: 700, width: '2rem', height: '2rem', justifyContent: 'center', padding: 0 }}>‹</button>
                                <strong style={{ fontSize: '1.05rem', lineHeight: 1.2, letterSpacing: '-0.01em', textAlign: 'center' }}>{monthLabel}</strong>
                                <button className="btn btn-ghost btn-sm" onClick={goToNextMonth} aria-label="Next month" style={{ fontSize: '1.25rem', fontWeight: 700, width: '2rem', height: '2rem', justifyContent: 'center', padding: 0 }}>›</button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.45rem' }}>
                                {weekDays.map((weekDay) => (
                                    <div key={weekDay} style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.04em' }}>
                                        {weekDay[0]}
                                    </div>
                                ))}

                                {monthGrid.map((cell) => {
                                    if (cell.type === 'empty') {
                                        return <div key={cell.key} style={{ minHeight: '1.8rem' }} />;
                                    }

                                    const isSelected = selectedDate === cell.dateKey;
                                    const isToday = todayKey === cell.dateKey;
                                    const dayEvents = eventsByDate[cell.dateKey] || [];
                                    const hasHoliday = dayEvents.some((eventItem) => eventItem.type === 'holiday' || eventItem.source === 'holiday');

                                    return (
                                        <button
                                            key={cell.key}
                                            type="button"
                                            onClick={() => setSelectedDate(cell.dateKey)}
                                            style={{
                                                minHeight: '2.05rem',
                                                border: isSelected ? '1px solid var(--accent)' : (hasHoliday ? '1px solid var(--green)' : '1px solid transparent'),
                                                borderRadius: '999px',
                                                background: isSelected ? 'var(--accent)' : 'transparent',
                                                color: isSelected ? '#fff' : 'var(--text-primary)',
                                                fontWeight: isToday ? 800 : 600,
                                                fontSize: '0.84rem',
                                                cursor: 'pointer',
                                                position: 'relative',
                                            }}
                                        >
                                            {cell.day}
                                            {!isSelected && hasHoliday && (
                                                <span style={{ position: 'absolute', right: '0.16rem', bottom: '0.06rem', width: '0.38rem', height: '0.38rem', borderRadius: '50%', background: 'var(--green)' }} />
                                            )}
                                            {!isSelected && !hasHoliday && dayEvents.length > 0 && (
                                                <span style={{ position: 'absolute', right: '0.18rem', bottom: '0.08rem', width: '0.28rem', height: '0.28rem', borderRadius: '50%', background: 'var(--accent)' }} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="card animate-fade" style={{ padding: '0.85rem', borderRadius: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.55rem' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Tasks</h3>
                                <span style={{ fontSize: '0.72rem', color: '#fff', background: selectedDateEvents.length > 0 ? 'var(--accent)' : 'var(--text-muted)', padding: '0.2rem 0.48rem', borderRadius: '999px', fontWeight: 700 }}>
                                    {selectedDateEvents.length}
                                </span>
                            </div>

                            <div style={{ marginBottom: '0.55rem' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-glow)', border: '1px solid var(--border-bright)', borderRadius: '999px', padding: '0.2rem 0.55rem' }}>
                                    ● {selectedDateObj ? selectedDateObj.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : selectedDate}
                                </span>
                            </div>

                            {selectedDateEvents.length === 0 ? (
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No events on selected date.</div>
                            ) : (
                                <div style={{ display: 'grid', gap: '0.45rem', maxHeight: '240px', overflowY: 'auto', paddingRight: '0.15rem' }}>
                                    {selectedDateEvents.map((item) => (
                                        <div key={`left-list-${item.id}`} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '0.45rem' }}>
                                                <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => setSelectedEventDetail(item)}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.86rem', lineHeight: 1.2 }}>{item.title}</div>
                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                                        {formatDateTime(item.start_at || item.due_at)}
                                                    </div>
                                                </div>
                                                {item.source === 'personal' ? (
                                                    <div style={{ display: 'flex', gap: '0.35rem', marginLeft: 'auto' }}>
                                                        <button
                                                            className="btn btn-outline btn-sm"
                                                            onClick={() => handleEditTask(item)}
                                                            aria-label="Edit task"
                                                            title="Edit task"
                                                            style={{
                                                                justifyContent: 'center',
                                                                flexShrink: 0,
                                                                width: '42px',
                                                                minWidth: '42px',
                                                                height: '32px',
                                                                border: '1px solid var(--border-bright)',
                                                                borderRadius: '999px',
                                                                color: 'var(--accent)',
                                                                background: 'rgba(99,102,241,0.08)',
                                                                fontSize: '0.88rem',
                                                                padding: 0,
                                                            }}
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            className="btn btn-outline btn-sm"
                                                            onClick={() => setPendingDeleteTask(item)}
                                                            aria-label="Delete task"
                                                            title="Delete task"
                                                            style={{
                                                                justifyContent: 'center',
                                                                flexShrink: 0,
                                                                width: '54px',
                                                                minWidth: '54px',
                                                                height: '32px',
                                                                border: 'none',
                                                                borderRadius: '999px',
                                                                color: '#fff',
                                                                background: 'linear-gradient(135deg, var(--rose), #be123c)',
                                                                fontSize: '0.92rem',
                                                                padding: 0,
                                                                boxShadow: '0 4px 12px rgba(244,63,94,0.22)',
                                                            }}
                                                        >
                                                            🗑
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="badge" style={{ fontSize: '0.67rem', flexShrink: 0 }}>Event</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>

                    <div className="card animate-fade" style={{ padding: '1rem', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem', gap: '0.8rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <button
                                    className="btn btn-outline"
                                    onClick={() => {
                                        const today = new Date();
                                        const todayIso = toDateOnly(today);
                                        setSelectedDate(todayIso);
                                        setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                                    }}
                                >
                                    Today
                                </button>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>GMT+05:30</div>
                                    <div style={{ fontWeight: 700 }}>{selectedDateLabel}</div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {selectedDateEvents.length} events
                            </div>
                        </div>

                        <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'auto', maxHeight: '70vh' }}>
                            <div style={{ minWidth: '700px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', borderBottom: '1px solid var(--border)', background: 'var(--bg-card-hover)' }}>
                                    <div style={{ padding: '0.65rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' }}>All day</div>
                                    <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                        {loading ? (
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading events...</span>
                                        ) : selectedDateEvents.length === 0 ? (
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No events</span>
                                        ) : (
                                            selectedDateEvents.slice(0, 6).map((item) => {
                                                const isHolidayItem = item.type === 'holiday' || item.source === 'holiday';
                                                return (
                                                <span
                                                    key={`badge-${item.id}`}
                                                    onClick={() => setSelectedEventDetail(item)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setSelectedEventDetail(item);
                                                        }
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                    style={{
                                                        fontSize: '0.72rem',
                                                        borderRadius: '999px',
                                                        padding: '0.2rem 0.5rem',
                                                        background: isHolidayItem
                                                            ? 'rgba(16,185,129,0.12)'
                                                            : (item.source === 'faculty' ? 'var(--teal-glow)' : 'var(--accent-glow)'),
                                                        color: 'var(--text-primary)',
                                                        border: isHolidayItem ? '1px solid var(--green)' : '1px solid var(--border)',
                                                        cursor: 'pointer',
                                                    }}
                                                    title={`${item.title} • ${formatDateTime(item.start_at || item.due_at)}`}
                                                >
                                                    {isHolidayItem ? `Holiday: ${item.title}` : item.title}
                                                </span>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)' }}>
                                    <div style={{ borderRight: '1px solid var(--border)' }}>
                                        {timelineHours.map((hour) => (
                                            <div key={`hour-label-${hour}`} style={{ height: `${hourRowHeight}px`, fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.3rem 0.45rem', borderBottom: '1px solid var(--border)' }}>
                                                {formatHourLabel(hour)}
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ position: 'relative', height: `${timelineHeight}px` }}>
                                        {timelineHours.map((hour) => (
                                            <div
                                                key={`line-${hour}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: 0,
                                                    right: 0,
                                                    top: `${hour * hourRowHeight}px`,
                                                    borderTop: '1px solid var(--border)',
                                                }}
                                            />
                                        ))}

                                        {timelineEvents.map((item) => {
                                            const top = (item.minutesFromMidnight / 60) * hourRowHeight;
                                            const dynamicHeight = item.isPointEvent ? 2 : Math.max(36, (item.durationMinutes / 60) * hourRowHeight);
                                            const columnCount = Math.max(1, item.columnCount || 1);
                                            const columnIndex = Math.max(0, item.columnIndex || 0);
                                            return (
                                                <div
                                                    key={`timeline-${item.id}`}
                                                    title={formatDateTime(item.start_at || item.due_at)}
                                                    onClick={() => setSelectedEventDetail(item)}
                                                    style={{
                                                        position: 'absolute',
                                                        top: `${top}px`,
                                                        left: `calc(8px + (${columnIndex} * ((100% - 16px) / ${columnCount})) + 2px)`,
                                                        width: `calc(((100% - 16px) / ${columnCount}) - 4px)`,
                                                        height: `${dynamicHeight}px`,
                                                        minHeight: item.isPointEvent ? '2px' : '36px',
                                                        borderRadius: item.isPointEvent ? '999px' : '10px',
                                                        border: item.isPointEvent ? 'none' : '1px solid var(--border)',
                                                        background: item.isPointEvent
                                                            ? 'var(--rose)'
                                                            : (item.source === 'faculty' ? 'var(--teal-glow)' : 'var(--accent-glow)'),
                                                        color: 'var(--text-primary)',
                                                        padding: item.isPointEvent ? 0 : '0.35rem 0.5rem',
                                                        overflow: item.isPointEvent ? 'visible' : 'hidden',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {item.isPointEvent ? (
                                                        <>
                                                            <span
                                                                style={{
                                                                    position: 'absolute',
                                                                    left: '-1px',
                                                                    top: '50%',
                                                                    transform: 'translate(-50%, -50%)',
                                                                    width: '8px',
                                                                    height: '8px',
                                                                    borderRadius: '999px',
                                                                    background: 'var(--rose)',
                                                                    boxShadow: '0 0 0 2px var(--bg-primary)',
                                                                }}
                                                            />
                                                            <div style={{ position: 'absolute', top: '-18px', left: 0, fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                                {item.title} • {new Date(item.start_at || item.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                                {item.title}
                                                            </div>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                                                {new Date(item.start_at || item.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {showCreateTaskModal && (
                <div className="modal-overlay" onClick={() => setShowCreateTaskModal(false)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '760px' }}>
                        <div className="modal-header">
                            <span className="modal-title">{editingTask ? 'Edit Task' : 'Create Task'}</span>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => {
                                    setShowCreateTaskModal(false);
                                    setEditingTask(null);
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <form className="modal-body" onSubmit={submitTask}>
                            <input
                                ref={taskTitleInputRef}
                                type="text"
                                className="input"
                                placeholder="Add title"
                                value={taskForm.title}
                                onChange={(event) => setTaskForm((previous) => ({ ...previous, title: event.target.value }))}
                                style={fieldRowStyle}
                            />

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.55rem' }}>
                                <input
                                    type="date"
                                    className="input"
                                    value={taskForm.date}
                                    onChange={(event) => setTaskForm((previous) => ({ ...previous, date: event.target.value }))}
                                    style={fieldRowStyle}
                                />
                                <input
                                    type="time"
                                    className="input"
                                    value={taskForm.startTime}
                                    onChange={(event) => setTaskForm((previous) => ({ ...previous, startTime: event.target.value }))}
                                    disabled={taskForm.allDay}
                                    style={fieldRowStyle}
                                />
                                <input
                                    type="time"
                                    className="input"
                                    value={taskForm.endTime}
                                    onChange={(event) => setTaskForm((previous) => ({ ...previous, endTime: event.target.value }))}
                                    disabled={taskForm.allDay}
                                    style={fieldRowStyle}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '0.7rem', alignItems: 'center' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    <input
                                        type="checkbox"
                                        checked={taskForm.allDay}
                                        onChange={(event) => setTaskForm((previous) => ({ ...previous, allDay: event.target.checked }))}
                                        style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--accent)' }}
                                    />
                                    All day
                                </label>

                                <select
                                    className="input"
                                    value={taskForm.repeat}
                                    onChange={(event) => setTaskForm((previous) => ({ ...previous, repeat: event.target.value }))}
                                    style={fieldRowStyle}
                                >
                                    <option value="none">Does not repeat</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>

                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    <input
                                        type="checkbox"
                                        checked={taskForm.deadlineEnabled}
                                        onChange={(event) => setTaskForm((previous) => ({ ...previous, deadlineEnabled: event.target.checked }))}
                                        style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--accent)' }}
                                    />
                                    Add deadline
                                </label>

                                {taskForm.deadlineEnabled ? (
                                    <input
                                        type="datetime-local"
                                        className="input"
                                        value={taskForm.deadlineAt}
                                        onChange={(event) => setTaskForm((previous) => ({ ...previous, deadlineAt: event.target.value }))}
                                        style={fieldRowStyle}
                                    />
                                ) : (
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Deadline optional</div>
                                )}
                            </div>

                            <textarea
                                className="input"
                                placeholder="Add description"
                                rows={3}
                                value={taskForm.description}
                                onChange={(event) => setTaskForm((previous) => ({ ...previous, description: event.target.value }))}
                                style={textAreaStyle}
                            />

                            <div className="modal-footer" style={{ marginTop: '0.4rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => {
                                        setShowCreateTaskModal(false);
                                        setEditingTask(null);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button className="btn btn-primary" disabled={addingTask} type="submit">
                                    {addingTask ? 'Saving...' : (editingTask ? 'Update Task' : 'Save Task')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {pendingDeleteTask && (
                <div className="modal-overlay" onClick={() => setPendingDeleteTask(null)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '460px' }}>
                        <div className="modal-header">
                            <span className="modal-title">Confirm Deletion</span>
                            <button type="button" className="modal-close" onClick={() => setPendingDeleteTask(null)}>✕</button>
                        </div>

                        <div className="modal-body">
                            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                                Delete task <strong style={{ color: 'var(--text-primary)' }}>{pendingDeleteTask.title || 'Untitled Task'}</strong>?
                            </p>
                            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
                                This action cannot be undone.
                            </p>
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-ghost" onClick={() => setPendingDeleteTask(null)}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={async () => {
                                    const target = pendingDeleteTask;
                                    setPendingDeleteTask(null);
                                    await deleteTask(target);
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedEventDetail && (
                <div className="modal-overlay" onClick={() => setSelectedEventDetail(null)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '760px', padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'flex-end', gap: '0.45rem', borderBottom: '1px solid var(--border)' }}>
                            {selectedEventDetail.source === 'personal' && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    title="Edit"
                                    onClick={() => {
                                        const target = selectedEventDetail;
                                        setSelectedEventDetail(null);
                                        handleEditTask(target);
                                    }}
                                >
                                    ✏️
                                </button>
                            )}
                            {selectedEventDetail.source === 'personal' && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    title="Delete"
                                    onClick={() => {
                                        const target = selectedEventDetail;
                                        setSelectedEventDetail(null);
                                        setPendingDeleteTask(target);
                                    }}
                                >
                                    🗑️
                                </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm" title="Close" onClick={() => setSelectedEventDetail(null)}>
                                ✕
                            </button>
                        </div>

                        <div className="modal-body" style={{ padding: '1.2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                                <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: selectedEventDetail.source === 'faculty' ? 'var(--teal)' : 'var(--accent)', marginTop: '0.4rem', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>{selectedEventDetail.title || 'Untitled Task'}</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginTop: '0.25rem' }}>
                                        {new Date(selectedEventDetail.start_at || selectedEventDetail.due_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                                        {' • '}
                                        {new Date(selectedEventDetail.start_at || selectedEventDetail.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {selectedEventDetail.end_at ? ` - ${new Date(selectedEventDetail.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '1.2rem', display: 'grid', gap: '0.6rem' }}>
                                <div style={{ color: 'var(--accent)', fontWeight: 700 }}>My Tasks</div>
                                <div style={{ color: 'var(--text-secondary)' }}>Source: {selectedEventDetail.source === 'personal' ? 'Personal' : 'Calendar'}</div>
                                {selectedEventDetail.assignee_student_name && (
                                    <div style={{ color: 'var(--text-secondary)' }}>Assigned to: {selectedEventDetail.assignee_student_name}</div>
                                )}
                                {selectedEventDetail.repeat && (
                                    <div style={{ color: 'var(--text-secondary)' }}>Repeat: {selectedEventDetail.repeat === 'none' ? 'Does not repeat' : selectedEventDetail.repeat}</div>
                                )}
                                <div style={{ color: 'var(--text-secondary)' }}>Visibility: Private</div>
                            </div>

                            {selectedEventDetail.deadline_at && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.3rem' }}>Deadline: {formatDateTime(selectedEventDetail.deadline_at)}</div>
                            )}

                            {selectedEventDetail.description ? (
                                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.55rem' }}>
                                    {selectedEventDetail.description}
                                </div>
                            ) : (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: '0.55rem' }}>No description</div>
                            )}
                        </div>

                        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '1rem 1.2rem', marginTop: 0 }}>
                            {selectedEventDetail.source === 'personal' && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                        const target = selectedEventDetail;
                                        setSelectedEventDetail(null);
                                        handleEditTask(target);
                                    }}
                                >
                                    Edit Task
                                </button>
                            )}
                            <button type="button" className="btn btn-ghost" onClick={() => setSelectedEventDetail(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
