import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, AlertCircle, Loader, Download, Terminal, FileAudio, Music } from 'lucide-react';

export default function JobView() {
    const { jobId } = useParams();
    const [job, setJob] = useState(null);
    const [jobError, setJobError] = useState(null);
    const [files, setFiles] = useState([]);
    const scrollRef = useRef(null);
    const intervalRef = useRef(null);

    useEffect(() => {
        intervalRef.current = setInterval(fetchJob, 1000);
        fetchJob();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [jobId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [job?.logs]);

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
            if (err.response && err.response.status === 404) {
                setJobError('Job not found or expired. Please start a new download.');
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
        }
    };

    if (jobError) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-xl text-center max-w-md">
                    <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
                    <p className="text-red-200 mb-6">{jobError}</p>
                    <Link to="/" className="btn btn-secondary inline-block">Back to playlists</Link>
                </div>
            </div>
        );
    }

    if (!job) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader size={48} className="text-[#00ff41] animate-spin" />
            </div>
        );
    }

    const processed = job.processed_tracks || (job.ok_count + job.fail_count);
    const progress = job.total_tracks > 0 ? (processed / job.total_tracks) * 100 : 0;

    return (
        <div className="container max-w-4xl mx-auto p-6 space-y-8">
            <Link to="/" className="inline-flex items-center text-gray-400 hover:text-[#00ff41] transition-colors">
                <ArrowLeft size={20} className="mr-2" />
                Back to Playlists
            </Link>

            {/* Status Card */}
            <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl p-6 shadow-xl">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{job.playlist_name}</h1>
                        <div className="flex flex-wrap gap-3 text-sm">
                            <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-2">
                                <CheckCircle size={14} /> {job.ok_count} success
                            </span>
                            {job.fail_count > 0 && (
                                <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-2">
                                    <AlertCircle size={14} /> {job.fail_count} failed
                                </span>
                            )}
                        </div>
                    </div>

                    {files.length > 0 && (
                        <a
                            href={`/api/jobs/${jobId}/archive`}
                            className="btn btn-primary whitespace-nowrap"
                            download
                        >
                            <Download size={18} className="mr-2" />
                            Download ZIP
                        </a>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                    <div className="h-3 bg-[#222] rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-[#00ff41]"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                    <div className="flex justify-between text-xs font-mono text-gray-500">
                        <span>{processed} / {job.total_tracks} tracks</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                </div>

                {/* Current Status */}
                {job.status === 'running' && (
                    <div className="mt-6 p-4 bg-black/30 rounded-xl border border-[#222] flex items-center gap-3">
                        <Loader size={20} className="text-[#00ff41] animate-spin flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-300 truncate">
                                Processing: <span className="text-white">{job.current_track_name || "Initializing..."}</span>
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Files List */}
            <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl p-6 shadow-xl">
                <div className="flex items-center gap-2 mb-6 border-b border-[#222] pb-4">
                    <Music size={24} className="text-[#00ff41]" />
                    <h2 className="text-xl font-bold text-white">Downloaded Files ({files.length})</h2>
                </div>

                {files.length > 0 ? (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {files.map((f, index) => (
                            <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-[#141414] hover:bg-[#1a1a1a] border border-[#222] transition-colors group">
                                <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                                    <FileAudio size={20} className="text-gray-500 group-hover:text-[#00ff41] transition-colors flex-shrink-0" />
                                    <span className="text-gray-300 text-sm truncate font-medium">{f.split('/').pop()}</span>
                                </div>
                                <a
                                    href={`/api/jobs/${jobId}/file_by_index/${index}`}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00ff41]/10 text-[#00ff41] hover:bg-[#00ff41] hover:text-black transition-all text-sm font-medium whitespace-nowrap"
                                    download
                                >
                                    <Download size={16} />
                                    Descargar
                                </a>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-600 border-2 border-dashed border-[#222] rounded-xl">
                        <p>No files downloaded yet.</p>
                    </div>
                )}
            </div>

            {/* Logs */}
            <div className="bg-[#050505] border border-[#222] rounded-2xl p-6 shadow-xl">
                <div className="flex items-center gap-2 mb-4 text-gray-400">
                    <Terminal size={16} />
                    <span className="text-sm font-mono font-bold uppercase tracking-wider">Live Logs</span>
                </div>
                <div className="font-mono text-xs space-y-1 h-48 overflow-y-auto custom-scrollbar" ref={scrollRef}>
                    {job.logs.map((log, i) => (
                        <div key={i} className="text-gray-400 break-words hover:bg-[#111] px-2 py-0.5 rounded">
                            <span className="text-[#00ff41] mr-2">›</span>
                            {log}
                        </div>
                    ))}
                    {job.logs.length === 0 && (
                        <span className="text-gray-700 italic px-2">Waiting for logs...</span>
                    )}
                </div>
            </div>
        </div>
    );
}
