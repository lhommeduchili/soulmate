import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Disc, Download, Search, X, Settings, Music, Zap, ListMusic } from 'lucide-react';

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

    const filtered = playlists.filter((pl) =>
        pl.name.toLowerCase().includes(query.toLowerCase().trim())
    );
    const totalTracks = playlists.reduce((sum, pl) => sum + (pl.tracks || 0), 0);

    if (loading) {
        return (
            <div className="container">
                <div className="surface surface-borderless" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                            <Disc size={44} color="#7dfbd3" />
                        </motion.div>
                        <p className="muted">Cargando tu biblioteca…</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            <header className="page-header">
                <div className="brand">
                    <div className="brand-mark" />
                    <div className="brand-title">
                        <strong>Soulmate</strong>
                        <span>Spotify → Soulseek lossless</span>
                    </div>
                </div>
                <div className="chip-row">
                    <span className="pill"><Zap size={15} /> Descarga rápida</span>
                    <span className="pill"><Settings size={15} /> {preferredFormat.toUpperCase()} preferido</span>
                </div>
            </header>

            <section className="hero">
                <div className="surface hero-copy">
                    <div className="eyebrow">Biblioteca lista para bajar</div>
                    <h1>Convierte playlists en descargas lossless, sin esfuerzo.</h1>
                    <p className="muted">
                        Filtra, selecciona formato y dispara la cola. Guardamos tus preferencias locales para que solo pulses descargar.
                    </p>

                    <div className="hero-actions">
                        <div className="stat-card">
                            <small>Playlists listas</small>
                            <strong>{playlists.length}</strong>
                        </div>
                        <div className="stat-card">
                            <small>Tracks totales</small>
                            <strong>{totalTracks}</strong>
                        </div>
                        <div className="stat-card">
                            <small>Fallback</small>
                            <strong>{allowLossy ? 'Permitido' : 'Solo lossless'}</strong>
                        </div>
                    </div>

                    <div className="search">
                        <Search size={18} color="#9aa2b5" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Busca por nombre de playlist…"
                        />
                        {query && (
                            <button onClick={() => setQuery('')} className="btn btn-muted" style={{ padding: '0.45rem 0.8rem' }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="surface surface-borderless">
                    <div className="panel-title">
                        <div>
                            <p className="muted" style={{ marginBottom: '6px' }}>Preferencias de descarga</p>
                            <h2>Formato y límites</h2>
                        </div>
                        <span className="pill"><Settings size={15} /> Ajustes locales</span>
                    </div>

                    <div className="settings-grid">
                        <div>
                            <div className="field-label">Formato preferido</div>
                            <select
                                value={preferredFormat}
                                onChange={(e) => setPreferredFormat(e.target.value)}
                                className="select"
                            >
                                <option value="flac">FLAC</option>
                                <option value="wav">WAV</option>
                                <option value="aiff">AIFF</option>
                            </select>
                        </div>

                        <div>
                            <div className="field-label">Límite de tracks (opcional)</div>
                            <input
                                type="number"
                                min="1"
                                className="input"
                                placeholder="Todos los tracks"
                                value={trackLimit}
                                onChange={(e) => setTrackLimit(e.target.value)}
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={allowLossy}
                                onChange={(e) => setAllowLossy(e.target.checked)}
                            />
                            <span>Permitir fallback con pérdida</span>
                        </label>
                        <p className="muted" style={{ fontSize: '0.9rem' }}>Si no hay lossless disponible, toma el mejor candidato restante.</p>
                    </div>
                </div>
            </section>

            <section className="surface">
                <div className="panel-title">
                    <div>
                        <p className="muted" style={{ marginBottom: '6px' }}>Playlists</p>
                        <h2>Listas listas para bajar ({filtered.length})</h2>
                    </div>
                    <span className="pill"><ListMusic size={15} /> {playlists.length} totales</span>
                </div>

                <div className="playlist-grid">
                    <AnimatePresence>
                        {filtered.map((pl, i) => (
                            <motion.div
                                key={pl.id}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ delay: i * 0.02 }}
                                className="playlist-card"
                            >
                                <div className="playlist-cover">
                                    {pl.image ? (
                                        <img src={pl.image} alt={pl.name} />
                                    ) : (
                                        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                                            <Music size={40} />
                                        </div>
                                    )}
                                    <span className="pill" style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.2)' }}>
                                        {pl.tracks} tracks
                                    </span>
                                </div>

                                <div className="playlist-body">
                                    <div className="playlist-title">{pl.name}</div>
                                    <p className="muted" style={{ fontSize: '0.95rem' }}>
                                        Descarga directa al formato {preferredFormat.toUpperCase()} con fallback inteligente.
                                    </p>
                                    <div className="playlist-meta">
                                        <span className="chip"><Disc size={14} /> {preferredFormat.toUpperCase()}</span>
                                        <span className="chip">{allowLossy ? 'Fallback activo' : 'Solo lossless'}</span>
                                    </div>

                                    <div className="playlist-actions">
                                        <button className="small-btn primary" onClick={() => startDownload(pl.id)}>
                                            <Download size={16} /> Descargar
                                        </button>
                                        <button className="small-btn" onClick={() => inspectPlaylist(pl.id)}>
                                            <Search size={16} /> Ver candidatos
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {filtered.length === 0 && (
                    <div className="empty-state" style={{ marginTop: '1rem' }}>
                        <Search size={26} style={{ opacity: 0.6 }} />
                        <p style={{ marginTop: '8px' }}>No encontramos playlists con “{query}”.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
