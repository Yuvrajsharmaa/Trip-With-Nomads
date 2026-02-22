import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useParams } from 'react-router-dom';

export default function TripForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdit = !!id;

    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState(''); // Note: Schema might not have description? Checking schema later.
    // Actually, 'trips' table schema: id, title, slug, created_at, etc.
    // I should check schema. But 'title' and 'slug' are core.

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isEdit) {
            fetchTrip();
        }
    }, [id]);

    const fetchTrip = async () => {
        const { data, error } = await supabase.from('trips').select('*').eq('id', id).single();
        if (error) {
            setError('Error fetching trip');
        } else {
            setTitle(data.title);
            setSlug(data.slug || '');
            // setDescription(data.description); // If exists
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const tripData = { title, slug: slug || null };

        let res;
        if (isEdit) {
            res = await supabase.from('trips').update(tripData).eq('id', id);
        } else {
            res = await supabase.from('trips').insert([tripData]);
        }

        if (res.error) {
            setError(res.error.message);
        } else {
            navigate('/trips');
        }
        setLoading(false);
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2>{isEdit ? 'Edit Trip' : 'New Trip'}</h2>

            {error && <p style={{ color: 'red' }}>{error}</p>}

            <form onSubmit={handleSubmit}>
                <label>
                    Title
                    <input
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </label>

                <label>
                    Slug (URL)
                    <input
                        type="text"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="e.g. winter-spiti"
                    />
                </label>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button type="submit" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Trip'}
                    </button>
                    <button type="button" onClick={() => navigate('/trips')} style={{ backgroundColor: 'transparent', border: '1px solid #ccc', color: 'inherit' }}>
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
