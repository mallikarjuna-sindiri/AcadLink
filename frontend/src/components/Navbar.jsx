import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <nav className="navbar">
            <Link to={user ? `/${user.role}` : "/"} className="navbar-brand" style={{ textDecoration: 'none', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 'bold' }}>
                AcadLink
            </Link>

            {user && (
                <div className="navbar-right">
                    <div className="user-chip">
                        {user.picture ? (
                            <img src={user.picture} alt={user.name} className="avatar-sm" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                        ) : (
                            <div className="avatar-sm avatar-placeholder" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                                {user.name?.[0]}
                            </div>
                        )}
                        <span className="user-chip-name">{user.name}</span>
                        <span className={`badge badge-${user.role}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                            {user.role}
                        </span>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            )}
        </nav>
    );
}
