import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ArrowLeft, CheckCircle, AlertCircle, Loader, Download,
    Terminal, FileAudio, Pause, Play, CheckSquare, Square,
    LogOut, ClipboardCopy
} from 'lucide-react';
import { removeToken } from '../utils/auth';

export default function JobView() {
    const { jobId } = useParams();
    const [job, setJob] = useState(null);
    const [jobError, setJobError] = useState(null);
    const [files, setFiles] = useState([]);
    const [selectedIndices, setSelectedIndices] = useState(new Set());
    const [isPausing, setIsPausing] = useState(false);
    const [showLogs, setShowLogs] = useState(true);

    const scrollRef = useRef(null);
    const intervalRef = useRef(null);
    const jobRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        intervalRef.current = setInterval(fetchJob, 1000);
        fetchJob();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [jobId]);

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (jobRef.current && (jobRef.current.status === 'running' || jobRef.current.status === 'paused')) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    useEffect(() => {
        jobRef.current = job;
    }, [job]);

    useEffect(() => {
        if (showLogs && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [job?.logs, showLogs]);

    const fetchJob = async () => {
        try {
            const res = await axios.get(`/api/jobs/${jobId}`);
            setJob(res.data);
            setJobError(null);
            fetchFiles();
            if (res.data.status === 'completed' || res.data.status === 'failed') {
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 401) {
                navigate('/login');
            } else if (err.response && err.response.status === 404) {
                setJobError('Job not found or expired.');
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
        }
    };

    const fetchFiles = async () => {
        try {
            const res = await axios.get(`/api/jobs/${jobId}/files`);
            setFiles(res.data.files || []);
        } catch (err) {
            console.error('Failed to fetch files', err);
            if (err.response && err.response.status === 401) {
                navigate('/login');
            }
        }
    };

    const togglePause = async () => {
        if (!job) return;
        setIsPausing(true);
        try {
            if (job.status === 'running') {
                await axios.post(`/api/jobs/${jobId}/pause`);
            } else if (job.status === 'paused') {
                await axios.post(`/api/jobs/${jobId}/resume`);
            }
            fetchJob();
        } catch (err) {
            console.error("Failed to toggle pause", err);
        } finally {
            setIsPausing(false);
        }
    };

    const handleCancel = async () => {
        const currentJob = jobRef.current;
        if (!currentJob) return;
        const confirm = window.confirm("Se cancelará el job y se borrarán los archivos en el servidor. ¿Continuar?");
        if (!confirm) return;
        try {
            await axios.post(`/api/jobs/${jobId}/cancel`);
            navigate('/');
        } catch (err) {
            console.error("Failed to cancel job", err);
        }
    };

    const toggleSelection = (index) => {
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedIndices(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIndices.size === files.length) {
            setSelectedIndices(new Set());
        } else {
            const newSet = new Set();
            files.forEach((_, i) => newSet.add(i));
            setSelectedIndices(newSet);
        }
    };

    const downloadSelected = () => {
        if (selectedIndices.size === 0) return;
        const indices = Array.from(selectedIndices).join(',');
        window.location.href = `/api/jobs/${jobId}/archive?indices=${indices}`;
    };

    const handleLogout = async () => {
        const currentJob = jobRef.current;
        if (currentJob && (currentJob.status === 'running' || currentJob.status === 'paused')) {
            const ok = window.confirm("Se cancelará el job y se borrarán los archivos en el servidor. ¿Cerrar sesión igual?");
            if (!ok) return;
            try {
                await axios.post(`/api/jobs/${jobId}/cancel`);
            } catch (e) {
                console.error('Failed to cancel on logout', e);
            }
        }
        removeToken();
        axios.post('/api/auth/logout').finally(() => {
            window.location.href = '/login';
        });
    };

    const handleCopyLogs = async () => {
        try {
            const text = (job?.logs || []).join('\n');
            await navigator.clipboard.writeText(text);
            // Optional: small UX feedback? keep console log to avoid extra UI
            console.log('Logs copied to clipboard');
        } catch (err) {
            console.error('Failed to copy logs', err);
        }
    };

    if (jobError) {
        return (
            <div className="container">
                <div className="surface" style={{ textAlign: 'center', maxWidth: 540, margin: '0 auto' }}>
                    <AlertCircle size={42} color="#ff7b7b" />
                    <h2 style={{ marginTop: '0.8rem' }}>No encontramos el job</h2>
                    <p className="muted" style={{ marginBottom: '1.2rem' }}>{jobError}</p>
                    <Link to="/" className="btn btn-ghost">
                        <ArrowLeft size={16} /> Volver a playlists
                    </Link>
                </div>
            </div>
        );
    }

    if (!job) {
        return (
            <div className="container" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
                <Loader size={48} color="#7dfbd3" className="animate-spin" />
            </div>
        );
    }

    const processed = job.processed_tracks || (job.ok_count + job.fail_count);
    const progress = job.total_tracks > 0 ? (processed / job.total_tracks) * 100 : 0;
    const isAllSelected = files.length > 0 && selectedIndices.size === files.length;
    const failedTracks = job.failed_tracks || [];

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
                    <button className="btn btn-ghost" onClick={() => {
                        if (job.status === 'running' || job.status === 'paused') {
                            const ok = window.confirm("Si vuelves atrás mientras el job está activo se cancelará y se borrarán sus archivos. ¿Volver?");
                            if (!ok) return;
                            handleCancel();
                            return;
                        }
                        navigate('/');
                    }}>
                    <ArrowLeft size={16} /> Volver a playlists
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span className="pill">Job #{jobId}</span>
                    <button className="btn btn-ghost" onClick={handleLogout}>
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </div>

            <div className="surface surface-borderless">
                <div className="panel-title">
                    <div>
                        <div className="eyebrow" style={{ marginBottom: '8px' }}>Descarga en curso</div>
                        <h1 style={{ marginBottom: '0.4rem' }}>{job.playlist_name}</h1>
                        <div className="chip-row">
                            <span className="chip success"><CheckCircle size={14} /> {job.ok_count} completados</span>
                            {job.fail_count > 0 && <span className="chip danger"><AlertCircle size={14} /> {job.fail_count} fallidos</span>}
                            <span className={`status-badge ${job.status === 'running' ? 'status-running' : job.status === 'paused' ? 'status-paused' : 'status-idle'}`}>
                                {job.status}
                            </span>
                        </div>
                    </div>
                    {(job.status === 'running' || job.status === 'paused') && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={togglePause} className="btn btn-primary" disabled={isPausing}>
                                {isPausing ? <Loader size={18} className="animate-spin" /> :
                                    job.status === 'running' ? <><Pause size={18} /> Pausar</> : <><Play size={18} /> Reanudar</>}
                            </button>
                            <button onClick={handleCancel} className="btn btn-ghost danger">
                                Terminar y borrar
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '1rem' }}>
                    <div className="progress">
                        <motion.div
                            className="progress-bar"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.35 }}
                            style={{ background: job.status === 'paused' ? 'linear-gradient(90deg, #ffd479, #ffce73)' : undefined }}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: 'var(--muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.9rem' }}>
                        <span>{processed} / {job.total_tracks} tracks procesados</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                </div>

                {job.status === 'running' && (
                    <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        <Loader size={20} className="animate-spin" color="#7dfbd3" />
                        <div>
                            <div style={{ color: 'var(--text)', fontWeight: 600 }}>{job.current_track_name || "Inicializando..."}</div>
                            {(job.current_download_percent > 0 || job.current_download_state) && (
                                <div className="muted" style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem' }}>
                                    {job.current_download_state || 'descargando'} · {job.current_download_percent || 0}%
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid-two" style={{ marginTop: '1.5rem' }}>
                <div className="surface">
                    <div className="panel-title">
                        <div>
                            <p className="muted" style={{ marginBottom: '6px' }}>Archivos</p>
                            <h2>Descargados ({files.length})</h2>
                        </div>
                        <button
                            onClick={downloadSelected}
                            disabled={selectedIndices.size === 0}
                            className="btn btn-primary"
                            style={{ opacity: selectedIndices.size === 0 ? 0.6 : 1, cursor: selectedIndices.size === 0 ? 'not-allowed' : 'pointer' }}
                        >
                            <Download size={16} /> Bajar selección ({selectedIndices.size})
                        </button>
                    </div>

                    {files.length > 0 ? (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '60px', textAlign: 'center' }}>
                                            <button onClick={toggleSelectAll} className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem' }}>
                                                {isAllSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                            </button>
                                        </th>
                                        <th>Filename</th>
                                        <th style={{ textAlign: 'right' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {files.map((f, index) => {
                                        const isSelected = selectedIndices.has(index);
                                        return (
                                            <tr
                                                key={index}
                                                onClick={() => toggleSelection(index)}
                                                style={{
                                                    background: isSelected ? 'rgba(125,251,211,0.08)' : 'transparent',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <td style={{ textAlign: 'center' }}>
                                                    {isSelected ? <CheckSquare size={18} color="#7dfbd3" /> : <Square size={18} color="var(--muted)" />}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                        <FileAudio size={18} color="var(--muted)" />
                                                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{f.split('/').pop()}</span>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <a
                                                        href={`/api/jobs/${jobId}/file_by_index/${index}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="small-btn"
                                                        style={{ textDecoration: 'none' }}
                                                        download
                                                    >
                                                        <Download size={14} /> Descargar
                                                    </a>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state">Aún no hay archivos descargados.</div>
                    )}
                </div>

                <div className="surface">
                    <div className="panel-title">
                        <div>
                            <p className="muted" style={{ marginBottom: '6px' }}>Bitácora</p>
                            <h2>Logs en vivo</h2>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="small-btn" onClick={handleCopyLogs} title="Copiar logs al portapapeles">
                                <ClipboardCopy size={14} /> Copiar
                            </button>
                            <button className="small-btn" onClick={() => setShowLogs(!showLogs)}>
                                <Terminal size={14} /> {showLogs ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>
                    </div>

                    {showLogs ? (
                        <div className="log-pane" ref={scrollRef}>
                            {job.logs.map((log, i) => (
                                <div key={i} className="log-line">
                                    <span style={{ color: 'var(--accent)' }}>› </span>
                                    {log}
                                </div>
                            ))}
                            {job.logs.length === 0 && (
                                <div className="muted">Esperando logs…</div>
                            )}
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: '1.4rem' }}>Logs ocultos para esta sesión.</div>
                    )}
                </div>
            </div>

            <div className="surface" style={{ marginTop: '1.5rem' }}>
                <div className="panel-title">
                    <div>
                        <p className="muted" style={{ marginBottom: '6px' }}>Pendientes / fallidos</p>
                        <h2>Fuentes no descargadas ({failedTracks.length})</h2>
                    </div>
                </div>
                {failedTracks.length === 0 ? (
                    <div className="empty-state">Todo ok por ahora.</div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Track</th>
                                    <th>Búsquedas</th>
                                    <th>Intentos</th>
                                    <th>Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {failedTracks.map((ft, idx) => (
                                    <tr key={`${ft.title}-${idx}`}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{ft.artist} - {ft.title}</div>
                                            <div className="muted" style={{ fontSize: '0.85rem' }}>{ft.album}</div>
                                        </td>
                                        <td>
                                            <div className="chip-row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                                                {(ft.search_results && ft.search_results.length > 0 ? ft.search_results : (ft.queries || []).map(q => ({ query: q, hits: null }))).map((sr, qIdx) => (
                                                    <span key={qIdx} className="chip">
                                                        {sr.query}
                                                        {sr.hits !== null && sr.hits !== undefined ? ` (${sr.hits} hits${sr.lossless_only === false ? ', lossy' : ''})` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ maxWidth: 280 }}>
                                                {(ft.candidates || []).map((c, cIdx) => (
                                                    <div key={cIdx} className="muted" style={{ fontSize: '0.85rem' }}>• {c}</div>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ maxWidth: 260 }}>
                                            <div className="muted" style={{ fontSize: '0.95rem' }}>{ft.message}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
