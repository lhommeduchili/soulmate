import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Disc, Download, Search, X, Settings, Music, Zap } from 'lucide-react';

import { isAuthenticated, getToken } from '../utils/auth';

export default function Dashboard() {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [preferredFormat, setPreferredFormat] = useState('flac');
    const [query, setQuery] = useState('');
    const [allowLossy, setAllowLossy] = useState(true);
    const [trackLimit, setTrackLimit] = useState('');
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
            const parsedLimit = trackLimit ? parseInt(trackLimit, 10) : null;
            const res = await axios.post('/api/download', {
                playlist_id: id,
                token_info: tokenInfo,
                preferred_format: preferredFormat,
                allow_lossy_fallback: allowLossy,
                track_limit: parsedLimit,
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
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                    <Disc size={48} className="text-[#00ff41]" />
                </motion.div>
            </div>
        );
    }

    const filtered = playlists.filter((pl) =>
        pl.name.toLowerCase().includes(query.toLowerCase().trim())
    );

    return (
        <div className="container">
            <header className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 mb-12">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#00ff41]/10 rounded-xl border border-[#00ff41]/20">
                        <Disc className="text-[#00ff41]" size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
                        <p className="text-gray-400 mt-1">Select a playlist to start downloading</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                    <div className="search-bar flex-1 lg:w-80">
                        <Search size={18} className="text-gray-500" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search playlists..."
                            className="bg-transparent border-none outline-none text-sm text-white placeholder:text-gray-500 w-full"
                        />
                        {query && (
                            <button
                                className="text-gray-400 hover:text-white transition-colors"
                                onClick={() => setQuery('')}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="mb-10 p-6 bg-[#0f0f0f] border border-[#222] rounded-2xl">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                    <Settings size={14} />
                    <span>Download Settings</span>
                </div>
                <div className="flex flex-wrap gap-6 items-center">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-gray-500 font-medium">Format</label>
                        <select
                            value={preferredFormat}
                            onChange={(e) => setPreferredFormat(e.target.value)}
                            className="select w-32 text-sm bg-[#161616]"
                        >
                            <option value="flac">FLAC</option>
                            <option value="wav">WAV</option>
                            <option value="aiff">AIFF</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-xs text-gray-500 font-medium">Track Limit</label>
                        <input
                            type="number"
                            min="1"
                            className="input w-28 text-sm bg-[#161616]"
                            placeholder="All tracks"
                            value={trackLimit}
                            onChange={(e) => setTrackLimit(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-3 mt-6 bg-[#161616] px-4 py-2 rounded-lg border border-[#222] cursor-pointer hover:border-[#333] transition-colors">
                        <input
                            type="checkbox"
                            id="lossy"
                            checked={allowLossy}
                            onChange={(e) => setAllowLossy(e.target.checked)}
                            className="accent-[#00ff41] w-4 h-4 cursor-pointer"
                        />
                        <label htmlFor="lossy" className="text-sm text-gray-300 cursor-pointer select-none">
                            Allow lossy fallback
                        </label>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence>
                    {filtered.map((pl, i) => (
                        <motion.div
                            key={pl.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: i * 0.03 }}
                            className="card group cursor-pointer"
                            onClick={() => startDownload(pl.id)}
                        >
                            <div className="relative aspect-square mb-4 overflow-hidden rounded-lg bg-[#222]">
                                {pl.image ? (
                                    <img
                                        src={pl.image}
                                        alt={pl.name}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#111]">
                                        <Music className="text-gray-700" size={48} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3 backdrop-blur-sm">
                                    <button
                                        className="p-3 bg-[#00ff41] text-black rounded-full shadow-lg hover:scale-110 transition-transform"
                                        onClick={(e) => { e.stopPropagation(); startDownload(pl.id); }}
                                        title="Download playlist"
                                    >
                                        <Download size={20} />
                                    </button>
                                    <button
                                        className="p-3 bg-white text-black rounded-full shadow-lg hover:scale-110 transition-transform"
                                        onClick={(e) => { e.stopPropagation(); inspectPlaylist(pl.id); }}
                                        title="Inspect candidates"
                                    >
                                        <Search size={20} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-bold text-lg truncate group-hover:text-[#00ff41] transition-colors">{pl.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#222] text-gray-400 border border-[#333]">
                                        {pl.tracks} tracks
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filtered.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500">
                        <Search size={48} className="mb-4 opacity-20" />
                        <p className="text-lg">No playlists found matching "{query}"</p>
                    </div>
                )}
            </div>
        </div>
    );
}
