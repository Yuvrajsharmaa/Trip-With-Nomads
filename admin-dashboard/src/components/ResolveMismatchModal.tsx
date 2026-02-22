import { useState } from 'react';
import type { SyncItem } from '../pages/SyncManager';
import { mcp } from '../lib/mcp';
import { COLLECTION_ID, IMPACT_COLOR, IMPACT_LABEL } from '../lib/fieldSchema';

interface Props {
    item: SyncItem;
    onClose: () => void;
    onResolved: () => void;
}

type ResolutionChoice = 'db' | 'framer' | null;

export default function ResolveMismatchModal({ item, onClose, onResolved }: Props) {
    const [choice, setChoice] = useState<ResolutionChoice>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const slugChanging = item.framerSlug !== item.supabaseSlug;
    const idChanging = item.framerTripId !== item.supabaseId;

    const fields = [
        { name: 'Title', framer: item.framerTitle, db: item.supabaseTitle, impact: 'high' as const, changing: item.framerTitle !== item.supabaseTitle },
        { name: 'Slug', framer: item.framerSlug, db: item.supabaseSlug, impact: 'critical' as const, changing: slugChanging },
        { name: 'Trip ID', framer: item.framerTripId, db: item.supabaseId, impact: 'critical' as const, changing: idChanging },
    ].filter(f => f.changing);

    const handleResolve = async () => {
        if (!choice) return;
        setLoading(true);
        setError('');

        try {
            if (choice === 'db') {
                // Push DB values → Framer
                await mcp.updateItem(COLLECTION_ID, item.framerId!, {
                    edpZYc3f0: item.supabaseTitle,
                    sOpVBzQ8v: item.supabaseId,
                    slug: item.supabaseSlug,
                });
            } else {
                // Push Framer values → DB (update Supabase)
                const { supabase } = await import('../lib/supabase');
                await supabase.from('trips').update({
                    title: item.framerTitle,
                    slug: item.framerSlug,
                }).eq('id', item.supabaseId);
            }
            onResolved();
        } catch (e: any) {
            setError(e.message ?? 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
            <div className="card" style={{ maxWidth: 680, width: '100%', padding: '2rem', position: 'relative' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>⚠️ Resolve Mismatch</h2>
                        <p style={{ margin: '0.3rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Pick which side is the source of truth.
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}>✕</button>
                </div>

                {/* Field diff table */}
                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem', background: 'var(--bg-secondary)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-primary)' }}>
                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left' }}>Field</th>
                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left' }}>Framer CMS</th>
                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left' }}>Supabase DB</th>
                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left' }}>Impact</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fields.map(f => (
                                <tr key={f.name} style={{ borderTop: '1px solid var(--border)', background: f.impact === 'critical' ? '#fff5f5' : f.impact === 'high' ? '#fffbeb' : '' }}>
                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{f.name}</td>
                                    <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', wordBreak: 'break-all', color: '#0369a1' }}>{f.framer ?? '—'}</td>
                                    <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', wordBreak: 'break-all', color: '#047857' }}>{f.db ?? '—'}</td>
                                    <td style={{ padding: '0.6rem 1rem' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: IMPACT_COLOR[f.impact] }}>
                                            {IMPACT_LABEL[f.impact]}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Slug warning */}
                {slugChanging && (
                    <div style={{
                        marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px',
                        background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: '0.875rem'
                    }}>
                        <strong>🔴 URL will change.</strong> If you use "DB as Truth", the Framer page URL will change from{' '}
                        <code style={{ background: 'rgba(0,0,0,0.08)', padding: '0 4px', borderRadius: 3 }}>/domestic-trips/{item.framerSlug}</code> to{' '}
                        <code style={{ background: 'rgba(0,0,0,0.08)', padding: '0 4px', borderRadius: 3 }}>/domestic-trips/{item.supabaseSlug}</code>.{' '}
                        The old URL will 404. Consider adding a Framer redirect before proceeding.
                    </div>
                )}

                {/* Choice buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <button
                        onClick={() => setChoice('db')}
                        style={{
                            padding: '1rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                            border: `2px solid ${choice === 'db' ? '#047857' : 'var(--border)'}`,
                            background: choice === 'db' ? '#f0fdf4' : 'var(--bg-secondary)',
                        }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: '#047857' }}>✅ Use Supabase DB</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Push DB values → Framer. DB is the source of truth.</div>
                    </button>
                    <button
                        onClick={() => setChoice('framer')}
                        style={{
                            padding: '1rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                            border: `2px solid ${choice === 'framer' ? '#0369a1' : 'var(--border)'}`,
                            background: choice === 'framer' ? '#eff6ff' : 'var(--bg-secondary)',
                        }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: '#0369a1' }}>✅ Use Framer CMS</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Push Framer values → DB. Framer is the source of truth.</div>
                    </button>
                </div>

                {error && <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', fontSize: '0.875rem' }}>{error}</div>}

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn btn-primary" disabled={!choice || loading} onClick={handleResolve}>
                        {loading ? 'Applying…' : `Apply — Use ${choice === 'db' ? 'Supabase' : choice === 'framer' ? 'Framer' : '…'} as Truth`}
                    </button>
                </div>
            </div>
        </div>
    );
}
