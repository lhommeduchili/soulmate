import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Music } from 'lucide-react';

export default function Login() {
    const handleLogin = async () => {
        console.log("Login button clicked");
        try {
            console.log("Fetching /api/auth/login...");
            const res = await axios.get('/api/auth/login');
            console.log("Response:", res.data);
            if (res.data.url) {
                console.log("Redirecting to:", res.data.url);
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
            <div className="absolute inset-0 z-0 opacity-20"
                style={{
                    backgroundImage: 'radial-gradient(circle at 50% 50%, #00ff41 0%, transparent 50%)',
                    filter: 'blur(100px)'
                }}
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="z-10 text-center p-8 bg-black/50 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl max-w-md w-full"
            >
                <div className="flex justify-center mb-6">
                    <div className="p-4 rounded-full bg-green-500/10 border border-green-500/20">
                        <Music size={48} className="text-[#00ff41]" />
                    </div>
                </div>

                <h1 className="text-4xl font-bold mb-2 tracking-tight">Soulmate</h1>
                <p className="text-gray-400 mb-2">Spotify to Soulseek Lossless Downloader</p>
                <p className="text-xs text-gray-600 mb-8">v2.0 (Stateless Auth)</p>

                <button
                    onClick={handleLogin}
                    className="btn btn-primary w-full text-lg py-4"
                >
                    Connect with Spotify
                </button>
            </motion.div>
        </div>
    );
}
