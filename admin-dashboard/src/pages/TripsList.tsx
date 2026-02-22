import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

interface Trip {
    id: string;
    title: string;
    slug: string;
}

export default function TripsList() {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTrips();
    }, []);

    const fetchTrips = async () => {
        const { data } = await supabase.from('trips').select('*').order('title');
        if (data) setTrips(data);
        setLoading(false);
    };

    const deleteTrip = async (id: string) => {
        if (!confirm('Are you sure you want to delete this trip? This cannot be undone.')) return;

        const { error } = await supabase.from('trips').delete().eq('id', id);
        if (error) alert('Error deleting trip: ' + error.message);
        else fetchTrips();
    };

    if (loading) return <div>Loading trips...</div>;

    return (
        <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2>All Trips ({trips.length})</h2>
                <Link to="/trips/new" role="button">Add New Trip</Link>
            </header>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Title</th>
                        <th style={{ textAlign: 'left' }}>Slug</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {trips.map((trip) => (
                        <tr key={trip.id}>
                            <td>{trip.title}</td>
                            <td><code>{trip.slug}</code></td>
                            <td style={{ textAlign: 'right' }}>
                                <Link to={`/trips/${trip.id}`} role="button" style={{ marginRight: '0.5rem', padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>Edit</Link>
                                <button
                                    onClick={() => deleteTrip(trip.id)}
                                    style={{ backgroundColor: '#ff4444', color: 'white', padding: '0.2rem 0.5rem', fontSize: '0.8rem', border: 'none' }}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
