import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';

export default function StudentLoginPage() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);
        try {
            const res = await API.post('/api/auth/student-login', { email });
            const { token, user, auto_created } = res.data;
            login(token, user);
            if (auto_created) setInfo(`Welcome, ${user.name}! Your account has been created automatically.`);
            setTimeout(() => navigate('/student'), 500);
        } catch (err) {
            setError(err.response?.data?.detail || 'Login failed. Please use your college email.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-wrapper">
            <div className="auth-bg">
                <div className="orb orb-1" style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)' }}></div>
                <div className="orb orb-2" style={{ background: 'radial-gradient(circle, #059669 0%, transparent 70%)' }}></div>
                <div className="orb orb-3" style={{ background: 'radial-gradient(circle, #34d399 0%, transparent 70%)' }}></div>
            </div>
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">🎓</div>
                    <h1>Student Portal</h1>
                    <p className="auth-subtitle">Login with your college email</p>
                </div>

                {error && <div className="alert alert-error">{error}</div>}
                {info && <div className="alert alert-success">{info}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="student-email">College Email</label>
                        <input
                            id="student-email"
                            type="email"
                            placeholder="yourname@college.edu"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <span className="form-hint">Your account is created automatically on first login.</span>
                    </div>
                    <button id="btn-student-login" type="submit" className="btn-primary btn-green" disabled={loading}>
                        {loading ? <span className="spinner-sm"></span> : 'Continue with College Email'}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>Admin or Faculty?</span>
                    <Link to="/" className="auth-link">Staff Login →</Link>
                </div>
            </div>
        </div>
    );
}
