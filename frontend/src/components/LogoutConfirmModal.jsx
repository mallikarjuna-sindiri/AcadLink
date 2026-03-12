export default function LogoutConfirmModal({ open, onCancel, onConfirm }) {
    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <span className="modal-title">Confirm Logout</span>
                    <button type="button" className="modal-close" onClick={onCancel}>✕</button>
                </div>

                <div className="modal-body">
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        Are you sure you want to logout?
                    </p>
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-ghost" onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className="btn btn-danger" onClick={onConfirm}>
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
}
