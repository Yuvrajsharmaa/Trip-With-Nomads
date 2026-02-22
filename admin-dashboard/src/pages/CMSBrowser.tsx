import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { mcp } from '../lib/mcp';
import { COLLECTION_ID } from '../lib/fieldSchema';

interface CMSItem {
    id: string;
    slug: string;
    draft: boolean;
    fieldData: Record<string, { type: string; value: any }>;
}

export default function CMSBrowser() {
    const [items, setItems] = useState<CMSItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await mcp.getItems(COLLECTION_ID);
            setItems(result.items ?? []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleDelete = async (item: CMSItem) => {
        const title = item.fieldData?.edpZYc3f0?.value ?? item.slug;
        const confirmed = window.confirm(
            `⚠️ DELETE "${title}"?\n\nThis will PERMANENTLY remove this trip page from the live Framer website. This cannot be undone from the admin panel.\n\nType the slug to confirm: ${item.slug}`
        );
        if (!confirmed) return;

        // Extra slug confirmation
        const typed = window.prompt(`Re-type the slug exactly to confirm deletion:\n\nSlug: ${item.slug}`);
        if (typed !== item.slug) {
            alert('Slug did not match. Deletion cancelled.');
            return;
        }

        setDeleting(item.id);
        try {
            await mcp.deleteItem(COLLECTION_ID, item.id);
            await load();
        } catch (e: any) {
            alert(`Delete failed: ${e.message}`);
        } finally {
            setDeleting(null);
        }
    };

    const filtered = items.filter(item => {
        const title = item.fieldData?.edpZYc3f0?.value ?? '';
        return title.toLowerCase().includes(search.toLowerCase()) || item.slug.includes(search.toLowerCase());
    });

    const published = items.filter(i => !i.draft).length;
    const drafts = items.filter(i => i.draft).length;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>CMS Browser</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                        Framer CMS items — {loading ? '…' : `${items.length} total · ${published} published · ${drafts} draft`}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-outline" onClick={load} disabled={loading}>
                        {loading ? 'Loading…' : '↻ Refresh'}
                    </button>
                    <Link to={`/cms/${COLLECTION_ID}/new`} className="btn btn-primary">+ New Item</Link>
                </div>
            </div>

            {error && (
                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '0.875rem' }}>
                    ❌ {error}
                </div>
            )}

            {/* Search */}
            {items.length > 0 && (
                <input
                    type="text"
                    placeholder="Search by title or slug…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1.5rem',
                        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)', fontSize: '0.875rem', boxSizing: 'border-box',
                    }}
                />
            )}

            {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>Loading CMS items…</div>}

            {!loading && filtered.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>No items found.</div>
            )}

            {/* Table */}
            {filtered.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Trip Title</th>
                                <th>Slug</th>
                                <th>Price (₹)</th>
                                <th>Days</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(item => {
                                const title = item.fieldData?.edpZYc3f0?.value ?? 'Untitled';
                                const price = item.fieldData?.L131_KPPt?.value;
                                const days = item.fieldData?.LUnTv710m?.value;
                                const nights = item.fieldData?.fhY5p3Uv0?.value;
                                const isDeleting = deleting === item.id;

                                return (
                                    <tr key={item.id} style={{ opacity: isDeleting ? 0.4 : 1 }}>
                                        <td>
                                            {item.draft
                                                ? <span className="status-badge" style={{ background: '#e5e7eb', color: '#6b7280' }}>Draft</span>
                                                : <span className="status-badge status-success">Published</span>}
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{title}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                <a href={`https://twn2.framer.website/domestic-trips/${item.slug}`} target="_blank" rel="noreferrer"
                                                    style={{ color: 'var(--primary)' }}>
                                                    /{item.slug} ↗
                                                </a>
                                            </div>
                                        </td>
                                        <td>{price ? `₹${Number(price).toLocaleString('en-IN')}` : '—'}</td>
                                        <td>{days ? `${days}D / ${nights ?? '?'}N` : '—'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <Link to={`/cms/${COLLECTION_ID}/${item.id}`} className="btn btn-outline" style={{ fontSize: '0.75rem' }}>
                                                    Edit
                                                </Link>
                                                <button
                                                    className="btn btn-outline"
                                                    style={{ fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5' }}
                                                    onClick={() => handleDelete(item)}
                                                    disabled={isDeleting}
                                                >
                                                    {isDeleting ? '…' : 'Delete'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Important notice */}
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.825rem', color: '#166534' }}>
                <strong>ℹ️ Note:</strong> Changes made here are applied directly to Framer CMS. Draft items are not visible on the live site. After creating a new item, open Framer to publish it and complete the remaining fields (description, images, itinerary).
            </div>
        </div>
    );
}
