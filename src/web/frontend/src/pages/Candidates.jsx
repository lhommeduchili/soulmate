import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Download, ChevronDown, ChevronUp } from 'lucide-react';

function formatSize(bytes) {
  if (!bytes) return '?';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

export default function Candidates() {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [downloading, setDownloading] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCandidates();
  }, [playlistId]);

  const fetchCandidates = async () => {
    try {
      const res = await axios.get(`/api/playlists/${playlistId}/candidates`);
      setData(res.data);
    } catch (e) {
      console.error(e);
      if (e.response && e.response.status === 401) {
        navigate('/login');
        return;
      }
      setMessage('No pudimos obtener los candidatos');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (idx) => {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const downloadCandidate = async (track, cand) => {
    setDownloading(`${track.title}-${cand.filename}`);
    setMessage('');
    try {
      await axios.post('/api/download_candidate', {
        playlist_id: playlistId,
        playlist_name: data.playlist_name,
        track,
        candidate: cand,
      });
      setMessage(`Descargado: ${track.artist} - ${track.title}`);
    } catch (e) {
      console.error(e);
      if (e.response && e.response.status === 401) {
        navigate('/login');
        return;
      }
      setMessage(`Error: ${e.response?.data?.detail || e.message}`);
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
        Cargando candidatos…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container">
        <div className="empty-state">No hay datos de candidatos.</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
        <Link to="/" className="btn btn-ghost">← Volver</Link>
        <span className="pill">{data.tracks.length} tracks</span>
      </div>

      <div className="surface surface-borderless">
        <div className="panel-title">
          <div>
            <div className="eyebrow" style={{ marginBottom: '8px' }}>Candidatos</div>
            <h1>Playlist: {data.playlist_name}</h1>
            <p className="muted">Elige manualmente qué versión descargar para cada track.</p>
          </div>
        </div>

        {message && <div className="pill" style={{ margin: '1rem 0' }}>{message}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
          {data.tracks.map((t, idx) => (
            <div key={`${t.artist}-${t.title}-${idx}`} className="accordion">
              <div className="accordion-header" onClick={() => toggle(idx)}>
                <div>
                  <div style={{ fontWeight: 700 }}>{t.artist} - {t.title}</div>
                  <div className="muted" style={{ fontSize: '0.9rem' }}>{t.album}</div>
                </div>
                {expanded[idx] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>

              {expanded[idx] && (
                <div className="accordion-body">
                  {t.candidates.length === 0 && <div className="muted">No hay candidatos</div>}
                  {t.candidates.map((c, j) => (
                    <motion.div
                      key={`${c.username}-${c.filename}-${j}`}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="candidate-row"
                    >
                      <div>
                        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{c.filename}</div>
                        <div className="candidate-meta">
                          {c.username} · {formatSize(c.size)} · v={c.reported_speed ? `${(c.reported_speed / 1024).toFixed(0)} KB/s` : '?'} · q={c.peer_queue_len ?? '?'}
                        </div>
                      </div>
                      <button
                        className="btn btn-primary"
                        disabled={downloading !== null}
                        onClick={() => downloadCandidate(t, c)}
                        style={{ minWidth: '140px', justifyContent: 'center' }}
                      >
                        {downloading ? 'Procesando...' : <><Download size={16} /> Descargar</>}
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
