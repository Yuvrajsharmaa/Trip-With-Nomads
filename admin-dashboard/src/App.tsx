import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import TripsList from './pages/TripsList';
import TripForm from './pages/TripForm';
import SyncManager from './pages/SyncManager';
import CMSBrowser from './pages/CMSBrowser';
import CMSEditor from './pages/CMSEditor';
import DashboardLayout from './components/DashboardLayout';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

const Dashboard = () => (
  <div>
    <div style={{ marginBottom: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>Welcome back 👋</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem' }}>Here's an overview of your operations.</p>
    </div>

    <div className="stats-grid">
      <Link to="/trips" style={{ textDecoration: 'none', color: 'inherit' }}>
        <article className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✈️</div>
          <div className="stat-label">Trip Manager</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Manage trip details, pricing & availability
          </div>
          <div style={{ marginTop: '1rem', color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 600 }}>
            Open →
          </div>
        </article>
      </Link>

      <Link to="/sync" style={{ textDecoration: 'none', color: 'inherit' }}>
        <article className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔄</div>
          <div className="stat-label">Sync Manager</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Resolve mismatches between DB & Framer
          </div>
          <div style={{ marginTop: '1rem', color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 600 }}>
            Scan Now →
          </div>
        </article>
      </Link>

      <Link to="/cms" style={{ textDecoration: 'none', color: 'inherit' }}>
        <article className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗂️</div>
          <div className="stat-label">CMS Browser</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Edit, create & delete Framer CMS items
          </div>
          <div style={{ marginTop: '1rem', color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 600 }}>
            Open →
          </div>
        </article>
      </Link>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/trips" element={<ProtectedRoute><DashboardLayout><TripsList /></DashboardLayout></ProtectedRoute>} />
          <Route path="/trips/new" element={<ProtectedRoute><DashboardLayout><TripForm /></DashboardLayout></ProtectedRoute>} />
          <Route path="/trips/:id" element={<ProtectedRoute><DashboardLayout><TripForm /></DashboardLayout></ProtectedRoute>} />
          <Route path="/sync" element={<ProtectedRoute><DashboardLayout><SyncManager /></DashboardLayout></ProtectedRoute>} />
          <Route path="/cms" element={<ProtectedRoute><DashboardLayout><CMSBrowser /></DashboardLayout></ProtectedRoute>} />
          <Route path="/cms/:collectionId/:itemId" element={<ProtectedRoute><DashboardLayout><CMSEditor /></DashboardLayout></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
