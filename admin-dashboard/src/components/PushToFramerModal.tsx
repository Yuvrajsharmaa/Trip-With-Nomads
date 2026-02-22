import { useState } from 'react';
import type { SyncItem } from '../pages/SyncManager';
import { mcp } from '../lib/mcp';
import { COLLECTION_ID } from '../lib/fieldSchema';

interface Props {
    item: SyncItem;
    onClose: () => void;
    onPushed: () => void;
}

export default function PushToFramerModal({ item, onClose, onPushed }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Preview of what we'll send
    const fields = [
        { label: 'Title', value: item.supabaseTitle, impact: '🟠 High' },
        { label: 'Slug / URL', value: item.supabaseSlug, impact: '🔴 Critical — new URL will be /domestic-trips/' + item.supabaseSlug },
        { label: 'Trip ID', value: item.supabaseId, impact: '🔴 Critical — links pricing & booking' },
    ];

    const handlePush = async () => {
        setLoading(true);
        setError('');
        try {
            // Items pushed as draft so they don't go live without review
            await mcp.createItem(COLLECTION_ID, {
                edpZYc3f0: item.supabaseTitle,  // Title
                sOpVBzQ8v: item.supabaseId,     // Trip ID
                slug: item.supabaseSlug,
                s_q7hqKWw: true,               // Is Draft = true (hidden until published in Framer)
            });
            onPushed();
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
            <div className="card" style={{ maxWidth: 540, width: '100%', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>🚀 Push to Framer CMS</h2>
                        <p style={{ margin: '0.3rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            This will create a new <strong>draft</strong> CMS item. You must publish it in Framer before it goes live.
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}>✕</button>
                </div>

                {/* Info banner */}
                <div style={{ marginBottom: '1.5rem', padding: '0.875rem', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '0.85rem', color: '#92400e' }}>
                    <strong>📋 Draft mode:</strong> The item will be <em>invisible on the live site</em> until you open Framer and publish it. Fill in the remaining fields (description, images, itinerary) in the CMS Editor before publishing.
                </div>

                {/* Field preview */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Fields being pushed:</div>
                    {fields.map(f => (
                        <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{f.label}</span>
                            <div>
                                <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, wordBreak: 'break-all' }}>{f.value}</code>
                                <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '2px' }}>{f.impact}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {error && <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', fontSize: '0.875rem' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn btn-primary" onClick={handlePush} disabled={loading}>
                        {loading ? 'Creating…' : 'Create Draft in Framer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
