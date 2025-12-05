import React from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Music, ArrowRight } from 'lucide-react';

export default function Login() {
    const handleLogin = async () => {
        try {
            const res = await axios.get('/api/auth/login');
            if (res.data.url) {
                window.location.href = res.data.url;
            } else {
                alert("Error: No URL received from server");
            }
        } catch (err) {
            console.error("Login error:", err);
            alert("Login error: " + err.message);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 z-0 opacity-30"
                style={{
                    backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0, 255, 65, 0.15) 0%, transparent 60%)',
                }}
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="z-10 text-center p-10 bg-[#0f0f0f] rounded-3xl border border-[#222] shadow-2xl max-w-md w-full relative overflow-hidden group"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00ff41] to-transparent opacity-50" />

                <div className="flex justify-center mb-8">
                    <div className="p-5 rounded-2xl bg-[#00ff41]/5 border border-[#00ff41]/20 shadow-[0_0_30px_rgba(0,255,65,0.1)] group-hover:shadow-[0_0_50px_rgba(0,255,65,0.2)] transition-shadow duration-500">
                        <Music size={48} className="text-[#00ff41]" />
                    </div>
                </div>

                <h1 className="text-4xl font-bold mb-3 tracking-tight text-white">Soulmate</h1>
                <p className="text-gray-400 mb-10 text-lg">Spotify to Soulseek Lossless Downloader</p>

                <button
                    onClick={handleLogin}
                    className="btn btn-primary w-full text-lg py-4 flex items-center justify-center gap-3 group/btn"
                >
                    <span>Connect with Spotify</span>
                    <ArrowRight size={20} className="group-hover/btn:translate-x-1 transition-transform" />
                </button>

                <p className="mt-8 text-xs text-gray-600 font-mono">v2.0 · Stateless Auth</p>
            </motion.div>
        </div>
    );
}
