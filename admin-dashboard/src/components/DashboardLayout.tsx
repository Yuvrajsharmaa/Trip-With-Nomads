import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Plane, RefreshCw, Database, LogOut } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { logout, user } = useAuth();
    const location = useLocation();

    const navItems = [
        { label: 'Dashboard', path: '/', icon: LayoutDashboard },
        { label: 'Trips', path: '/trips', icon: Plane },
        { label: 'Sync Manager', path: '/sync', icon: RefreshCw },
        { label: 'CMS Browser', path: '/cms', icon: Database },
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-body)' }}>
            {/* Sidebar */}
            <aside style={{
                width: 'var(--sidebar-width)',
                backgroundColor: 'var(--bg-surface)',
                borderRight: '1px solid var(--border-color)',
                position: 'fixed',
                height: '100vh',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.25rem', fontWeight: 700 }}>TWN Admin</h2>
                </div>

                <nav style={{ padding: '1.5rem 1rem', flex: 1 }}>
                    {navItems.map((item) => {
                        // Check if path starts with item.path (unless it's root)
                        const isActive = item.path === '/'
                            ? location.pathname === '/'
                            : location.pathname.startsWith(item.path);

                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    marginBottom: '0.5rem',
                                    textDecoration: 'none',
                                    color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                                    backgroundColor: isActive ? '#eff6ff' : 'transparent',
                                    fontWeight: isActive ? 600 : 500,
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Icon size={20} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontWeight: 'bold' }}>
                            {user?.email?.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{user?.email}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Administrator</div>
                        </div>
                    </div>
                    <button
                        onClick={() => logout()}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.6rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                            color: '#ef4444',
                            fontWeight: 500,
                            transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{
                flex: 1,
                marginLeft: 'var(--sidebar-width)',
                padding: '2rem',
                maxWidth: '100%',
                overflowX: 'hidden'
            }}>
                {children}
            </main>
        </div>
    );
}
