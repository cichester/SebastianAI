import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { HistoryEntry } from '../types';

/**
 * Recupera la cronologia dell'utente loggato.
 */
export async function getUserHistory(userId: string): Promise<HistoryEntry[]> {
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.history || [];
    } else {
      return [];
    }
  } catch (error) {
    console.error("Errore nel recupero della history:", error);
    return [];
  }
}

/**
 * Salva (sovrascrive) l'intera cronologia dell'utente.
 */
export async function saveUserHistory(userId: string, history: HistoryEntry[]): Promise<void> {
  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, { history }, { merge: true });
  } catch (error) {
    console.error("Errore nel salvataggio della history:", error);
  }
}
