import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntregaLocalPersistida } from './models/entrega-local.model';
import { Task } from './models/task.model';
import { StorageService } from './services/storage.service';
import { TaskService } from './services/task.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly taskService = inject(TaskService);
  private readonly storageService = inject(StorageService);

  readonly title = 'SENATI TaskHub';
  activeSection: 'tasks' | 'submissions' = 'tasks';
  tasks: Task[] = [];
  submissions: EntregaLocalPersistida[] = [];
  pendingCount = 0;
  isOnline = navigator.onLine;
  isLoadingTasks = true;
  isSaving = false;
  searchTerm = '';
  courseFilter = '';
  selectedTaskId = '';
  comment = '';
  taskError = '';
  storageError = '';
  submitError = '';
  successMessage = '';
  syncNotice = '';
  detailSubmission: EntregaLocalPersistida | null = null;
  detailTask: Task | null = null;
  formErrors: { taskId?: string; comment?: string } = {};

  ngOnInit(): void {
    this.taskService.getTasks().subscribe({
      next: (tasks) => {
        this.tasks = tasks;
        this.isLoadingTasks = false;
      },
      error: (error: unknown) => {
        this.taskError = error instanceof Error
          ? `No se pudieron cargar las tareas: ${error.message}`
          : 'No se pudieron cargar las tareas. Comprueba la conexión e inténtalo de nuevo.';
        this.isLoadingTasks = false;
      }
    });

    void this.refreshSubmissions().catch((error: unknown) => {
      this.storageError = this.storageErrorMessage(error, 'No se pudieron recuperar las entregas guardadas.');
    });
  }

  @HostListener('window:online')
  onOnline(): void {
    this.isOnline = true;
    this.successMessage = 'Conexión recuperada. Las entregas permanecen pendientes; no se ha simulado una sincronización.';
  }

  @HostListener('window:offline')
  onOffline(): void {
    this.isOnline = false;
    this.successMessage = '';
    this.syncNotice = '';
  }

  get courses(): string[] {
    return [...new Set(this.tasks.map((task) => task.course))].sort((first, second) => first.localeCompare(second));
  }

  get filteredTasks(): Task[] {
    const search = this.searchTerm.trim().toLocaleLowerCase();
    return this.tasks.filter((task) =>
      task.title.toLocaleLowerCase().includes(search)
      && (!this.courseFilter || task.course === this.courseFilter)
    );
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.courseFilter = '';
  }

  notifySyncUnavailable(): void {
    this.syncNotice = 'No se realizó ningún intento: este proyecto todavía no tiene una API académica. Las entregas siguen PENDIENTE.';
  }

  selectTask(task: Task): void {
    this.selectedTaskId = task.id;
    this.submitError = '';
    this.formErrors = {};
    document.getElementById('task-select')?.focus();
  }

  clearFormErrors(): void {
    this.formErrors = {};
    this.submitError = '';
  }

  clearCommentError(): void {
    delete this.formErrors['comment'];
    this.submitError = '';
  }

  async submitSubmission(): Promise<void> {
    if (this.isSaving) {
      return;
    }

    this.formErrors = {};
    this.submitError = '';
    this.successMessage = '';
    const task = this.tasks.find((item) => item.id === this.selectedTaskId);
    if (!task) {
      this.formErrors.taskId = 'Selecciona una tarea antes de registrar la entrega.';
    }
    if (!this.comment.trim()) {
      this.formErrors.comment = 'Escribe un comentario de entrega. No puede estar vacío.';
    }
    if (!task || !this.comment.trim()) {
      return;
    }

    this.isSaving = true;
    try {
      await this.storageService.save({
        tareaId: task.id,
        curso: task.course,
        tituloTarea: task.title,
        comentario: this.comment.trim(),
        fechaRegistro: new Date().toISOString(),
        estadoSincronizacion: 'PENDIENTE',
        intentosSincronizacion: 0
      });
      this.comment = '';
      this.selectedTaskId = '';
      this.successMessage = 'Entrega guardada correctamente en este dispositivo.';
      await this.refreshSubmissions();
    } catch (error) {
      this.submitError = this.storageErrorMessage(error, 'No se pudo guardar la entrega. Tus datos se conservaron en el formulario.');
    } finally {
      this.isSaving = false;
    }
  }

  async deleteSubmission(submission: EntregaLocalPersistida): Promise<void> {
    const confirmed = window.confirm(`¿Eliminar la entrega de “${submission.tituloTarea}”? Esta acción no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    try {
      await this.storageService.delete(submission.id);
      this.successMessage = 'La entrega local se eliminó correctamente.';
      await this.refreshSubmissions();
    } catch (error) {
      this.storageError = this.storageErrorMessage(error, 'No se pudo eliminar la entrega.');
    }
  }

  async showDetails(submission: EntregaLocalPersistida): Promise<void> {
    try {
      const stored = await this.storageService.getById(submission.id);
      if (!stored) {
        this.storageError = 'La entrega ya no está disponible en el almacenamiento local.';
        await this.refreshSubmissions();
        return;
      }
      this.detailSubmission = stored;
    } catch (error) {
      this.storageError = this.storageErrorMessage(error, 'No se pudieron consultar los detalles de la entrega.');
    }
  }

  closeDetails(): void {
    this.detailSubmission = null;
  }

  showTaskDetails(task: Task): void {
    this.detailTask = task;
  }

  closeTaskDetails(): void {
    this.detailTask = null;
  }

  trackTask(_index: number, task: Task): string {
    return task.id;
  }

  trackSubmission(_index: number, submission: EntregaLocalPersistida): string {
    return submission.id;
  }

  statusClass(status: string): string {
    return status.toLocaleLowerCase().replace(/\s+/g, '-');
  }

  formatDueDate(value: string): string {
    return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(`${value}T00:00:00`));
  }

  formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  private async refreshSubmissions(): Promise<void> {
    const [submissions, pendingCount] = await Promise.all([
      this.storageService.list(),
      this.storageService.countPending()
    ]);
    this.submissions = submissions;
    this.pendingCount = pendingCount;
  }

  private storageErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return `${fallback} ${error.message}`;
    }
    return fallback;
  }
}
