import React, { useState, useEffect } from 'react';
import { CheckIcon, XMarkIcon } from './icons';

interface SettingsModalProps {
    currentUrl: string | null;
    onClose: () => void;
    onSave: (url: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ currentUrl, onClose, onSave }) => {
    const [url, setUrl] = useState(currentUrl || '');
    const handleSave = () => {
        onSave(''); // We don't need to save the URL anymore
    };

    const handleGoogleConnect = () => {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');
        window.location.href = `${backendUrl}/auth/google`;
    };
    
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 dark:bg-opacity-80 flex items-center justify-center p-4 z-50 transition-opacity"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col transition-colors"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Impostazioni</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8">

                    {/* Google App Section */}
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Integrazione Google (Docs & Forms)</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Collega il tuo account Google per permettere a Sebastian AI di creare automaticamente quiz e documenti nel tuo Google Drive.
                        </p>
                        
                        {localStorage.getItem('googleAccessToken') ? (
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex justify-between items-center">
                                <div className="flex items-center text-green-700 dark:text-green-400">
                                    <CheckIcon className="w-5 h-5 mr-2" />
                                    <span className="font-semibold">Account Google Collegato</span>
                                </div>
                                <button
                                    onClick={() => {
                                        localStorage.removeItem('googleAccessToken');
                                        window.location.reload();
                                    }}
                                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
                                >
                                    Scollega
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={handleGoogleConnect}
                                className="inline-flex items-center justify-center px-6 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition w-full md:w-auto"
                            >
                                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    <path fill="none" d="M1 1h22v22H1z" />
                                </svg>
                                <span className="font-semibold text-slate-700 dark:text-slate-200">Collega Account Google</span>
                            </button>
                        )}
                    </div>
                </div>
                <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition"
                    >
                        Annulla
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
                    >
                        Salva e Chiudi
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;