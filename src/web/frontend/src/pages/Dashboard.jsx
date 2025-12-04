import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Disc, Download, Search, X } from 'lucide-react';

import { isAuthenticated, getToken } from '../utils/auth';

export default function Dashboard() {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [preferredFormat, setPreferredFormat] = useState('flac');
    const [query, setQuery] = useState('');
    const [allowLossy, setAllowLossy] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = () => {
        if (!isAuthenticated()) {
            navigate('/login');
            return;
        }
        fetchPlaylists();
    };

    const fetchPlaylists = async () => {
        try {
            const res = await axios.get('/api/playlists');
            setPlaylists(res.data);
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 401) {
                navigate('/login');
            }
        } finally {
            setLoading(false);
        }
    };

    const startDownload = async (id) => {
        try {
            const tokenInfo = getToken();
            const res = await axios.post('/api/download', {
                playlist_id: id,
                token_info: tokenInfo,
                preferred_format: preferredFormat,
                allow_lossy_fallback: allowLossy,
            });
            navigate(`/job/${res.data.job_id}`);
        } catch (err) {
            console.error(err);
            alert("Failed to start download. Check server logs.");
        }
    };

    const inspectPlaylist = (id) => {
        navigate(`/inspect/${id}`);
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    const filtered = playlists.filter((pl) =>
        pl.name.toLowerCase().includes(query.toLowerCase().trim())
    );

    return (
        <div className="container">
            <header className="flex flex-col gap-4 mb-10">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Disc className="text-[#00ff41]" size={32} />
                        <div>
                            <h1 className="text-2xl font-bold">Your Playlists</h1>
                            <p className="text-sm text-gray-500">Search or scroll to pick one</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm text-gray-400">Preferred format</label>
                        <select
                            value={preferredFormat}
                            onChange={(e) => setPreferredFormat(e.target.value)}
                            className="input w-32"
                        >
                            <option value="wav">WAV</option>
                            <option value="flac">FLAC</option>
                            <option value="alac">ALAC</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm text-gray-400">
                            <input
                                type="checkbox"
                                checked={allowLossy}
                                onChange={(e) => setAllowLossy(e.target.checked)}
                            />
                            Allow lossy fallback
                        </label>
                    </div>
                </div>
                <div className="search-bar">
                    <Search size={18} className="text-gray-500" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Filter playlists by name..."
                        className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-gray-500"
                    />
                    {query && (
                        <button
                            className="text-gray-400 hover:text-white"
                            onClick={() => setQuery('')}
                            aria-label="Clear search"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filtered.map((pl, i) => (
                    <motion.div
                        key={pl.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="card group cursor-pointer relative overflow-hidden"
                        onClick={() => startDownload(pl.id)}
                    >
                        <div className="flex items-start gap-4">
                            {pl.image ? (
                                <img src={pl.image} alt={pl.name} className="w-24 h-24 rounded-md object-cover shadow-lg" />
                            ) : (
                                <div className="w-24 h-24 bg-gray-800 rounded-md flex items-center justify-center">
                                    <Disc className="text-gray-600" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-lg truncate group-hover:text-[#00ff41] transition-colors">{pl.name}</h3>
                                <p className="text-gray-400 text-sm">{pl.tracks} tracks</p>
                            </div>
                        </div>

                        <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                className="bg-[#00ff41] text-black p-2 rounded-full shadow-lg"
                                onClick={(e) => { e.stopPropagation(); startDownload(pl.id); }}
                                title="Download playlist"
                            >
                                <Download size={20} />
                            </button>
                            <button
                                className="bg-gray-800 text-white p-2 rounded-full shadow-lg border border-gray-600 hover:border-[#00ff41]"
                                onClick={(e) => { e.stopPropagation(); inspectPlaylist(pl.id); }}
                                title="Inspect candidates"
                            >
                                <Search size={18} />
                            </button>
                        </div>
                    </motion.div>
                ))}
                {filtered.length === 0 && (
                    <div className="col-span-full text-center text-gray-500 py-10">
                        No playlists match “{query}”.
                    </div>
                )}
            </div>
        </div>
    );
}
