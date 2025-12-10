import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Music, ArrowRight, ShieldCheck, Sparkles, UserPlus, LogIn } from 'lucide-react';
import { supabase } from '../utils/supabase';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');

    const handleLogin = async () => {
        setMessage('');
        try {
            const res = await axios.get('/api/auth/login');
            if (res.data.url) {
                window.location.href = res.data.url;
            } else {
                setMessage('Error: No recibimos URL de Spotify.');
            }
        } catch (err) {
            console.error("Login error:", err);
            setMessage("Login error: " + err.message);
        }
    };

    const handleSignup = async () => {
        setMessage('');
        if (!email || !password) {
            setMessage('Completa email y contraseña.');
            return;
        }
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });
            if (error) throw error;
            setMessage('Cuenta creada. Revisa tu correo si se requiere confirmación y luego inicia sesión.');
        } catch (e) {
            setMessage(e.message);
        }
    };

    const handleUserLogin = async () => {
        setMessage('');
        if (!email || !password) {
            setMessage('Completa email y contraseña.');
            return;
        }
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            setMessage('Sesión iniciada. Ahora conecta con Spotify.');
        } catch (e) {
            setMessage(e.message);
        }
    };

    return (
        <div className="container" style={{ minHeight: '80vh', display: 'grid', alignItems: 'center' }}>
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="surface surface-borderless two-col"
                style={{ alignItems: 'center' }}
            >
                <div>
                    <div className="eyebrow" style={{ marginBottom: '10px' }}>Nuevo look</div>
                    <h1 style={{ fontSize: '2.4rem', marginBottom: '0.4rem' }}>Conecta Spotify y baja en lossless.</h1>
                    <p className="muted" style={{ marginBottom: '1.5rem' }}>
                        Soulmate toma tu biblioteca de Spotify y la prepara para Soulseek en un click, manteniendo metadatos y priorizando formatos sin pérdida.
                    </p>

                    <div className="chip-row" style={{ marginBottom: '1.2rem' }}>
                        <span className="pill"><ShieldCheck size={15} /> Stateless & seguro</span>
                        <span className="pill"><Sparkles size={15} /> Nuevo UI más cómodo</span>
                    </div>

                    <div style={{ display: 'grid', gap: '0.65rem', color: 'var(--muted)' }}>
                        <div>• Inicio de sesión directo con Spotify.</div>
                        <div>• Descarga playlists completas o por track.</div>
                        <div>• Preferencias guardadas localmente.</div>
                    </div>

                    <div className="surface" style={{ marginTop: '1rem', padding: '1rem' }}>
                        <div className="field-label">Crea tu usuario</div>
                        <input
                            className="input"
                            placeholder="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <input
                            className="input"
                            type="password"
                            placeholder="Contraseña"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                            <button onClick={handleSignup} className="btn btn-ghost">
                                <UserPlus size={16} /> Crear cuenta
                            </button>
                            <button onClick={handleUserLogin} className="btn btn-secondary">
                                <LogIn size={16} /> Iniciar sesión
                            </button>
                        </div>
                        {message && <div className="pill" style={{ marginTop: '0.6rem' }}>{message}</div>}
                    </div>
                </div>

                <div className="surface" style={{ position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: 'radial-gradient(circle, rgba(125,251,211,0.18), transparent 60%)' }} />
                    <div style={{ position: 'absolute', bottom: -60, left: -40, width: 220, height: 220, background: 'radial-gradient(circle, rgba(255,212,121,0.16), transparent 55%)' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <div className="brand" style={{ marginBottom: '1.2rem' }}>
                            <div className="brand-mark" />
                            <div className="brand-title">
                                <strong>Soulmate</strong>
                                <span>Spotify → Soulseek</span>
                            </div>
                        </div>

                        <button
                            onClick={handleLogin}
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '1rem 1.2rem', fontSize: '1rem' }}
                        >
                            <Music size={18} />
                            Conectar con Spotify
                            <ArrowRight size={18} />
                        </button>

                        <p className="muted" style={{ marginTop: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>
                            Primero crea/inicia sesión de usuario; luego te redirigimos a Spotify. No guardamos tus credenciales de Spotify.
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
