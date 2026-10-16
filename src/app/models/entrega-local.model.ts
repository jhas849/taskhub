export type EstadoSincronizacion = 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR';

export interface EntregaLocal {
  id?: string;
  tareaId: string;
  curso: string;
  tituloTarea: string;
  comentario: string;
  fechaRegistro: string;
  estadoSincronizacion: EstadoSincronizacion;
  intentosSincronizacion: number;
  ultimoError?: string;
}

export interface EntregaLocalPersistida extends EntregaLocal {
  id: string;
}

export type NuevaEntregaLocal = Omit<EntregaLocal, 'id'>;
