import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function TeacherHolidaysPage() {
    const [holidayItems, setHolidayItems] = useState([]);
    const [holidayYears, setHolidayYears] = useState([]);
    const [selectedHolidayYear, setSelectedHolidayYear] = useState('2026');

    const holidayYearOptions = [...new Set(['2025', '2026', '2027', ...holidayYears])]
        .filter((year) => /^\d{4}$/.test(String(year)))
        .sort();
    const hasUploadedDataForSelectedYear = holidayYears.includes(selectedHolidayYear);

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

    useEffect(() => {
        loadHolidayList(selectedHolidayYear);
    }, [selectedHolidayYear]);

    const loadHolidayList = async (year) => {
        const targetYear = year || selectedHolidayYear;
        try {
            const query = targetYear ? `?year=${targetYear}` : '';
            const response = await api.get(`/api/teacher/holiday/list${query}`);
            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            const years = Array.isArray(response.data?.years)
                ? response.data.years.map((value) => String(value)).filter((value) => /^\d{4}$/.test(value))
                : [];

            setHolidayYears(years);

            if (years.length > 0 && !years.includes(targetYear)) {
                setSelectedHolidayYear(years[0]);
                return;
            }

            setHolidayItems(items);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to load holiday list');
        }
    };

    return (
        <div className="app-shell">
            <Sidebar />
            <div className="page-content">
                <div className="page-header">
                    <div className="page-title-group">
                        <h1 className="page-title gradient-text">Holidays</h1>
                        <p className="page-subtitle">View holiday list year wise</p>
                    </div>
                </div>

                <div className="animate-fade" style={{ display: 'grid', gap: '1rem' }}>
                    <div className="card" style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
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

                    <div className="table-wrapper">
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
                                                {hasUploadedDataForSelectedYear ? 'No holiday data yet.' : 'comming soon....'}
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
            </div>
        </div>
    );
}
