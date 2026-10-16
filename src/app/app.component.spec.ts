import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { EntregaLocalPersistida } from './models/entrega-local.model';
import { Task } from './models/task.model';
import { StorageService } from './services/storage.service';
import { TaskService } from './services/task.service';

const sampleTask: Task = {
  id: 'task-001',
  course: 'Programación',
  title: 'Práctica de TypeScript',
  dueDate: '2026-10-24',
  academicStatus: 'En curso'
};

const savedSubmission: EntregaLocalPersistida = {
  id: 'submission-test',
  tareaId: sampleTask.id,
  curso: sampleTask.course,
  tituloTarea: sampleTask.title,
  comentario: 'Trabajo completado',
  fechaRegistro: '2026-10-16T15:00:00.000Z',
  estadoSincronizacion: 'PENDIENTE',
  intentosSincronizacion: 0
};

describe('AppComponent', () => {
  let storage: jasmine.SpyObj<StorageService>;
  let component: AppComponent;

  beforeEach(async () => {
    storage = jasmine.createSpyObj<StorageService>(
      'StorageService',
      ['save', 'list', 'getById', 'delete', 'countPending']
    );
    storage.list.and.resolveTo([]);
    storage.countPending.and.resolveTo(0);
    storage.save.and.resolveTo(savedSubmission);
    storage.delete.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: TaskService, useValue: { getTasks: () => of([sampleTask]) } },
        { provide: StorageService, useValue: storage }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads the task list and filters by title and course together', () => {
    expect(component.tasks).toEqual([sampleTask]);
    expect(component.filteredTasks).toEqual([sampleTask]);

    component.searchTerm = 'typescript';
    component.courseFilter = 'Programación';
    expect(component.filteredTasks).toEqual([sampleTask]);

    component.courseFilter = 'Redes';
    expect(component.filteredTasks).toEqual([]);
  });

  it('clears both task filters', () => {
    component.searchTerm = 'práctica';
    component.courseFilter = 'Programación';
    component.clearFilters();
    expect(component.searchTerm).toBe('');
    expect(component.courseFilter).toBe('');
  });

  it('rejects a missing task and a blank comment without storing', async () => {
    component.comment = '   ';
    await component.submitSubmission();

    expect(component.formErrors['taskId']).toContain('Selecciona una tarea');
    expect(component.formErrors['comment']).toContain('comentario');
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('stores a valid submission as pending and refreshes the inbox', async () => {
    component.selectedTaskId = sampleTask.id;
    component.comment = '  Trabajo completado  ';
    storage.list.and.resolveTo([savedSubmission]);
    storage.countPending.and.resolveTo(1);

    await component.submitSubmission();

    expect(storage.save).toHaveBeenCalledWith(jasmine.objectContaining({
      tareaId: sampleTask.id,
      comentario: 'Trabajo completado',
      estadoSincronizacion: 'PENDIENTE',
      intentosSincronizacion: 0
    }));
    expect(component.submissions).toEqual([savedSubmission]);
    expect(component.pendingCount).toBe(1);
    expect(component.comment).toBe('');
    expect(component.successMessage).toContain('guardada correctamente');
  });

  it('ignores a second submission while the first one is being saved', async () => {
    component.selectedTaskId = sampleTask.id;
    component.comment = 'Trabajo completado';

    const firstSubmission = component.submitSubmission();
    const secondSubmission = component.submitSubmission();
    await Promise.all([firstSubmission, secondSubmission]);

    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('preserves form values and reports storage failures', async () => {
    storage.save.and.rejectWith(new Error('IndexedDB no disponible'));
    component.selectedTaskId = sampleTask.id;
    component.comment = 'Mi entrega';

    await component.submitSubmission();

    expect(component.comment).toBe('Mi entrega');
    expect(component.selectedTaskId).toBe(sampleTask.id);
    expect(component.submitError).toContain('IndexedDB no disponible');
    expect(component.successMessage).toBe('');
    expect(component.isSaving).toBeFalse();
  });

  it('loads a submission by id when showing its details', async () => {
    storage.getById.and.resolveTo(savedSubmission);

    await component.showDetails(savedSubmission);

    expect(storage.getById).toHaveBeenCalledOnceWith(savedSubmission.id);
    expect(component.detailSubmission).toEqual(savedSubmission);
  });

  it('refreshes the inbox when a submission no longer exists', async () => {
    storage.getById.and.resolveTo(undefined);

    await component.showDetails(savedSubmission);

    expect(component.detailSubmission).toBeNull();
    expect(component.storageError).toContain('ya no está disponible');
    expect(storage.list).toHaveBeenCalledTimes(2);
  });

  it('does not delete a submission when confirmation is cancelled', async () => {
    spyOn(window, 'confirm').and.returnValue(false);

    await component.deleteSubmission(savedSubmission);

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('deletes a confirmed submission and refreshes the inbox', async () => {
    spyOn(window, 'confirm').and.returnValue(true);

    await component.deleteSubmission(savedSubmission);

    expect(storage.delete).toHaveBeenCalledOnceWith(savedSubmission.id);
    expect(storage.list).toHaveBeenCalledTimes(2);
    expect(component.successMessage).toContain('eliminó correctamente');
  });

  it('does not mark local submissions synchronized when connectivity returns', () => {
    component.submissions = [savedSubmission];
    component.pendingCount = 1;
    component.onOnline();

    expect(component.isOnline).toBeTrue();
    expect(component.submissions[0].estadoSincronizacion).toBe('PENDIENTE');
    expect(component.pendingCount).toBe(1);
    expect(component.successMessage).toContain('no se ha simulado una sincronización');
  });

  it('does not simulate synchronization when retry is selected online', () => {
    component.isOnline = true;
    component.submissions = [savedSubmission];
    component.pendingCount = 1;

    component.notifySyncUnavailable();

    expect(component.submissions[0].estadoSincronizacion).toBe('PENDIENTE');
    expect(component.pendingCount).toBe(1);
    expect(component.syncNotice).toContain('No se realizó ningún intento');
  });

  it('opens and closes task details', () => {
    component.showTaskDetails(sampleTask);
    expect(component.detailTask).toEqual(sampleTask);

    component.closeTaskDetails();
    expect(component.detailTask).toBeNull();
  });
});
