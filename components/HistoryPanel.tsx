
import React, { useState } from 'react';
import type { HistoryEntry } from '../types';
import { TrashIcon, PencilIcon } from './icons';

interface HistoryPanelProps {
    history: HistoryEntry[];
    onLoad: (entry: HistoryEntry) => void;
    onDelete: (id: number) => void;
    onUpdateTitle: (id: number, newTitle: string) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, onLoad, onDelete, onUpdateTitle }) => {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');

    const handleEditClick = (e: React.MouseEvent, entry: HistoryEntry) => {
        e.stopPropagation();
        setEditingId(entry.id);
        setEditText(entry.title);
    };

    const handleDeleteClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation(); 
        onDelete(id);
    };

    const handleSaveTitle = () => {
        if (editingId !== null && editText.trim()) {
            onUpdateTitle(editingId, editText.trim());
        }
        setEditingId(null);
        setEditText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSaveTitle();
        } else if (e.key === 'Escape') {
            setEditingId(null);
            setEditText('');
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 w-full transition-colors">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Cronologia Bozze</h2>
            {history.length === 0 ? (
                <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                    <p>Nessuna bozza salvata.</p>
                    <p className="text-sm">Le bozze generate con successo appariranno qui.</p>
                </div>
            ) : (
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {history.map(entry => (
                        <li key={entry.id}>
                            <button
                                onClick={() => editingId !== entry.id && onLoad(entry)}
                                disabled={editingId === entry.id}
                                className="w-full text-left p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all group flex justify-between items-center"
                            >
                                <div className="flex-grow min-w-0 mr-2">
                                    {editingId === entry.id ? (
                                        <input
                                            type="text"
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            onBlur={handleSaveTitle}
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-full bg-white dark:bg-slate-600 px-2 py-1 rounded border border-indigo-500 ring-1 ring-indigo-500 text-slate-800 dark:text-slate-200 font-semibold"
                                        />
                                    ) : (
                                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{entry.title}</p>
                                    )}
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        Creato il: {new Date(entry.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
                                     {editingId !== entry.id && (
                                        <>
                                            <div
                                                onClick={(e) => handleEditClick(e, entry)}
                                                className="p-2 rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-300"
                                                aria-label="Modifica titolo"
                                            >
                                                <PencilIcon className="w-4 h-4" />
                                            </div>
                                            <div
                                                onClick={(e) => handleDeleteClick(e, entry.id)}
                                                className="p-2 rounded-full text-slate-400 dark:text-slate-500 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-600 dark:hover:text-red-400"
                                                aria-label="Elimina bozza"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </div>
                                        </>
                                     )}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default HistoryPanel;
