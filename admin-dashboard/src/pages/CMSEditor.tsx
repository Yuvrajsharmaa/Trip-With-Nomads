import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mcp } from '../lib/mcp';
import {
    FRAMER_FIELDS, IMPACT_COLOR, IMPACT_LABEL,
    REQUIRED_FIELDS, type FieldMeta,
} from '../lib/fieldSchema';

type FormValues = Record<string, any>;

const GROUPS = ['Identity', 'Core Info', 'Flags', 'Content', 'Images', 'Itinerary'];

export default function CMSEditor() {
    const { collectionId, itemId } = useParams<{ collectionId: string; itemId: string }>();
    const navigate = useNavigate();

    const [original, setOriginal] = useState<FormValues>({});
    const [values, setValues] = useState<FormValues>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showImpactConfirm, setShowImpactConfirm] = useState(false);
    const [title, setTitle] = useState('');

    const isNew = !itemId || itemId === 'new';

    useEffect(() => {
        (async () => {
            if (isNew) { setLoading(false); return; }
            try {
                const item = await mcp.getItem(collectionId!, itemId!);
                if (!item) throw new Error('CMS item not found');
                setTitle(item.fieldData?.edpZYc3f0?.value ?? 'Untitled');

                // Flatten fieldData + top-level slug
                const flat: FormValues = { slug: item.slug ?? '' };
                Object.entries(item.fieldData ?? {}).forEach(([key, f]: [string, any]) => {
                    flat[key] = f?.value ?? '';
                });
                setOriginal(flat);
                setValues(flat);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [collectionId, itemId]);

    // Compute changed fields
    const changedFields = Object.keys(values).filter(k => values[k] !== original[k]);
    const highImpactChanges = changedFields.filter(k => {
        const meta = FRAMER_FIELDS[k];
        return meta && (meta.impact === 'critical' || meta.impact === 'high');
    });

    // Validation
    const missingRequired = REQUIRED_FIELDS.filter(f => {
        const v = values[f];
        return v === undefined || v === null || v === '' || v === 0;
    });

    const handleChange = (key: string, val: any) => {
        setValues(prev => ({ ...prev, [key]: val }));
    };

    const handleSave = () => {
        if (missingRequired.length) {
            setError(`Required fields missing: ${missingRequired.map(f => FRAMER_FIELDS[f]?.label ?? f).join(', ')}`);
            return;
        }
        if (highImpactChanges.length > 0) {
            setShowImpactConfirm(true);
        } else {
            doSave();
        }
    };

    const doSave = async () => {
        setSaving(true);
        setError('');
        setShowImpactConfirm(false);
        try {
            if (isNew) {
                await mcp.createItem(collectionId!, buildPayload());
            } else {
                await mcp.updateItem(collectionId!, itemId!, buildPayload());
            }
            navigate(-1);
        } catch (e: any) {
            setError(e.message ?? 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const buildPayload = () => {
        const payload: Record<string, any> = {};
        Object.entries(values).forEach(([k, v]) => {
            if (k !== 'slug') payload[k] = v;
        });
        payload.slug = values.slug;
        return payload;
    };

    const renderField = (fieldId: string, meta: FieldMeta) => {
        const val = values[fieldId] ?? '';
        const changed = original[fieldId] !== val;
        const isRequired = meta.required;

        const labelEl = (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {meta.label}
                    {isRequired && <span style={{ color: '#dc2626', marginLeft: '2px' }}>✱</span>}
                </label>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: IMPACT_COLOR[meta.impact], background: `${IMPACT_COLOR[meta.impact]}18`, padding: '2px 6px', borderRadius: '999px' }}>
                    {IMPACT_LABEL[meta.impact]}
                </span>
                {changed && <span style={{ fontSize: '0.7rem', color: '#6366f1', fontStyle: 'italic' }}>● changed</span>}
            </div>
        );

        const warningEl = meta.warning && (
            <div style={{ fontSize: '0.75rem', color: '#92400e', background: '#fffbeb', padding: '0.4rem 0.6rem', borderRadius: '5px', marginTop: '0.3rem' }}>
                ℹ️ {meta.warning}
            </div>
        );

        const inputStyle: React.CSSProperties = {
            width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box',
            border: `1px solid ${changed ? '#6366f1' : 'var(--border)'}`,
            background: 'var(--bg-secondary)', color: 'var(--text-primary)',
            outline: 'none',
        };

        let input: React.ReactNode;

        if (meta.type === 'boolean') {
            input = (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!val} onChange={e => handleChange(fieldId, e.target.checked)}
                        style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                    <span style={{ fontSize: '0.875rem' }}>{val ? 'Enabled' : 'Disabled'}</span>
                </label>
            );
        } else if (meta.type === 'number') {
            input = <input type="number" value={val} onChange={e => handleChange(fieldId, Number(e.target.value))} style={inputStyle} />;
        } else if (meta.type === 'formattedText') {
            input = (
                <textarea
                    value={val} onChange={e => handleChange(fieldId, e.target.value)}
                    style={{ ...inputStyle, minHeight: 140, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
                    placeholder="HTML formatted text…"
                />
            );
        } else if (meta.type === 'image') {
            input = (
                <div>
                    <input type="url" value={val} onChange={e => handleChange(fieldId, e.target.value)} style={inputStyle} placeholder="https://…" />
                    {val && <img src={val} alt="" style={{ marginTop: '0.5rem', maxHeight: 80, borderRadius: 6, border: '1px solid var(--border)' }} onError={e => (e.currentTarget.style.display = 'none')} />}
                </div>
            );
        } else {
            input = <input type="text" value={val} onChange={e => handleChange(fieldId, e.target.value)} style={inputStyle} />;
        }

        return (
            <div key={fieldId} style={{ marginBottom: '1.25rem' }}>
                {labelEl}
                {input}
                {changed && warningEl}
            </div>
        );
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading CMS item…</div>;

    return (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                    <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.875rem', padding: 0, marginBottom: '0.5rem' }}>
                        ← Back
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>
                        {isNew ? 'New CMS Item' : `Edit: ${title}`}
                    </h1>
                    {!isNew && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '0.25rem' }}>Item ID: {itemId}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {changedFields.length > 0 && (
                        <span style={{ fontSize: '0.8rem', color: '#6366f1' }}>{changedFields.length} field{changedFields.length > 1 ? 's' : ''} changed</span>
                    )}
                    <button className="btn btn-outline" onClick={() => navigate(-1)} disabled={saving}>Discard</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving || changedFields.length === 0}>
                        {saving ? 'Saving…' : isNew ? 'Create Item' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Validation / error */}
            {error && (
                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', fontSize: '0.875rem' }}>
                    ❌ {error}
                </div>
            )}

            {/* Required fields reminder */}
            {missingRequired.length > 0 && (
                <div style={{ marginBottom: '1.5rem', padding: '0.875rem', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '0.85rem', color: '#92400e' }}>
                    <strong>✱ Required fields:</strong> {missingRequired.map(f => FRAMER_FIELDS[f]?.label ?? f).join(', ')}
                </div>
            )}

            {/* Grouped fields */}
            {GROUPS.map(group => {
                const groupFields: [string, FieldMeta][] = (Object.entries(FRAMER_FIELDS) as [string, FieldMeta][]).filter(([id, m]) => m.group === group && id !== 'slug');
                // Also include slug in Identity group
                const slugEntry: [string, FieldMeta] = ['slug', {
                    label: 'Slug / URL Path', type: 'slug', required: true, impact: 'critical',
                    warning: FRAMER_FIELDS.slug?.warning ?? '', group: 'Identity',
                }];
                const allFields: [string, FieldMeta][] = group === 'Identity' ? [slugEntry, ...groupFields] : groupFields;
                if (!allFields.length) return null;

                return (
                    <div key={group} className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                            {group === 'Identity' && '🔑 '}
                            {group === 'Core Info' && '📋 '}
                            {group === 'Flags' && '🚩 '}
                            {group === 'Content' && '📝 '}
                            {group === 'Images' && '🖼️ '}
                            {group === 'Itinerary' && '🗺️ '}
                            {group}
                        </h3>
                        {allFields.map(([id, meta]) => renderField(id, meta as FieldMeta))}
                    </div>
                );
            })}

            {/* Impact Confirmation Modal */}
            {showImpactConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 2000,
                    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}>
                    <div className="card" style={{ maxWidth: 520, width: '100%', padding: '2rem' }}>
                        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>⚠️ Confirm High-Impact Changes</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                            The following changes may break the live website. Please review carefully.
                        </p>
                        {highImpactChanges.map(k => {
                            const meta = FRAMER_FIELDS[k];
                            return (
                                <div key={k} style={{
                                    marginBottom: '1rem', padding: '0.875rem', borderRadius: '8px',
                                    border: `1px solid ${meta.impact === 'critical' ? '#fca5a5' : '#fcd34d'}`,
                                    background: meta.impact === 'critical' ? '#fef2f2' : '#fffbeb',
                                }}>
                                    <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: IMPACT_COLOR[meta.impact] }}>
                                        {IMPACT_LABEL[meta.impact]} — {meta.label}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', display: 'grid', gridTemplateColumns: '60px 1fr', gap: '0.2rem 0.5rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Before:</span>
                                        <code style={{ wordBreak: 'break-all' }}>{String(original[k])}</code>
                                        <span style={{ color: 'var(--text-muted)' }}>After:</span>
                                        <code style={{ wordBreak: 'break-all' }}>{String(values[k])}</code>
                                    </div>
                                    {meta.warning && <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#92400e' }}>ℹ️ {meta.warning}</div>}
                                </div>
                            );
                        })}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button className="btn btn-outline" onClick={() => setShowImpactConfirm(false)}>Go Back</button>
                            <button className="btn btn-danger" onClick={doSave} disabled={saving}>
                                {saving ? 'Saving…' : 'I Understand — Save Anyway'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
