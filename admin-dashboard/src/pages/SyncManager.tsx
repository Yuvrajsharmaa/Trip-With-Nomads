import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { mcp } from '../lib/mcp';
import { COLLECTION_ID } from '../lib/fieldSchema';
import ResolveMismatchModal from '../components/ResolveMismatchModal';
import PushToFramerModal from '../components/PushToFramerModal';
import { Link } from 'react-router-dom';

export interface SyncItem {
    status: 'synced' | 'mismatch' | 'missing_db' | 'missing_framer';
    framerTitle?: string;
    framerSlug?: string;
    framerId?: string;   // Framer internal item ID (e.g. "MPChBIFAe")
    framerTripId?: string; // Supabase UUID stored in Framer field
    supabaseTitle?: string;
    supabaseSlug?: string;
    supabaseId?: string;   // Real Supabase UUID
    // raw data for editors
    framerRaw?: any;
    supabaseRaw?: any;
}

const MANUAL_MAPPING: Record<string, string> = {
    'Winter Spiti Expedition': 'Winter spiti',
    'Kedarnath Yatra': 'Kedarnath 3N',
    'Do Dhaam': 'Kedarnath With Badrinath 4N',
    'Bali with Nusa & Gili T': 'Bali with Gili T.',
    'Thailand Songkran Festival': 'Thailand  Songkaran',
    'Thailand full moon party': 'Thailand Full Moon',
    'Spiti Valley with sangla holi': 'Spiti With Sangla 6N 7D',
    'Sangla Holi Special': 'Sangla Holi 3N 4D',
    'Baku with Shahdag': 'Baku',
    'Baku without Shahdag': 'Baku',
    'Vietnam': 'Veitnam',
    'Teen taal': 'Teen Taal 3N',
    'The Great Kashmir': 'Kashmir',
};

const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

export default function SyncManager() {
    const [items, setItems] = useState<SyncItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [stats, setStats] = useState({ total: 0, synced: 0, mismatch: 0, missing: 0 });
    const [resolveTarget, setResolveTarget] = useState<SyncItem | null>(null);
    const [pushTarget, setPushTarget] = useState<SyncItem | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');

    const fetchSyncStatus = async () => {
        setLoading(true);
        setStatusMsg('Fetching Supabase trips…');
        try {
            const { data: dbTrips, error } = await supabase.from('trips').select('*');
            if (error) throw error;

            setStatusMsg('Fetching Framer CMS items…');
            const framerResult = await mcp.getItems(COLLECTION_ID);
            const framerItems: any[] = framerResult.items ?? [];

            setStatusMsg('Analysing mismatches…');
            const results: SyncItem[] = [];
            const matchedDbIds = new Set<string>();

            framerItems.forEach((fItem: any) => {
                const fTitle = fItem.fieldData?.edpZYc3f0?.value ?? 'Unknown';
                const fSlug = fItem.slug ?? '';
                const fTripId = fItem.fieldData?.sOpVBzQ8v?.value ?? '';

                let sMatch = dbTrips?.find(s => normalize(s.title) === normalize(fTitle));
                if (!sMatch && MANUAL_MAPPING[fTitle]) {
                    sMatch = dbTrips?.find(s => normalize(s.title) === normalize(MANUAL_MAPPING[fTitle]));
                }

                if (sMatch) {
                    matchedDbIds.add(sMatch.id);
                    const slugMismatch = sMatch.slug !== fSlug;
                    const idMismatch = fTripId !== sMatch.id;
                    results.push({
                        status: (slugMismatch || idMismatch) ? 'mismatch' : 'synced',
                        framerTitle: fTitle, framerSlug: fSlug, framerId: fItem.id, framerTripId: fTripId,
                        supabaseTitle: sMatch.title, supabaseSlug: sMatch.slug, supabaseId: sMatch.id,
                        framerRaw: fItem, supabaseRaw: sMatch,
                    });
                } else {
                    results.push({
                        status: 'missing_db',
                        framerTitle: fTitle, framerSlug: fSlug, framerId: fItem.id, framerTripId: fTripId,
                        framerRaw: fItem,
                    });
                }
            });

            dbTrips?.forEach(s => {
                if (!matchedDbIds.has(s.id)) {
                    results.push({
                        status: 'missing_framer',
                        supabaseTitle: s.title, supabaseSlug: s.slug, supabaseId: s.id,
                        supabaseRaw: s,
                    });
                }
            });

            setItems(results);
            setStats({
                total: results.length,
                synced: results.filter(i => i.status === 'synced').length,
                mismatch: results.filter(i => i.status === 'mismatch').length,
                missing: results.filter(i => i.status.startsWith('missing')).length,
            });
            setStatusMsg('Analysis complete.');
        } catch (e: any) {
            setStatusMsg(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const filtered = filterStatus === 'all' ? items : items.filter(i => i.status === filterStatus);

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>Sync Manager</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem' }}>Compare Supabase ↔ Framer CMS and resolve discrepancies.</p>
                </div>
                <button onClick={fetchSyncStatus} disabled={loading} className="btn btn-primary">
                    {loading ? '⏳ Scanning…' : '🔄 Scan Now'}
                </button>
            </div>

            {/* Stat cards */}
            {items.length > 0 && (
                <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                    {[
                        { label: 'Total', value: stats.total, filter: 'all' },
                        { label: 'Synced', value: stats.synced, filter: 'synced', color: 'var(--success)' },
                        { label: 'Mismatches', value: stats.mismatch, filter: 'mismatch', color: 'var(--warning)' },
                        { label: 'Action Required', value: stats.missing, filter: 'missing_framer', color: 'var(--danger)' },
                    ].map(s => (
                        <article
                            key={s.filter}
                            className="card stat-card"
                            style={{ cursor: 'pointer', border: filterStatus === s.filter ? '2px solid var(--primary)' : '' }}
                            onClick={() => setFilterStatus(filterStatus === s.filter ? 'all' : s.filter)}
                        >
                            <div className="stat-label">{s.label}</div>
                            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                        </article>
                    ))}
                </div>
            )}

            {/* Status banner */}
            {statusMsg && (
                <div style={{
                    marginBottom: '1rem', padding: '0.75rem 1rem',
                    background: statusMsg.startsWith('Error') ? '#fef2f2' : '#eef2ff',
                    color: statusMsg.startsWith('Error') ? '#dc2626' : '#4338ca',
                    borderRadius: '8px', fontSize: '0.875rem'
                }}>{statusMsg}</div>
            )}

            {/* Table */}
            {filtered.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Filter:</span>
                        {['all', 'synced', 'mismatch', 'missing_framer', 'missing_db'].map(f => (
                            <button key={f} onClick={() => setFilterStatus(f)}
                                style={{
                                    padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', cursor: 'pointer',
                                    background: filterStatus === f ? 'var(--primary)' : 'transparent',
                                    color: filterStatus === f ? '#fff' : 'var(--text-muted)',
                                    border: '1px solid var(--border)'
                                }}>
                                {f === 'all' ? 'All' : f === 'missing_framer' ? 'DB Only' : f === 'missing_db' ? 'Framer Only' : f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Framer CMS</th>
                                <th>Supabase DB</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item, idx) => (
                                <tr key={idx}>
                                    <td>
                                        {item.status === 'synced' && <span className="status-badge status-success">✓ Synced</span>}
                                        {item.status === 'mismatch' && <span className="status-badge status-warning">⚠ Mismatch</span>}
                                        {item.status === 'missing_db' && <span className="status-badge status-danger">Framer Only</span>}
                                        {item.status === 'missing_framer' && <span className="status-badge status-danger">DB Only</span>}
                                    </td>
                                    <td>
                                        {item.framerTitle ? (
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{item.framerTitle}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.framerSlug}</div>
                                                {item.framerTripId && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                        id: {item.framerTripId.slice(0, 12)}…
                                                    </div>
                                                )}
                                            </div>
                                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td>
                                        {item.supabaseTitle ? (
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{item.supabaseTitle}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.supabaseSlug}</div>
                                                {item.supabaseId && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                        id: {item.supabaseId.slice(0, 12)}…
                                                    </div>
                                                )}
                                            </div>
                                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            {item.status === 'mismatch' && (
                                                <button className="btn btn-outline" style={{ fontSize: '0.75rem' }}
                                                    onClick={() => setResolveTarget(item)}>
                                                    Resolve
                                                </button>
                                            )}
                                            {item.status === 'missing_framer' && (
                                                <button className="btn btn-primary" style={{ fontSize: '0.75rem' }}
                                                    onClick={() => setPushTarget(item)}>
                                                    Push to Framer
                                                </button>
                                            )}
                                            {item.framerId && (
                                                <Link to={`/cms/${COLLECTION_ID}/${item.framerId}`}
                                                    className="btn btn-outline" style={{ fontSize: '0.75rem' }}>
                                                    Edit CMS
                                                </Link>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            {resolveTarget && (
                <ResolveMismatchModal
                    item={resolveTarget}
                    onClose={() => setResolveTarget(null)}
                    onResolved={() => { setResolveTarget(null); fetchSyncStatus(); }}
                />
            )}
            {pushTarget && (
                <PushToFramerModal
                    item={pushTarget}
                    onClose={() => setPushTarget(null)}
                    onPushed={() => { setPushTarget(null); fetchSyncStatus(); }}
                />
            )}
        </div>
    );
}
