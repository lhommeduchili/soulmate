import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
      setMessage('Failed to fetch candidates');
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
      setMessage(`Downloaded: ${track.artist} - ${track.title}`);
    } catch (e) {
      console.error(e);
      setMessage(`Error: ${e.response?.data?.detail || e.message}`);
    } finally {
      setDownloading(null);
    }
  };

  if (loading) return <div className="p-8">Loading candidates...</div>;
  if (!data) return <div className="p-8 text-red-400">No data</div>;

  return (
    <div className="container">
      <Link to="/" className="text-[#00ff41] underline mb-4 inline-flex items-center">&larr; Back to Playlists</Link>
      <h1 className="text-3xl font-bold mb-4">Candidates for {data.playlist_name}</h1>
      {message && <div className="mb-4 text-sm text-gray-200">{message}</div>}

      <div className="space-y-3">
        {data.tracks.map((t, idx) => (
          <div key={`${t.artist}-${t.title}-${idx}`} className="card">
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggle(idx)}>
              <div>
                <div className="font-semibold">{t.artist} - {t.title}</div>
                <div className="text-xs text-gray-500">{t.album}</div>
              </div>
              {expanded[idx] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
            {expanded[idx] && (
              <div className="mt-3 space-y-2">
                {t.candidates.length === 0 && <div className="text-sm text-gray-500">No candidates</div>}
                {t.candidates.map((c, j) => (
                  <motion.div
                    key={`${c.username}-${c.filename}-${j}`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-between items-center bg-black/30 border border-gray-800 p-2 rounded"
                  >
                    <div className="text-sm">
                      <div className="font-mono text-gray-200 truncate">{c.filename}</div>
                      <div className="text-gray-500 text-xs">
                        {c.username} · {formatSize(c.size)} · v={c.reported_speed ? `${(c.reported_speed/1024).toFixed(0)} KB/s` : '?'} · q={c.peer_queue_len ?? '?'}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={downloading !== null}
                      onClick={() => downloadCandidate(t, c)}
                    >
                      {downloading ? 'Working...' : <Download size={16} />}
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
