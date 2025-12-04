import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, AlertCircle, Loader } from 'lucide-react';

export default function JobView() {
    const { jobId } = useParams();
    const [job, setJob] = useState(null);
    const [jobError, setJobError] = useState(null);
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
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 404) {
                setJobError('Job not found or expired. Please start a new download.');
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
        }
    };

    if (jobError) {
        return (
            <div className="p-8 text-red-400">
                {jobError} <Link to="/" className="text-[#00ff41] underline ml-2">Back to playlists</Link>
            </div>
        );
    }

    if (!job) return <div className="p-8">Loading job...</div>;

    const progress = job.total_tracks > 0 ? (job.current_track_index / job.total_tracks) * 100 : 0;

    return (
        <div className="container max-w-4xl">
            <Link to="/" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
                <ArrowLeft size={20} className="mr-2" /> Back to Playlists
            </Link>

            <div className="card mb-8">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">{job.playlist_name}</h1>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                            <span className="flex items-center gap-1">
                                <CheckCircle size={16} className="text-green-500" /> {job.ok_count} found
                            </span>
                            <span className="flex items-center gap-1">
                                <AlertCircle size={16} className="text-red-500" /> {job.fail_count} failed
                            </span>
                        </div>
                    </div>

                    {job.status === 'completed' && (
                        <a
                            href={`/api/jobs/${jobId}/download`}
                            className="btn btn-primary"
                            download
                        >
                            Download ZIP
                        </a>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden mb-2">
                    <motion.div
                        className="absolute top-0 left-0 h-full bg-[#00ff41]"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
                <div className="flex justify-between text-xs font-mono text-gray-500 mb-6">
                    <span>{job.current_track_index} / {job.total_tracks}</span>
                    <span>{Math.round(progress)}%</span>
                </div>

                {job.status === 'running' && (
                    <div className="flex items-center gap-3 text-[#00ff41] animate-pulse">
                        <Loader size={20} className="animate-spin" />
                        <span>Processing: {job.current_track_name || "Initializing..."}</span>
                    </div>
                )}
            </div>

            {/* Terminal/Logs */}
            <div className="bg-black border border-gray-800 rounded-lg p-4 font-mono text-sm h-96 overflow-y-auto" ref={scrollRef}>
                {job.logs.map((log, i) => (
                    <div key={i} className="mb-1 text-gray-300 border-l-2 border-transparent hover:border-gray-700 pl-2">
                        <span className="text-green-900 mr-2">$</span>
                        {log}
                    </div>
                ))}
                {job.logs.length === 0 && <span className="text-gray-700">Waiting for logs...</span>}
            </div>
        </div>
    );
}
