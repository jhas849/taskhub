import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Task } from '../models/task.model';

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const task = value as Record<string, unknown>;
  return typeof task['id'] === 'string'
    && typeof task['course'] === 'string'
    && typeof task['title'] === 'string'
    && typeof task['dueDate'] === 'string'
    && typeof task['academicStatus'] === 'string';
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  getTasks(): Observable<Task[]> {
    return this.http.get<unknown>('/assets/tasks.json').pipe(
      map((data) => {
        if (!Array.isArray(data) || !data.every(isTask)) {
          throw new Error('El archivo de tareas no tiene el formato esperado.');
        }
        return data;
      })
    );
  }
}
