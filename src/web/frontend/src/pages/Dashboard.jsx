import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Disc, Download, Search, X, Settings, Music, Zap, ListMusic, LogOut, ChevronUp, ChevronDown } from 'lucide-react';

import { removeToken } from '../utils/auth';

const DEFAULT_FORMAT_ORDER = ['aiff', 'flac', 'wav', 'lossy'];
const MAX_TRACKS_PER_JOB = 50;
const FORMAT_LABELS = {
    aiff: 'AIFF',
    flac: 'FLAC',
    wav: 'WAV',
    lossy: 'Lossy',
};
const FORMAT_DESCRIPTIONS = {
    aiff: 'Sin compresión, máxima fidelidad.',
    flac: 'Compresión sin pérdida, archivos más ligeros.',
    wav: 'Wave sin comprimir, compatible en todos lados.',
    lossy: 'Acepta MP3/OGG cuando no hay lossless disponible.',
};

const sanitizePreference = (order = []) => {
    const allowed = ['aiff', 'flac', 'wav', 'lossy'];
    const clean = [];
    order.forEach((fmt) => {
        const key = String(fmt || '').toLowerCase();
        if (allowed.includes(key) && !clean.includes(key)) clean.push(key);
    });
    allowed.forEach((fmt) => {
        if (!clean.includes(fmt)) clean.push(fmt);
    });
    return clean;
};

export default function Dashboard() {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formatPreference, setFormatPreference] = useState(DEFAULT_FORMAT_ORDER);
    const [query, setQuery] = useState('');
    const [manualPlaylist, setManualPlaylist] = useState('');
    const [allowLossy, setAllowLossy] = useState(true);
    const [trackLimit, setTrackLimit] = useState('');
    const [showFormatModal, setShowFormatModal] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        try {
            const storedPref = localStorage.getItem('soulmate.formatPreference');
            if (storedPref) {
                const parsed = JSON.parse(storedPref);
                if (Array.isArray(parsed)) {
                    setFormatPreference(sanitizePreference(parsed));
                }
            }
            const storedLossy = localStorage.getItem('soulmate.allowLossy');
            if (storedLossy !== null) {
                setAllowLossy(storedLossy === 'true');
            }
        } catch (err) {
            console.warn('No pudimos leer preferencias guardadas', err);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('soulmate.formatPreference', JSON.stringify(formatPreference));
    }, [formatPreference]);

    useEffect(() => {
        localStorage.setItem('soulmate.allowLossy', allowLossy ? 'true' : 'false');
    }, [allowLossy]);

    const checkAuth = () => {
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

    const moveFormat = (fmt, direction) => {
        setFormatPreference((prev) => {
            const idx = prev.indexOf(fmt);
            const target = idx + direction;
            if (idx === -1 || target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[target]] = [next[target], next[idx]];
            return next;
        });
    };

    const resetPreference = () => setFormatPreference(DEFAULT_FORMAT_ORDER);

    const effectivePreference = allowLossy ? formatPreference : formatPreference.filter((fmt) => fmt !== 'lossy');
    const preferenceSummary = effectivePreference
        .map((fmt) => FORMAT_LABELS[fmt] || fmt.toUpperCase())
        .join(' → ') || 'AIFF → FLAC → WAV';
    const primaryFormat = effectivePreference.find((fmt) => fmt !== 'lossy') || 'aiff';

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') setShowFormatModal(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const startDownload = async (id) => {
        try {
            const parsedLimit = trackLimit ? parseInt(trackLimit, 10) : null;
            const res = await axios.post('/api/download', {
                playlist_id: id,
                format_preferences: effectivePreference,
                allow_lossy_fallback: allowLossy,
                track_limit: parsedLimit,
            });
            navigate(`/job/${res.data.job_id}`);
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 429) {
                alert("Límite de sesiones concurrentes alcanzado. Intenta más tarde.");
            } else {
                alert("Failed to start download. Check server logs.");
            }
        }
    };

    const startDownloadManual = () => {
        if (!manualPlaylist.trim()) {
            alert("Pega una URL o ID de playlist de Spotify.");
            return;
        }
        startDownload(manualPlaylist.trim());
    };

    const handleLogout = () => {
        removeToken();
        axios.post('/api/auth/logout').finally(() => {
            navigate('/login');
        });
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
        <>
        <div className="container">
            <header className="page-header">
                <div className="brand">
                    <div className="brand-mark" />
                    <div className="brand-title">
                        <strong>Soulmate</strong>
                        <span>Spotify → Soulseek lossless</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <div className="chip-row">
                        <span className="pill"><Zap size={15} /> Descarga rápida</span>
                        <span className="pill"><Settings size={15} /> Pref: {preferenceSummary}</span>
                    </div>
                    <button className="btn btn-ghost" onClick={handleLogout}>
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </header>

            <section className="hero">
                <div className="surface hero-copy">
                    <div className="eyebrow">Biblioteca lista para bajar</div>
                    <h1>Convierte playlists en descargas lossless, sin esfuerzo.</h1>
                    <p className="muted">
                        Filtra, define el orden de formatos y dispara la cola. Guardamos tus preferencias locales para que solo pulses descargar.
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
                        <div className="stat-card">
                            <small>Límite por job</small>
                            <strong>{MAX_TRACKS_PER_JOB} tracks</strong>
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
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span className="pill"><Settings size={15} /> Ajustes locales</span>
                            <span className="pill" style={{ background: 'rgba(255,255,255,0.04)' }}>Máximo {MAX_TRACKS_PER_JOB} temas por descarga</span>
                        </div>
                    </div>

                    <div className="settings-grid">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="field-label">Orden de formatos</div>
                            <div style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel, #0f1623)' }}>
                                <div style={{ fontWeight: 600, marginBottom: '6px' }}>{preferenceSummary}</div>
                                <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                                    Arrastra en el editor para priorizar formatos. El fallback lossy depende del switch.
                                </p>
                                <button className="btn btn-secondary" onClick={() => setShowFormatModal(true)}>
                                    <Settings size={16} /> Editar prioridad
                                </button>
                            </div>
                        </div>

                        <div>
                            <div className="field-label">Límite de tracks (opcional)</div>
                            <input
                                type="number"
                                min="1"
                                max={MAX_TRACKS_PER_JOB}
                                className="input"
                                placeholder="Todos los tracks"
                                value={trackLimit}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (!val) return setTrackLimit('');
                                    const n = Math.min(parseInt(val, 10) || 0, MAX_TRACKS_PER_JOB);
                                    setTrackLimit(n ? String(n) : '');
                                }}
                            />
                            <p className="muted" style={{ fontSize: '0.9rem', marginTop: '0.35rem' }}>
                                Máx {MAX_TRACKS_PER_JOB} tracks por job; si la playlist tiene más, tomamos los primeros {MAX_TRACKS_PER_JOB}.
                            </p>
                        </div>
                        <div>
                            <div className="field-label">Descargar por URL/ID</div>
                            <input
                                type="text"
                                className="input"
                                placeholder="Pega URL o ID de playlist de Spotify"
                                value={manualPlaylist}
                                onChange={(e) => setManualPlaylist(e.target.value)}
                            />
                            <button onClick={startDownloadManual} className="btn btn-secondary" style={{ marginTop: '0.5rem' }}>
                                <Download size={16} /> Descargar
                            </button>
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
                                        Respeta tu orden: {preferenceSummary}{allowLossy ? '' : ' (sin fallback)'}.
                                    </p>
                                    <div className="playlist-meta">
                                        <span className="chip"><Disc size={14} /> {FORMAT_LABELS[primaryFormat] || primaryFormat.toUpperCase()}</span>
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

        <AnimatePresence>
            {showFormatModal && (
                <motion.div
                    className="modal-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.55)',
                        display: 'grid',
                        placeItems: 'center',
                        zIndex: 30,
                        padding: '1rem',
                    }}
                    onClick={() => setShowFormatModal(false)}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'var(--panel, #0f1623)',
                            border: '1px solid var(--border)',
                            borderRadius: '14px',
                            padding: '1rem',
                            maxWidth: 520,
                            width: '100%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                        }}
                    >
                        <div className="panel-title" style={{ marginBottom: '0.8rem' }}>
                            <div>
                                <p className="muted" style={{ marginBottom: '6px' }}>Editor de prioridad</p>
                                <h3>Ordena los formatos</h3>
                            </div>
                            <button className="btn btn-ghost" onClick={() => setShowFormatModal(false)}>
                                <X size={16} /> Cerrar
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {formatPreference.map((fmt, idx) => {
                                const disabled = fmt === 'lossy' && !allowLossy;
                                return (
                                    <div
                                        key={fmt}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '0.65rem 0.75rem',
                                            border: '1px solid var(--border)',
                                            borderRadius: '10px',
                                            background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                            <span className="pill">#{idx + 1}</span>
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{FORMAT_LABELS[fmt]}</div>
                                                <div className="muted" style={{ fontSize: '0.85rem' }}>
                                                    {FORMAT_DESCRIPTIONS[fmt]}{disabled ? ' · Omitido mientras el fallback está apagado.' : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                                            <button
                                                className="btn btn-ghost"
                                                style={{ padding: '0.35rem', borderRadius: '10px' }}
                                                onClick={() => moveFormat(fmt, -1)}
                                                disabled={idx === 0}
                                                aria-label={`Subir ${fmt}`}
                                            >
                                                <ChevronUp size={16} />
                                            </button>
                                            <button
                                                className="btn btn-ghost"
                                                style={{ padding: '0.35rem', borderRadius: '10px' }}
                                                onClick={() => moveFormat(fmt, 1)}
                                                disabled={idx === formatPreference.length - 1}
                                                aria-label={`Bajar ${fmt}`}
                                            >
                                                <ChevronDown size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.9rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost" onClick={resetPreference}>
                                Reset orden
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowFormatModal(false)}>
                                Guardar y cerrar
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
}
