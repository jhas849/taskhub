import { Injectable } from '@angular/core';
import {
  EntregaLocalPersistida,
  EstadoSincronizacion,
  NuevaEntregaLocal
} from '../models/entrega-local.model';

const DATABASE_NAME = 'senati-taskhub';
const STORE_NAME = 'entregas';
const LEGACY_STORE_NAME = 'submissions';
const DATABASE_VERSION = 2;
const SYNC_INDEX = 'estadoSincronizacion';

interface LegacySubmission {
  localId: string;
  taskId: string;
  course: string;
  taskTitle: string;
  comment: string;
  createdAt: string;
  syncStatus: EstadoSincronizacion;
  syncAttempts: number;
  lastError?: string;
}

function isEstadoSincronizacion(value: unknown): value is EstadoSincronizacion {
  return value === 'PENDIENTE' || value === 'SINCRONIZADO' || value === 'ERROR';
}

function migrateLegacySubmission(value: unknown): EntregaLocalPersistida {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Una entrega antigua de IndexedDB tiene un formato no válido.');
  }

  const legacy = value as Partial<LegacySubmission>;
  if (
    typeof legacy.localId !== 'string'
    || typeof legacy.taskId !== 'string'
    || typeof legacy.course !== 'string'
    || typeof legacy.taskTitle !== 'string'
    || typeof legacy.comment !== 'string'
    || typeof legacy.createdAt !== 'string'
    || !isEstadoSincronizacion(legacy.syncStatus)
    || typeof legacy.syncAttempts !== 'number'
  ) {
    throw new Error('Una entrega antigua de IndexedDB no se pudo migrar porque sus campos no son válidos.');
  }

  return {
    id: legacy.localId,
    tareaId: legacy.taskId,
    curso: legacy.course,
    tituloTarea: legacy.taskTitle,
    comentario: legacy.comment,
    fechaRegistro: legacy.createdAt,
    estadoSincronizacion: legacy.syncStatus,
    intentosSincronizacion: legacy.syncAttempts,
    ...(typeof legacy.lastError === 'string' ? { ultimoError: legacy.lastError } : {})
  };
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private databasePromise: Promise<IDBDatabase> | undefined;

  save(submission: NuevaEntregaLocal): Promise<EntregaLocalPersistida> {
    const saved: EntregaLocalPersistida = {
      ...submission,
      id: this.createLocalId()
    };

    return this.execute('readwrite', (store) => store.add(saved)).then(() => saved);
  }

  list(): Promise<EntregaLocalPersistida[]> {
    return this.execute('readonly', (store) => store.getAll()).then((submissions) =>
      submissions.sort((first, second) => second.fechaRegistro.localeCompare(first.fechaRegistro))
    );
  }

  getById(id: string): Promise<EntregaLocalPersistida | undefined> {
    return this.execute('readonly', (store) => store.get(id));
  }

  delete(id: string): Promise<void> {
    return this.execute('readwrite', (store) => store.delete(id)).then(() => undefined);
  }

  countPending(): Promise<number> {
    return this.execute('readonly', (store) => store.index(SYNC_INDEX).count('PENDIENTE'));
  }

  private execute<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    return this.openDatabase().then((database) => new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      let request: IDBRequest<T>;
      let settled = false;
      const fail = (error: DOMException | Error | null, fallback: string): void => {
        if (!settled) {
          settled = true;
          reject(error ?? new Error(fallback));
        }
      };

      try {
        transaction = database.transaction(STORE_NAME, mode);
        request = operation(transaction.objectStore(STORE_NAME));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('No se pudo iniciar la operación en IndexedDB.'));
        return;
      }

      request.onerror = () => fail(request.error, 'No se pudo completar la operación en IndexedDB.');
      transaction.onerror = () => fail(transaction.error, 'Ocurrió un error en la transacción de IndexedDB.');
      transaction.onabort = () => fail(transaction.error, 'La transacción de IndexedDB fue cancelada.');
      transaction.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(request.result);
        }
      };
    }));
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
    }

    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = (event) => {
          const database = request.result;
          const transaction = request.transaction;
          if (!transaction) {
            reject(new Error('No se pudo iniciar la migración de IndexedDB.'));
            return;
          }

          const submissionsStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          submissionsStore.createIndex(SYNC_INDEX, 'estadoSincronizacion', { unique: false });

          if (event.oldVersion < 2 && database.objectStoreNames.contains(LEGACY_STORE_NAME)) {
            const legacyStore = transaction.objectStore(LEGACY_STORE_NAME);
            const cursorRequest = legacyStore.openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) {
                database.deleteObjectStore(LEGACY_STORE_NAME);
                return;
              }

              try {
                submissionsStore.add(migrateLegacySubmission(cursor.value));
                cursor.continue();
              } catch (error) {
                transaction.abort();
                reject(error instanceof Error ? error : new Error('No se pudieron migrar las entregas locales.'));
              }
            };
            cursorRequest.onerror = () => {
              transaction.abort();
              reject(cursorRequest.error ?? new Error('No se pudieron leer las entregas para la migración.'));
            };
          }
        };

        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {
            database.close();
            this.databasePromise = undefined;
          };
          resolve(database);
        };
        request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
        request.onblocked = () => reject(new Error('IndexedDB está bloqueado por otra pestaña abierta.'));
      });

      void this.databasePromise.catch(() => {
        this.databasePromise = undefined;
      });
    }

    return this.databasePromise;
  }

  private createLocalId(): string {
    return `entrega-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
