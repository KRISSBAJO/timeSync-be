import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  AuthProvider,
  CompensationChangeStatus,
  CompensationComponentType,
  DocumentVerificationStatus,
  DocumentVisibility,
  EmployeeBackgroundCheckStatus,
  EmployeeClearanceStatus,
  EmployeeClearanceType,
  EmployeeExitRecordStatus,
  EmploymentContractType,
  EmploymentTermStatus,
  EmployeeImportJobStatus,
  EmployeeImportRowStatus,
  EmployeeLifecyclePlanStatus,
  EmployeeLifecyclePlanType,
  EmployeeLifecycleTemplateStatus,
  EmployeeLifecycleTaskOwnerType,
  EmployeeLifecycleTaskStatus,
  EmployeeReferenceStatus,
  EmployeeStatutoryIdentifierStatus,
  EmployeeStatutoryIdentifierType,
  EmployeeStatus,
  EmploymentType,
  EmployeeRehirePolicy,
  EmployeeRehireRecordStatus,
  InvitationStatus,
  NotificationChannel,
  NotificationStatus,
  PayFrequency,
  PayoutAccountStatus,
  ReportingRelationshipStatus,
  ReportingRelationshipType,
  TimelineEventType,
  UserStatus,
  UserType,
  WorkforceLeadershipRole,
  WorkforceActionStatus,
  WorkforceActionType,
  WorkEligibilityStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import { PasswordService } from '../auth/password.service';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateDocumentVersionUploadIntentDto } from '../documents/dto/create-document-version-upload-intent.dto';
import { DocumentStorageService } from '../documents/storage/document-storage.service';
import { NotificationDeliveryService } from '../notifications/delivery/notification-delivery.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import {
  EmployeeLifecycleDto,
  HireEmployeeDto,
  RehireEmployeeDto,
  ReinstateEmployeeDto,
  SeparateEmployeeDto,
} from './dto/employee-lifecycle.dto';
import {
  CreateEmployeeClearanceItemDto,
  CreateEmployeeRehireRecordDto,
  StartEmployeeOffboardingDto,
  UpdateEmployeeClearanceItemDto,
  UpdateEmployeeExitRecordDto,
} from './dto/employee-exit-governance.dto';
import {
  BlockEmployeeLifecycleTaskDto,
  CompleteEmployeeLifecycleTaskDto,
  CreateEmployeeLifecyclePlanDto,
  CreateEmployeeLifecycleTemplateDto,
  CreateEmployeeLifecycleTemplateTaskDto,
  CreateEmployeeLifecycleTaskDto,
  CreateMyEmployeeDocumentDto,
  InstantiateEmployeeLifecycleTemplateDto,
  RemindEmployeeLifecycleTaskDto,
  UpdateEmployeeLifecyclePlanDto,
  UpdateEmployeeLifecycleTemplateDto,
  UpdateEmployeeLifecycleTemplateTaskDto,
  UpdateEmployeeLifecycleTaskDto,
  WaiveEmployeeLifecycleTaskDto,
} from './dto/employee-lifecycle-plan.dto';
import {
  CreateEmployeeCompensationChangeDto,
  CreateEmployeeReportingRelationshipDto,
  UpdateEmployeeReportingRelationshipDto,
  UpsertEmployeeCompensationComponentDto,
  UpsertEmployeeEmploymentTermDto,
} from './dto/employee-employment-terms.dto';
import {
  UpdateEmployeeDemographicProfileDto,
  UpdateEmployeeExtendedProfileDto,
  UpdateEmployeeMasterDataDto,
  UpdateEmployeeSelfServiceMasterDataDto,
  UpdateSelfServiceAddressDto,
  UpdateSelfServiceEmergencyContactDto,
  UpsertEmployeeBackgroundCheckDto,
  UpsertEmployeeDependentDto,
  UpsertEmployeePayoutAccountDto,
  UpsertEmployeeReferenceDto,
  UpsertEmployeeReferenceDocumentDto,
  UpsertEmployeeStatutoryIdentifierDto,
  UpsertEmployeeWorkEligibilityDto,
} from './dto/employee-master-data.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import {
  CreateLeadershipDesignationDto,
  ListLeadershipPoolQueryDto,
  UpdateLeadershipDesignationDto,
} from './dto/leadership-designation.dto';
import {
  CommitEmployeeImportDto,
  PreviewEmployeeImportDto,
} from './dto/preview-employee-import.dto';
import { LinkEmployeeAccountDto } from './dto/link-employee-account.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const ACTIVE_EMPLOYMENT_STATUSES = [
  EmployeeStatus.PREBOARDING,
  EmployeeStatus.ACTIVE,
  EmployeeStatus.PROBATION,
  EmployeeStatus.SUSPENDED,
];

const TERMINAL_EMPLOYMENT_STATUSES = [
  EmployeeStatus.SEPARATED,
  EmployeeStatus.RETIRED,
  EmployeeStatus.ALUMNI,
  EmployeeStatus.ARCHIVED,
];

const HIRE_TARGET_STATUSES: EmployeeStatus[] = [
  EmployeeStatus.ACTIVE,
  EmployeeStatus.PROBATION,
];

const REHIRE_TARGET_STATUSES: EmployeeStatus[] = [
  EmployeeStatus.PREBOARDING,
  EmployeeStatus.ACTIVE,
  EmployeeStatus.PROBATION,
];

const EMPLOYEE_IMPORT_TRANSACTION_OPTIONS = {
  maxWait: 15000,
  timeout: 120000,
} as const;
const EMPLOYEE_IMPORT_WORKER_INTERVAL_MS = 3000;
const EMPLOYEE_IMPORT_WORKER_STALE_LOCK_MS = 5 * 60 * 1000;
const EMPLOYEE_IMPORT_WORKER_ROW_BATCH_SIZE = 25;
const TENANT_WIDE_WORKFORCE_ROLES = new Set(['TENANT_ADMIN', 'HR_ADMIN', 'HR_MANAGER']);
const TEAM_WORKFORCE_ROLES = new Set(['MANAGER', 'TEAM_LEAD']);

@Injectable()
export class EmployeesService implements OnModuleInit, OnModuleDestroy {
  private importWorkerTimer?: NodeJS.Timeout;
  private importWorkerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly notificationDelivery: NotificationDeliveryService,
    private readonly config: ConfigService,
    private readonly documentStorage: DocumentStorageService,
  ) {}

  onModuleInit() {
    this.importWorkerTimer = setInterval(() => {
      this.scheduleEmployeeImportWorker();
    }, EMPLOYEE_IMPORT_WORKER_INTERVAL_MS);
    this.importWorkerTimer.unref?.();
    this.scheduleEmployeeImportWorker();
  }

  onModuleDestroy() {
    if (this.importWorkerTimer) {
      clearInterval(this.importWorkerTimer);
    }
  }

  async previewEmployeeNumber(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const setting = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: {
        employeeNumberPrefix: true,
        employeeNumberNextSeq: true,
      },
    });

    const nextSequence = setting?.employeeNumberNextSeq ?? 1;

    return {
      employeeNumber: this.formatEmployeeNumber(setting?.employeeNumberPrefix, nextSequence),
      prefix: setting?.employeeNumberPrefix ?? 'EMP',
      nextSequence,
    };
  }

  async createEmployee(actor: AuthenticatedPrincipal, dto: CreateEmployeeDto) {
    const tenantId = this.requireTenant(actor);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const person = await this.findPersonForEmploymentOrThrow(tx, tenantId, dto.personId);
      await this.assertNoConcurrentEmployment(tx, tenantId, person.id);
      await this.validateUserReference(tx, tenantId, person.userId, dto.userId);

      const employeeNumber = dto.employeeNumber
        ? this.normalizeEmployeeNumber(dto.employeeNumber)
        : await this.generateEmployeeNumber(tx, tenantId);
      await this.assertEmployeeNumberAvailable(tx, tenantId, employeeNumber);

      const status = dto.status ?? EmployeeStatus.PREBOARDING;
      const employee = await tx.employee.create({
        data: {
          tenantId,
          personId: person.id,
          userId: dto.userId,
          employeeNumber,
          status,
          employmentType: dto.employmentType,
          hireDate: this.toDate(dto.hireDate),
          confirmationDate: this.toDate(dto.confirmationDate),
          endDate: this.toDate(dto.endDate),
          separationReason: dto.separationReason,
          source: dto.source,
          metadata: this.toJson(dto.metadata),
        },
        include: this.employeeInclude,
      });

      if (dto.userId && !person.userId) {
        await tx.person.update({
          where: { id: person.id },
          data: { userId: dto.userId },
        });
      }

      const finalState = this.employeeState(employee);

      await this.createWorkforceAction(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: WorkforceActionType.HIRE,
        effectiveDate: employee.hireDate ?? now,
        reason: dto.source ?? 'Employee record created.',
        previousState: null,
        proposedState: finalState,
        finalState,
        note: 'Employee employment relationship created.',
        metadata: dto.metadata,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Employee', employee.id, null, {
        employeeNumber: employee.employeeNumber,
        personId: employee.personId,
        status: employee.status,
        employmentType: employee.employmentType,
      });

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_CREATED,
        title: 'Employee created',
        description: `${employee.employeeNumber} was created.`,
        data: finalState,
      });

      if (HIRE_TARGET_STATUSES.includes(status)) {
        await this.createTimelineEvent(tx, {
          actor,
          tenantId,
          employeeId: employee.id,
          type: TimelineEventType.EMPLOYEE_HIRED,
          title: 'Employee hired',
          description: `${employee.employeeNumber} entered ${status.toLowerCase()} employment.`,
          data: finalState,
        });
      }

      await this.enqueueOutbox(tx, tenantId, 'employee.created', employee.id, {
        employeeId: employee.id,
        personId: employee.personId,
        employeeNumber: employee.employeeNumber,
        status: employee.status,
      });

      return this.findEmployeeOrThrow(tx, tenantId, employee.id);
    });
  }

  async listEmployees(actor: AuthenticatedPrincipal, query: ListEmployeesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const visibility = await this.employeeVisibilityWhere(actor, tenantId);
    const where = this.withEmployeeVisibility(this.employeeWhere(tenantId, query), visibility);

    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        take: limit + 1,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        skip: query.cursor ? 1 : 0,
        orderBy: [{ employeeNumber: 'asc' }, { id: 'asc' }],
        include: this.employeeListInclude,
      }),
      this.prisma.employee.count({ where }),
    ]);

    const hasNextPage = employees.length > limit;
    const data = hasNextPage ? employees.slice(0, limit) : employees;

    return {
      data,
      page: {
        limit,
        total,
        nextCursor: hasNextPage ? data.at(-1)?.id : null,
      },
    };
  }

  async exportEmployeesCsv(actor: AuthenticatedPrincipal, query: ListEmployeesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const visibility = await this.employeeVisibilityWhere(actor, tenantId);
    const employees = await this.prisma.employee.findMany({
      where: this.withEmployeeVisibility(this.employeeWhere(tenantId, query), visibility),
      take: 1000,
      orderBy: [{ employeeNumber: 'asc' }, { id: 'asc' }],
      include: this.employeeListInclude,
    });

    const rows = employees.map((employee) => {
      const assignment = employee.assignments[0];

      return {
        employeeNumber: employee.employeeNumber,
        firstName: employee.person.firstName,
        middleName: employee.person.middleName ?? '',
        lastName: employee.person.lastName,
        preferredName: employee.person.preferredName ?? '',
        email: employee.user?.email ?? '',
        status: employee.status,
        employmentType: employee.employmentType,
        hireDate: this.toIsoDate(employee.hireDate),
        confirmationDate: this.toIsoDate(employee.confirmationDate),
        endDate: this.toIsoDate(employee.endDate),
        positionCode: assignment?.position?.code ?? '',
        positionTitle: assignment?.position?.title ?? '',
        organizationNode: assignment?.organizationNode?.name ?? '',
        costCenter: assignment?.costCenter?.name ?? '',
        managerEmployeeNumber: assignment?.managerEmployee?.employeeNumber ?? '',
      };
    });

    return this.stringifyCsv(rows);
  }

  async previewEmployeeImport(actor: AuthenticatedPrincipal, dto: PreviewEmployeeImportDto) {
    const tenantId = this.requireTenant(actor);
    const parsedRows = this.parseCsv(dto.csv);
    const rowNumbers = new Set<string>();
    const employeeNumbers = parsedRows
      .map((row) => row.employeeNumber?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => this.normalizeEmployeeNumber(value));
    const existingEmployeeNumbers = new Set(
      (
        await this.prisma.employee.findMany({
          where: {
            tenantId,
            employeeNumber: {
              in: [...new Set(employeeNumbers)],
            },
          },
          select: {
            employeeNumber: true,
          },
        })
      ).map((employee) => employee.employeeNumber),
    );

    const preview = parsedRows.map((row, index) => {
      const line = index + 2;
      const errors: string[] = [];
      const employeeNumber = row.employeeNumber
        ? this.normalizeEmployeeNumber(row.employeeNumber)
        : '';
      const employmentType = row.employmentType?.trim().toUpperCase();
      const status = row.status?.trim().toUpperCase() || EmployeeStatus.PREBOARDING;

      if (!row.firstName?.trim()) errors.push('firstName is required.');
      if (!row.lastName?.trim()) errors.push('lastName is required.');
      if (!employmentType) errors.push('employmentType is required.');
      if (employmentType && !Object.values(EmploymentType).includes(employmentType as EmploymentType)) {
        errors.push(`employmentType ${employmentType} is not supported.`);
      }
      if (status && !Object.values(EmployeeStatus).includes(status as EmployeeStatus)) {
        errors.push(`status ${status} is not supported.`);
      }
      if (row.email && !this.looksLikeEmail(row.email)) {
        errors.push('email is not valid.');
      }
      if (employeeNumber) {
        if (rowNumbers.has(employeeNumber)) {
          errors.push(`employeeNumber ${employeeNumber} is duplicated in this file.`);
        }
        if (existingEmployeeNumbers.has(employeeNumber)) {
          errors.push(`employeeNumber ${employeeNumber} already exists in this tenant.`);
        }
        rowNumbers.add(employeeNumber);
      }
      if (row.hireDate && Number.isNaN(new Date(row.hireDate).getTime())) {
        errors.push('hireDate is not a valid date.');
      }

      return {
        line,
        valid: errors.length === 0,
        errors,
        normalized: {
          employeeNumber: employeeNumber || null,
          firstName: row.firstName?.trim() ?? '',
          middleName: row.middleName?.trim() || null,
          lastName: row.lastName?.trim() ?? '',
          preferredName: row.preferredName?.trim() || null,
          email: row.email?.trim().toLowerCase() || null,
          employmentType: employmentType || null,
          status,
          hireDate: row.hireDate?.trim() || null,
          source: row.source?.trim() || 'CSV_IMPORT',
        },
      };
    });

    const invalidRows = preview.filter((row) => !row.valid);

    return {
      dryRun: dto.dryRun ?? true,
      rows: parsedRows.length,
      validRows: preview.length - invalidRows.length,
      invalidRows: invalidRows.length,
      errors: invalidRows.flatMap((row) =>
        row.errors.map((message) => ({ line: row.line, message })),
      ),
      preview: preview.slice(0, 25),
      acceptedHeaders: [
        'employeeNumber',
        'firstName',
        'middleName',
        'lastName',
        'preferredName',
        'email',
        'employmentType',
        'status',
        'hireDate',
        'source',
      ],
    };
  }

  async commitEmployeeImport(actor: AuthenticatedPrincipal, dto: CommitEmployeeImportDto) {
    const tenantId = this.requireTenant(actor);
    const batchId = randomUUID();
    const committedAt = new Date();
    const validation = await this.validateEmployeeImport(tenantId, dto.csv);

    if (validation.rows === 0) {
      throw new BadRequestException('The import file does not contain any employee rows.');
    }

    if (validation.rows > 500) {
      throw new BadRequestException('A single import batch cannot exceed 500 employee rows.');
    }

    if (validation.invalidRows > 0) {
      throw new BadRequestException({
        message: 'Import contains invalid rows. Preview and correct the file before committing.',
        errors: validation.errors,
      });
    }

    const job = await this.prisma.$transaction(async (tx) => {
      await this.assertNoActiveEmployeeImportJob(tx, tenantId);

      return tx.employeeImportJob.create({
        data: {
          id: batchId,
          tenantId,
          actorUserId: actor.id,
          status: EmployeeImportJobStatus.QUEUED,
          csv: dto.csv,
          metadata: this.toJson({
            ...this.jsonRecord(dto.metadata),
            committedFrom: this.jsonRecord(dto.metadata).committedFrom ?? 'api',
            queuedAt: committedAt.toISOString(),
          }),
          totalRows: validation.rows,
          validRows: validation.validRows,
          invalidRows: validation.invalidRows,
          rows: {
            create: validation.allRows.map((row) => ({
              tenantId,
              line: row.line,
              status: EmployeeImportRowStatus.PENDING,
              normalized: row.normalized,
            })),
          },
        },
      });
    }, EMPLOYEE_IMPORT_TRANSACTION_OPTIONS);

    this.scheduleEmployeeImportWorker();

    return {
      committed: false,
      queued: true,
      batchId,
      jobId: job.id,
      status: job.status,
      rows: validation.rows,
      created: 0,
      skipped: 0,
      employees: [],
    };
  }

  private scheduleEmployeeImportWorker() {
    setImmediate(() => {
      void this.processQueuedEmployeeImportJobs();
    });
  }

  private async processQueuedEmployeeImportJobs() {
    if (this.importWorkerRunning) {
      return;
    }

    this.importWorkerRunning = true;

    try {
      const staleLockBefore = new Date(Date.now() - EMPLOYEE_IMPORT_WORKER_STALE_LOCK_MS);
      const candidates = await this.prisma.employeeImportJob.findMany({
        where: {
          OR: [
            { status: EmployeeImportJobStatus.QUEUED },
            {
              status: EmployeeImportJobStatus.PROCESSING,
              lockedAt: { lt: staleLockBefore },
            },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 3,
      });

      for (const candidate of candidates) {
        const now = new Date();
        const claimed = await this.prisma.employeeImportJob.updateMany({
          where: {
            id: candidate.id,
            OR: [
              { status: EmployeeImportJobStatus.QUEUED },
              {
                status: EmployeeImportJobStatus.PROCESSING,
                lockedAt: { lt: staleLockBefore },
              },
            ],
          },
          data: {
            status: EmployeeImportJobStatus.PROCESSING,
            lockedAt: now,
            startedAt: candidate.startedAt ?? now,
            lastError: null,
          },
        });

        if (claimed.count === 1) {
          await this.processEmployeeImportJob(candidate.id);
        }
      }
    } catch (error) {
      // Keep the API alive; failed jobs are retried by the next worker tick.
      console.error('Employee import worker failed.', error);
    } finally {
      this.importWorkerRunning = false;
    }
  }

  private async processEmployeeImportJob(jobId: string) {
    while (true) {
      const job = await this.prisma.employeeImportJob.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          tenantId: true,
          actorUserId: true,
          status: true,
          metadata: true,
          createdAt: true,
          cancelledAt: true,
        },
      });

      if (!job || job.cancelledAt || job.status === EmployeeImportJobStatus.CANCELLED) {
        return;
      }

      await this.prisma.employeeImportJobRow.updateMany({
        where: {
          jobId,
          status: EmployeeImportRowStatus.PROCESSING,
          updatedAt: {
            lt: new Date(Date.now() - EMPLOYEE_IMPORT_WORKER_STALE_LOCK_MS),
          },
        },
        data: { status: EmployeeImportRowStatus.PENDING },
      });

      const rows = await this.prisma.employeeImportJobRow.findMany({
        where: {
          jobId,
          status: EmployeeImportRowStatus.PENDING,
        },
        orderBy: [{ line: 'asc' }],
        take: EMPLOYEE_IMPORT_WORKER_ROW_BATCH_SIZE,
      });

      if (rows.length === 0) {
        await this.finalizeEmployeeImportJob(jobId);
        return;
      }

      await this.prisma.employeeImportJob.update({
        where: { id: jobId },
        data: { lockedAt: new Date() },
      });

      for (const row of rows) {
        try {
          await this.processEmployeeImportJobRow(job, row);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Import row failed.';
          await this.prisma.employeeImportJobRow.update({
            where: { id: row.id },
            data: {
              status: EmployeeImportRowStatus.FAILED,
              errors: [{ message }],
              processedAt: new Date(),
            },
          });
          await this.prisma.employeeImportJob.update({
            where: { id: jobId },
            data: { lastError: `Line ${row.line}: ${message}` },
          });
        }
      }

      await this.refreshEmployeeImportJobProgress(jobId);
    }
  }

  private async processEmployeeImportJobRow(
    job: EmployeeImportWorkerJob,
    row: EmployeeImportWorkerRow,
  ) {
    const input = this.employeeImportRowFromJson(row.normalized);
    const actor = this.importWorkerActor(job);
    const importMetadata = this.jsonRecord(job.metadata);

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeImportJobRow.update({
        where: { id: row.id },
        data: { status: EmployeeImportRowStatus.PROCESSING },
      });

      const person = await tx.person.create({
        data: {
          tenantId: job.tenantId,
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
          preferredName: input.preferredName,
          metadata: this.toJson({
            import: {
              batchId: job.id,
              source: 'CSV_IMPORT',
              line: row.line,
              committedById: job.actorUserId,
              committedAt: job.createdAt.toISOString(),
            },
          }),
          contacts: input.email
            ? {
                create: {
                  type: 'EMAIL',
                  value: input.email,
                  label: 'Imported work email',
                  isPrimary: true,
                },
              }
            : undefined,
        },
        select: { id: true },
      });
      const employeeNumber =
        input.employeeNumber ?? (await this.generateEmployeeNumber(tx, job.tenantId));
      const employee = await tx.employee.create({
        data: {
          tenantId: job.tenantId,
          personId: person.id,
          employeeNumber,
          status: input.status,
          employmentType: input.employmentType,
          hireDate: this.toDate(input.hireDate ?? undefined),
          source: input.source,
          metadata: this.toJson({
            import: {
              batchId: job.id,
              source: 'CSV_IMPORT',
              line: row.line,
              committedById: job.actorUserId,
              committedAt: job.createdAt.toISOString(),
              metadata: importMetadata,
            },
          }),
        },
      });
      const finalState = this.employeeState(employee);

      await this.createWorkforceAction(tx, {
        actor,
        tenantId: job.tenantId,
        employeeId: employee.id,
        type: WorkforceActionType.HIRE,
        effectiveDate: employee.hireDate ?? new Date(),
        reason: 'Employee created from governed CSV import.',
        previousState: null,
        proposedState: finalState,
        finalState,
        note: `Imported from CSV line ${row.line}.`,
        metadata: {
          importBatchId: job.id,
          importLine: row.line,
          importMetadata,
        },
      });

      await this.writeAudit(tx, actor, job.tenantId, AuditAction.CREATE, 'Employee', employee.id, null, {
        employeeNumber: employee.employeeNumber,
        personId: employee.personId,
        status: employee.status,
        employmentType: employee.employmentType,
        importBatchId: job.id,
        importLine: row.line,
      });

      await this.createTimelineEvent(tx, {
        actor,
        tenantId: job.tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_CREATED,
        title: 'Employee imported',
        description: `${employee.employeeNumber} was created from CSV line ${row.line}.`,
        data: finalState,
      });

      if (HIRE_TARGET_STATUSES.includes(employee.status)) {
        await this.createTimelineEvent(tx, {
          actor,
          tenantId: job.tenantId,
          employeeId: employee.id,
          type: TimelineEventType.EMPLOYEE_HIRED,
          title: 'Employee hired',
          description: `${employee.employeeNumber} entered ${employee.status.toLowerCase()} employment from import.`,
          data: finalState,
        });
      }

      await this.enqueueOutbox(tx, job.tenantId, 'employee.imported', employee.id, {
        employeeId: employee.id,
        personId: employee.personId,
        employeeNumber: employee.employeeNumber,
        status: employee.status,
        importBatchId: job.id,
        importLine: row.line,
      });

      await tx.employeeImportJobRow.update({
        where: { id: row.id },
        data: {
          status: EmployeeImportRowStatus.CREATED,
          personId: employee.personId,
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          processedAt: new Date(),
        },
      });
    }, EMPLOYEE_IMPORT_TRANSACTION_OPTIONS);
  }

  private async refreshEmployeeImportJobProgress(jobId: string) {
    const counts = await this.employeeImportJobRowCounts(jobId);
    const processedRows = counts.created + counts.failed + counts.skipped;

    await this.prisma.employeeImportJob.update({
      where: { id: jobId },
      data: {
        processedRows,
        createdRows: counts.created,
        failedRows: counts.failed,
        skippedRows: counts.skipped,
      },
    });

    return counts;
  }

  private async finalizeEmployeeImportJob(jobId: string) {
    const job = await this.prisma.employeeImportJob.findUnique({
      where: { id: jobId },
      include: {
        rows: {
          where: { status: EmployeeImportRowStatus.CREATED },
          orderBy: [{ line: 'asc' }],
        },
      },
    });

    if (!job || job.completedAt) {
      return;
    }

    const counts = await this.employeeImportJobRowCounts(jobId);

    if (counts.pending > 0 || counts.processing > 0) {
      return;
    }

    const status =
      counts.failed > 0
        ? counts.created > 0
          ? EmployeeImportJobStatus.PARTIAL
          : EmployeeImportJobStatus.FAILED
        : EmployeeImportJobStatus.COMPLETED;
    const employees = job.rows.map((row) => this.committedEmployeeFromImportRow(row));
    const employeeIds = employees.map((employee) => employee.id);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeImportJob.update({
        where: { id: job.id },
        data: {
          status,
          processedRows: counts.created + counts.failed + counts.skipped,
          createdRows: counts.created,
          failedRows: counts.failed,
          skippedRows: counts.skipped,
          lockedAt: null,
          completedAt: now,
        },
      });

      await tx.activityLog.create({
        data: {
          tenantId: job.tenantId,
          userId: job.actorUserId,
          module: 'employees',
          message: `Committed employee import with ${employees.length} records.`,
          metadata: this.toJson({
            importBatchId: job.id,
            status,
            rows: job.totalRows,
            created: employees.length,
            failed: counts.failed,
            employeeIds,
            employees,
            metadata: job.metadata,
          }),
        },
      });

      await tx.outboxMessage.create({
        data: {
          tenantId: job.tenantId,
          eventType: 'employee.import.completed',
          aggregateType: 'EmployeeImport',
          aggregateId: job.id,
          payload: {
            importBatchId: job.id,
            status,
            rows: job.totalRows,
            created: employees.length,
            failed: counts.failed,
            employeeIds,
          },
        },
      });
    }, EMPLOYEE_IMPORT_TRANSACTION_OPTIONS);
  }

  async listEmployeeImportBatches(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const jobs = await this.prisma.employeeImportJob.findMany({
      where: { tenantId },
      take: 50,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        rows: {
          where: { status: EmployeeImportRowStatus.CREATED },
          orderBy: [{ line: 'asc' }],
        },
      },
    });
    const actors = await this.importActorsById(jobs.map((job) => job.actorUserId));

    return {
      data: jobs.map((job) => this.importBatchFromJob(job, actors.get(job.actorUserId) ?? null)),
      page: {
        limit: 50,
        nextCursor: null,
      },
    };
  }

  async getEmployeeImportBatch(actor: AuthenticatedPrincipal, batchId: string) {
    const tenantId = this.requireTenant(actor);
    const job = await this.prisma.employeeImportJob.findFirst({
      where: { id: batchId, tenantId },
      include: {
        rows: {
          orderBy: [{ line: 'asc' }],
        },
      },
    });
    const actorUser = job
      ? (await this.importActorsById([job.actorUserId])).get(job.actorUserId) ?? null
      : null;
    const batch = job ? this.importBatchFromJob(job, actorUser) : null;

    if (!batch) {
      throw new NotFoundException('Employee import batch not found.');
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        id: { in: batch.employeeIds },
      },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            preferredName: true,
          },
        },
      },
      orderBy: [{ employeeNumber: 'asc' }],
    });

    return {
      ...batch,
      employees,
    };
  }

  async rollbackEmployeeImportBatch(actor: AuthenticatedPrincipal, batchId: string) {
    const tenantId = this.requireTenant(actor);
    const batch = await this.getEmployeeImportBatch(actor, batchId);

    if (['QUEUED', 'PROCESSING'].includes(batch.status)) {
      throw new BadRequestException('Import is still processing and cannot be rolled back yet.');
    }

    const now = new Date();
    const candidates = await this.prisma.employee.findMany({
      where: {
        tenantId,
        id: { in: batch.employeeIds },
      },
      include: {
        person: true,
        assignments: {
          where: {
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          },
          select: {
            id: true,
            positionId: true,
            organizationNodeId: true,
            isPrimary: true,
          },
        },
      },
      orderBy: [{ employeeNumber: 'asc' }],
    });
    const blocked: EmployeeImportRollbackBlocked[] = [];
    const rollbackable = candidates.filter((employee) => {
      const employeeBatchId = this.importBatchIdFromMetadata(employee.metadata);

      if (employeeBatchId !== batchId) {
        blocked.push({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          reason: 'Employee was not created by this import batch.',
        });
        return false;
      }

      if (employee.deletedAt) {
        blocked.push({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          reason: 'Employee is already archived.',
        });
        return false;
      }

      if (employee.assignments.length > 0) {
        blocked.push({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          reason: 'Employee has active assignments and needs manual workforce review.',
        });
        return false;
      }

      return true;
    });

    if (rollbackable.length === 0) {
      throw new BadRequestException({
        message: 'No records in this import batch can be safely rolled back.',
        blocked,
      });
    }

    const rolledBack = await this.prisma.$transaction(async (tx) => {
      const records: EmployeeImportCommittedEmployee[] = [];

      for (const employee of rollbackable) {
        const before = this.employeeState(employee);
        const employeeMetadata = this.jsonRecord(employee.metadata);
        const personMetadata = this.jsonRecord(employee.person.metadata);
        const importMetadata = this.jsonRecord(employeeMetadata.import);
        const rollbackMetadata = {
          importBatchId: batchId,
          rolledBackById: actor.id,
          rolledBackAt: now.toISOString(),
        };
        const updated = await tx.employee.update({
          where: { id: employee.id },
          data: {
            status: EmployeeStatus.ARCHIVED,
            deletedAt: now,
            metadata: this.toJson({
              ...employeeMetadata,
              import: {
                ...importMetadata,
                rollback: rollbackMetadata,
              },
            }),
          },
          include: this.employeeInclude,
        });

        await tx.person.update({
          where: { id: employee.personId },
          data: {
            deletedAt: now,
            metadata: this.toJson({
              ...personMetadata,
              importRollback: rollbackMetadata,
            }),
          },
        });

        const after = this.employeeState(updated);

        await this.writeAudit(
          tx,
          actor,
          tenantId,
          AuditAction.ARCHIVE,
          'Employee',
          updated.id,
          before,
          {
            ...after,
            importBatchId: batchId,
            rollbackReason: 'Employee import batch rollback.',
          },
        );

        await this.createTimelineEvent(tx, {
          actor,
          tenantId,
          employeeId: updated.id,
          type: TimelineEventType.EMPLOYEE_UPDATED,
          title: 'Import rollback',
          description: `${updated.employeeNumber} was archived by import batch rollback.`,
          data: {
            before,
            after,
            importBatchId: batchId,
          },
        });

        records.push({
          line: Number(importMetadata.line ?? 0),
          id: updated.id,
          personId: updated.personId,
          employeeNumber: updated.employeeNumber,
          status: updated.status,
        });
      }

      await tx.activityLog.create({
        data: {
          tenantId,
          userId: actor.id,
          module: 'employees',
          message: `Rolled back employee import batch ${batchId} with ${records.length} records.`,
          metadata: this.toJson({
            importBatchId: batchId,
            rolledBack: records.length,
            blocked,
            employeeIds: records.map((employee) => employee.id),
          }),
        },
      });

      await tx.outboxMessage.create({
        data: {
          tenantId,
          eventType: 'employee.import.rollback.completed',
          aggregateType: 'EmployeeImport',
          aggregateId: batchId,
          payload: {
            importBatchId: batchId,
            rolledBack: records.length,
            blocked,
            employeeIds: records.map((employee) => employee.id),
          },
        },
      });

      return records;
    }, EMPLOYEE_IMPORT_TRANSACTION_OPTIONS);

    return {
      batchId,
      rolledBack: rolledBack.length,
      blocked,
      employees: rolledBack,
    };
  }

  async getEmployee(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId);
    return this.withMasterDataReadiness(employee);
  }

  async getMyEmployment(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.prisma.employee.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        OR: this.selfEmployeeWhere(actor),
      },
      include: this.employeeSelfServiceInclude,
    });

    return {
      employee: employee ? this.withMasterDataReadiness(employee) : null,
      scope: employee ? 'SELF' : 'UNLINKED',
    };
  }

  async getEmployeeMasterData(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId);

    return {
      employee: this.withMasterDataReadiness(employee),
      readiness: this.masterDataReadiness(employee),
    };
  }

  async getEmployeeExtendedProfile(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId);

    return {
      employee: this.withMasterDataReadiness(employee),
      extendedProfile: this.employeeExtendedProfile(employee),
    };
  }

  async updateEmployeeMasterData(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: UpdateEmployeeMasterDataDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const before = this.employeeMasterDataState(existing);
      const personData = this.hrPersonMasterData(dto);

      if (dto.nationalityId) {
        await this.assertCountryExists(tx, dto.nationalityId);
      }

      if (dto.demographics?.demographicCountryId) {
        await this.assertCountryExists(tx, dto.demographics.demographicCountryId);
      }

      if (Object.keys(personData).length > 0) {
        await tx.person.update({
          where: { id: existing.personId },
          data: personData,
        });
      }

      if (dto.demographics) {
        await this.upsertDemographicProfile(tx, actor, tenantId, existing.personId, dto.demographics, true);
      }

      const updated = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const after = this.employeeMasterDataState(updated);

      await this.createWorkforceAction(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: WorkforceActionType.PROFILE_CHANGE,
        effectiveDate: new Date(),
        reason: 'Employee master data updated.',
        previousState: before,
        proposedState: after,
        finalState: after,
        note: 'Employee master data was reviewed and updated.',
        metadata: dto.demographics?.metadata,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeMasterData', updated.id, before, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Master data updated',
        description: `${updated.employeeNumber} master data was updated.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.master_data.updated', updated.id, {
        employeeId: updated.id,
        employeeNumber: updated.employeeNumber,
        completionPercent: this.masterDataReadiness(updated).completionPercent,
      });

      return this.withMasterDataReadiness(updated);
    });
  }

  async updateMyMasterData(
    actor: AuthenticatedPrincipal,
    dto: UpdateEmployeeSelfServiceMasterDataDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: this.selfEmployeeWhere(actor),
        },
        include: this.employeeInclude,
      });

      if (!existing) {
        throw new NotFoundException('Employee profile not linked.');
      }

      if (dto.address?.countryId) {
        await this.assertCountryExists(tx, dto.address.countryId);
      }

      if (dto.demographics?.demographicCountryId) {
        await this.assertCountryExists(tx, dto.demographics.demographicCountryId);
      }

      const before = this.employeeMasterDataState(existing);
      const personData = this.selfServicePersonMasterData(dto);

      if (Object.keys(personData).length > 0) {
        await tx.person.update({
          where: { id: existing.personId },
          data: personData,
        });
      }

      if (dto.personalEmail) {
        await this.upsertPersonContact(tx, existing.personId, {
          type: 'EMAIL',
          label: 'Personal',
          value: dto.personalEmail,
        });
      }

      if (dto.phone) {
        await this.upsertPersonContact(tx, existing.personId, {
          type: 'PHONE',
          label: 'Mobile',
          value: dto.phone,
        });
      }

      if (dto.address) {
        await this.upsertSelfServiceAddress(tx, existing.personId, dto.address);
      }

      if (dto.emergencyContact) {
        await this.upsertSelfServiceEmergencyContact(tx, existing.personId, dto.emergencyContact);
      }

      if (dto.demographics) {
        await this.upsertDemographicProfile(tx, actor, tenantId, existing.personId, dto.demographics);
      }

      const updated = await tx.employee.findFirstOrThrow({
        where: { id: existing.id, tenantId },
        include: this.employeeSelfServiceInclude,
      });
      const after = this.employeeMasterDataState(updated);

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeSelfServiceMasterData', updated.id, before, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Profile updated',
        description: `${updated.employeeNumber} self-service profile was updated.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.self_service_profile.updated', updated.id, {
        employeeId: updated.id,
        employeeNumber: updated.employeeNumber,
        completionPercent: this.masterDataReadiness(updated).completionPercent,
      });

      return {
        employee: this.withMasterDataReadiness(updated),
        scope: 'SELF',
      };
    });
  }

  async updateEmployeeExtendedProfile(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: UpdateEmployeeExtendedProfileDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const before = this.employeeExtendedProfileState(existing);

      await this.applyEmployeeExtendedProfile(tx, actor, tenantId, existing.id, dto, {
        selfService: false,
      });

      const updated = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const after = this.employeeExtendedProfileState(updated);

      await this.createWorkforceAction(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: WorkforceActionType.PROFILE_CHANGE,
        effectiveDate: new Date(),
        reason: 'Employee extended profile reviewed.',
        previousState: before,
        proposedState: after,
        finalState: after,
        note: 'Dependents, references, payout, or eligibility records were reviewed.',
        metadata: this.extendedProfileMetadata(dto),
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeExtendedProfile', updated.id, before, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Extended profile updated',
        description: `${updated.employeeNumber} extended profile was updated.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.extended_profile.updated', updated.id, {
        employeeId: updated.id,
        employeeNumber: updated.employeeNumber,
        readiness: this.masterDataReadiness(updated),
      });

      return {
        employee: this.withMasterDataReadiness(updated),
        extendedProfile: this.employeeExtendedProfile(updated),
      };
    });
  }

  async updateMyExtendedProfile(
    actor: AuthenticatedPrincipal,
    dto: UpdateEmployeeExtendedProfileDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: this.selfEmployeeWhere(actor),
        },
        include: this.employeeInclude,
      });

      if (!existing) {
        throw new NotFoundException('Employee profile not linked.');
      }

      const before = this.employeeExtendedProfileState(existing);

      await this.applyEmployeeExtendedProfile(tx, actor, tenantId, existing.id, dto, {
        selfService: true,
      });

      const updated = await tx.employee.findFirstOrThrow({
        where: { id: existing.id, tenantId },
        include: this.employeeSelfServiceInclude,
      });
      const after = this.employeeExtendedProfileState(updated);

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeSelfServiceExtendedProfile', updated.id, before, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Profile records updated',
        description: `${updated.employeeNumber} submitted profile records for review.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.self_service_extended_profile.updated', updated.id, {
        employeeId: updated.id,
        employeeNumber: updated.employeeNumber,
        readiness: this.masterDataReadiness(updated),
      });

      return {
        employee: this.withMasterDataReadiness(updated),
        extendedProfile: this.employeeExtendedProfile(updated),
        scope: 'SELF',
      };
    });
  }

  async listEmployeeEmploymentTerms(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId);

    return this.prisma.employeeEmploymentTerm.findMany({
      where: { tenantId, employeeId, deletedAt: null },
      include: this.employmentTermInclude,
      orderBy: [{ status: 'asc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createEmployeeEmploymentTerm(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: UpsertEmployeeEmploymentTermDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const effectiveFrom = this.toDate(dto.effectiveFrom) ?? new Date();
      const effectiveTo = this.toDate(dto.effectiveTo);

      this.assertEffectiveWindow(effectiveFrom, effectiveTo);
      await this.validateEmploymentTermReferences(tx, tenantId, employeeId, dto);

      if ((dto.status ?? EmploymentTermStatus.ACTIVE) === EmploymentTermStatus.ACTIVE && !effectiveTo) {
        await tx.employeeEmploymentTerm.updateMany({
          where: {
            tenantId,
            employeeId,
            status: EmploymentTermStatus.ACTIVE,
            effectiveTo: null,
            deletedAt: null,
          },
          data: {
            status: EmploymentTermStatus.SUPERSEDED,
            effectiveTo: effectiveFrom,
          },
        });
      }

      const term = await tx.employeeEmploymentTerm.create({
        data: {
          tenantId,
          employeeId,
          contractType: dto.contractType ?? EmploymentContractType.PERMANENT,
          status: dto.status ?? EmploymentTermStatus.ACTIVE,
          title: this.nullableString(dto.title),
          reference: this.nullableString(dto.reference),
          payFrequency: dto.payFrequency,
          currencyCode: this.currencyCode(dto.currencyCode),
          baseAmount: this.decimalString(dto.baseAmount),
          gradeId: this.nullableString(dto.gradeId),
          levelId: this.nullableString(dto.levelId),
          positionId: this.nullableString(dto.positionId),
          organizationNodeId: this.nullableString(dto.organizationNodeId),
          costCenterId: this.nullableString(dto.costCenterId),
          documentId: this.nullableString(dto.documentId),
          workflowRequestId: this.nullableString(dto.workflowRequestId),
          effectiveFrom,
          effectiveTo,
          approvedAt: dto.approveNow ? new Date() : undefined,
          approvedById: dto.approveNow ? actor.id : undefined,
          metadata: this.toJson(dto.metadata),
        },
        include: this.employmentTermInclude,
      });

      await this.writeEmploymentTermEffects(tx, actor, tenantId, employee, {
        action: AuditAction.CREATE,
        before: null,
        after: term,
        title: 'Employment terms established',
        description: `${employee.employeeNumber} employment terms were established.`,
        eventType: 'employee.employment_terms.created',
      });

      return term;
    });
  }

  async updateEmployeeEmploymentTerm(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    termId: string,
    dto: UpsertEmployeeEmploymentTermDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findEmploymentTermOrThrow(tx, tenantId, employeeId, termId);
      const before = this.employmentTermState(existing);
      const effectiveFrom = (dto.effectiveFrom !== undefined ? this.toDate(dto.effectiveFrom) : existing.effectiveFrom) ?? new Date();
      const effectiveTo = dto.effectiveTo !== undefined ? this.toDate(dto.effectiveTo) ?? null : existing.effectiveTo;

      this.assertEffectiveWindow(effectiveFrom, effectiveTo);
      await this.validateEmploymentTermReferences(tx, tenantId, employeeId, dto);

      const term = await tx.employeeEmploymentTerm.update({
        where: { id: termId },
        data: {
          contractType: dto.contractType,
          status: dto.status,
          title: dto.title !== undefined ? this.nullableString(dto.title) : undefined,
          reference: dto.reference !== undefined ? this.nullableString(dto.reference) : undefined,
          payFrequency: dto.payFrequency,
          currencyCode: dto.currencyCode !== undefined ? this.currencyCode(dto.currencyCode) : undefined,
          baseAmount: dto.baseAmount !== undefined ? this.decimalString(dto.baseAmount) : undefined,
          gradeId: dto.gradeId !== undefined ? this.nullableString(dto.gradeId) : undefined,
          levelId: dto.levelId !== undefined ? this.nullableString(dto.levelId) : undefined,
          positionId: dto.positionId !== undefined ? this.nullableString(dto.positionId) : undefined,
          organizationNodeId: dto.organizationNodeId !== undefined ? this.nullableString(dto.organizationNodeId) : undefined,
          costCenterId: dto.costCenterId !== undefined ? this.nullableString(dto.costCenterId) : undefined,
          documentId: dto.documentId !== undefined ? this.nullableString(dto.documentId) : undefined,
          workflowRequestId: dto.workflowRequestId !== undefined ? this.nullableString(dto.workflowRequestId) : undefined,
          effectiveFrom,
          effectiveTo,
          approvedAt: dto.approveNow ? new Date() : undefined,
          approvedById: dto.approveNow ? actor.id : undefined,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.employmentTermInclude,
      });

      await this.writeEmploymentTermEffects(tx, actor, tenantId, employee, {
        action: AuditAction.UPDATE,
        before,
        after: term,
        title: 'Employment terms updated',
        description: `${employee.employeeNumber} employment terms were updated.`,
        eventType: 'employee.employment_terms.updated',
      });

      return term;
    });
  }

  async createEmployeeCompensationComponent(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: UpsertEmployeeCompensationComponentDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const effectiveFrom = this.toDate(dto.effectiveFrom) ?? new Date();
      const effectiveTo = this.toDate(dto.effectiveTo);

      this.assertEffectiveWindow(effectiveFrom, effectiveTo);
      await this.validateCompensationComponentReferences(tx, tenantId, employeeId, dto);

      const component = await tx.employeeCompensationComponent.create({
        data: {
          tenantId,
          employeeId,
          termId: this.nullableString(dto.termId),
          type: dto.type ?? CompensationComponentType.ALLOWANCE,
          name: this.requiredString(dto.name, 'compensationComponent.name'),
          amount: this.decimalString(dto.amount),
          currencyCode: this.currencyCode(dto.currencyCode),
          frequency: dto.frequency,
          taxable: dto.taxable ?? true,
          status: dto.status ?? CompensationChangeStatus.EFFECTIVE,
          effectiveFrom,
          effectiveTo,
          metadata: this.toJson(dto.metadata),
        },
        include: this.compensationComponentInclude,
      });

      await this.writeCompensationComponentEffects(tx, actor, tenantId, employee, {
        action: AuditAction.CREATE,
        before: null,
        after: component,
        title: 'Compensation component added',
        description: `${component.name} was added for ${employee.employeeNumber}.`,
        eventType: 'employee.compensation_component.created',
      });

      return component;
    });
  }

  async updateEmployeeCompensationComponent(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    componentId: string,
    dto: UpsertEmployeeCompensationComponentDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findCompensationComponentOrThrow(tx, tenantId, employeeId, componentId);
      const before = this.compensationComponentState(existing);
      const effectiveFrom = (dto.effectiveFrom !== undefined ? this.toDate(dto.effectiveFrom) : existing.effectiveFrom) ?? new Date();
      const effectiveTo = dto.effectiveTo !== undefined ? this.toDate(dto.effectiveTo) ?? null : existing.effectiveTo;

      this.assertEffectiveWindow(effectiveFrom, effectiveTo);
      await this.validateCompensationComponentReferences(tx, tenantId, employeeId, dto);

      const component = await tx.employeeCompensationComponent.update({
        where: { id: componentId },
        data: {
          termId: dto.termId !== undefined ? this.nullableString(dto.termId) : undefined,
          type: dto.type,
          name: dto.name !== undefined ? this.requiredString(dto.name, 'compensationComponent.name') : undefined,
          amount: dto.amount !== undefined ? this.decimalString(dto.amount) : undefined,
          currencyCode: dto.currencyCode !== undefined ? this.currencyCode(dto.currencyCode) : undefined,
          frequency: dto.frequency,
          taxable: dto.taxable,
          status: dto.status,
          effectiveFrom,
          effectiveTo,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.compensationComponentInclude,
      });

      await this.writeCompensationComponentEffects(tx, actor, tenantId, employee, {
        action: AuditAction.UPDATE,
        before,
        after: component,
        title: 'Compensation component updated',
        description: `${component.name} was updated for ${employee.employeeNumber}.`,
        eventType: 'employee.compensation_component.updated',
      });

      return component;
    });
  }

  async createEmployeeCompensationChange(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: CreateEmployeeCompensationChangeDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const effectiveDate = this.toDate(dto.effectiveDate) ?? new Date();
      await this.validateCompensationChangeReferences(tx, tenantId, employeeId, dto);
      const previousState = await this.currentCompensationState(tx, tenantId, employeeId, dto.termId);
      const proposedState = this.toJsonObject(dto.proposedState ?? {});

      if (Object.keys(proposedState).length === 0) {
        throw new BadRequestException('proposedState is required for a compensation change.');
      }

      const change = await tx.employeeCompensationChange.create({
        data: {
          tenantId,
          employeeId,
          termId: this.nullableString(dto.termId),
          status: dto.status ?? CompensationChangeStatus.PENDING_APPROVAL,
          effectiveDate,
          reason: this.nullableString(dto.reason),
          previousState,
          proposedState,
          workflowRequestId: this.nullableString(dto.workflowRequestId),
          initiatedById: actor.id,
          metadata: this.toJson(dto.metadata),
        },
        include: this.compensationChangeInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeCompensationChange', change.id, null, this.compensationChangeState(change));
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Compensation change prepared',
        description: `${employee.employeeNumber} has a compensation change ready for review.`,
        data: this.compensationChangeState(change),
      });
      await this.enqueueOutbox(tx, tenantId, 'employee.compensation_change.created', employeeId, {
        employeeId,
        employeeNumber: employee.employeeNumber,
        compensationChangeId: change.id,
        status: change.status,
      });

      return change;
    });
  }

  async approveEmployeeCompensationChange(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    changeId: string,
  ) {
    return this.mutateEmployeeCompensationChange(actor, employeeId, changeId, 'approve');
  }

  async applyEmployeeCompensationChange(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    changeId: string,
  ) {
    return this.mutateEmployeeCompensationChange(actor, employeeId, changeId, 'apply');
  }

  async createEmployeeReportingRelationship(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: CreateEmployeeReportingRelationshipDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const startsAt = this.toDate(dto.startsAt) ?? new Date();
      const endsAt = this.toDate(dto.endsAt);

      this.assertEffectiveWindow(startsAt, endsAt);
      await this.validateReportingRelationship(tx, tenantId, employeeId, dto, startsAt);

      const type = dto.type ?? ReportingRelationshipType.DOTTED_LINE;
      if (this.reportingTypeIsExclusive(type) && (dto.status ?? ReportingRelationshipStatus.ACTIVE) === ReportingRelationshipStatus.ACTIVE) {
        await tx.employeeReportingRelationship.updateMany({
          where: {
            tenantId,
            employeeId,
            type,
            status: ReportingRelationshipStatus.ACTIVE,
            endsAt: null,
            deletedAt: null,
          },
          data: {
            status: ReportingRelationshipStatus.ENDED,
            endsAt: startsAt,
          },
        });
      }

      const relationship = await tx.employeeReportingRelationship.create({
        data: {
          tenantId,
          employeeId,
          relatedEmployeeId: this.requiredString(dto.relatedEmployeeId, 'relatedEmployeeId'),
          type,
          status: dto.status ?? ReportingRelationshipStatus.ACTIVE,
          organizationNodeId: this.nullableString(dto.organizationNodeId),
          positionId: this.nullableString(dto.positionId),
          startsAt,
          endsAt,
          reason: this.nullableString(dto.reason),
          metadata: this.toJson(dto.metadata),
        },
        include: this.reportingRelationshipInclude,
      });

      await this.writeReportingRelationshipEffects(tx, actor, tenantId, employee, {
        action: AuditAction.CREATE,
        before: null,
        after: relationship,
        title: 'Reporting relationship added',
        description: `${this.humanizeReportingType(relationship.type)} relationship was added for ${employee.employeeNumber}.`,
        eventType: 'employee.reporting_relationship.created',
      });

      return relationship;
    });
  }

  async updateEmployeeReportingRelationship(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    relationshipId: string,
    dto: UpdateEmployeeReportingRelationshipDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findReportingRelationshipOrThrow(tx, tenantId, employeeId, relationshipId);
      const before = this.reportingRelationshipState(existing);
      const startsAt = (dto.startsAt !== undefined ? this.toDate(dto.startsAt) : existing.startsAt) ?? new Date();
      const endsAt = dto.endsAt !== undefined ? this.toDate(dto.endsAt) ?? null : existing.endsAt;

      this.assertEffectiveWindow(startsAt, endsAt);
      await this.validateReportingRelationship(tx, tenantId, employeeId, dto, startsAt, existing);

      const relationship = await tx.employeeReportingRelationship.update({
        where: { id: relationshipId },
        data: {
          relatedEmployeeId: dto.relatedEmployeeId,
          type: dto.type,
          status: dto.status,
          organizationNodeId: dto.organizationNodeId !== undefined ? this.nullableString(dto.organizationNodeId) : undefined,
          positionId: dto.positionId !== undefined ? this.nullableString(dto.positionId) : undefined,
          startsAt,
          endsAt,
          reason: dto.reason !== undefined ? this.nullableString(dto.reason) : undefined,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.reportingRelationshipInclude,
      });

      await this.writeReportingRelationshipEffects(tx, actor, tenantId, employee, {
        action: AuditAction.UPDATE,
        before,
        after: relationship,
        title: 'Reporting relationship updated',
        description: `${this.humanizeReportingType(relationship.type)} relationship was updated for ${employee.employeeNumber}.`,
        eventType: 'employee.reporting_relationship.updated',
      });

      return relationship;
    });
  }

  async listEmployeeLifecycleTemplates(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.employeeLifecycleTemplate.findMany({
      where: {
        deletedAt: null,
        OR: [{ tenantId }, { tenantId: null, status: EmployeeLifecycleTemplateStatus.ACTIVE }],
      },
      include: this.lifecycleTemplateInclude,
      orderBy: [{ status: 'asc' }, { type: 'asc' }, { name: 'asc' }],
    });
  }

  async getEmployeeLifecycleTemplate(actor: AuthenticatedPrincipal, templateId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findLifecycleTemplateOrThrow(this.prisma, tenantId, templateId);
  }

  async createEmployeeLifecycleTemplate(
    actor: AuthenticatedPrincipal,
    dto: CreateEmployeeLifecycleTemplateDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.employeeLifecycleTemplate.create({
        data: {
          tenantId,
          code: this.normalizeCode(dto.code),
          name: this.requiredString(dto.name, 'lifecycleTemplate.name'),
          description: this.nullableString(dto.description),
          type: dto.type,
          status: dto.status ?? EmployeeLifecycleTemplateStatus.DRAFT,
          targetDays: dto.targetDays,
          createdById: actor.id,
          updatedById: actor.id,
          metadata: this.toJson(dto.metadata),
        },
        include: this.lifecycleTemplateInclude,
      });

      const after = this.toJsonObject(template);
      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeLifecycleTemplate', template.id, null, after);
      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_template.created', template.id, {
        templateId: template.id,
        code: template.code,
        type: template.type,
        status: template.status,
      });

      return template;
    });
  }

  async updateEmployeeLifecycleTemplate(
    actor: AuthenticatedPrincipal,
    templateId: string,
    dto: UpdateEmployeeLifecycleTemplateDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findLifecycleTemplateOrThrow(tx, tenantId, templateId, true);
      const before = this.toJsonObject(existing);
      const template = await tx.employeeLifecycleTemplate.update({
        where: { id: existing.id },
        data: {
          code: dto.code !== undefined ? this.normalizeCode(dto.code) : undefined,
          name: dto.name !== undefined ? this.requiredString(dto.name, 'lifecycleTemplate.name') : undefined,
          description: dto.description !== undefined ? this.nullableString(dto.description) : undefined,
          type: dto.type,
          status: dto.status,
          targetDays: dto.targetDays,
          updatedById: actor.id,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.lifecycleTemplateInclude,
      });

      const after = this.toJsonObject(template);
      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeLifecycleTemplate', template.id, before, after);
      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_template.updated', template.id, {
        templateId: template.id,
        code: template.code,
        status: template.status,
      });

      return template;
    });
  }

  async createEmployeeLifecycleTemplateTask(
    actor: AuthenticatedPrincipal,
    templateId: string,
    dto: CreateEmployeeLifecycleTemplateTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const template = await this.findLifecycleTemplateOrThrow(tx, tenantId, templateId, true);
      await this.assertDocumentTypeReadable(tx, tenantId, dto.documentTypeId);
      const task = await tx.employeeLifecycleTemplateTask.create({
        data: {
          templateId: template.id,
          title: this.requiredString(dto.title, 'lifecycleTemplateTask.title'),
          description: this.nullableString(dto.description),
          category: this.nullableString(dto.category),
          ownerType: dto.ownerType ?? EmployeeLifecycleTaskOwnerType.HR,
          priority: dto.priority,
          sortOrder: dto.sortOrder,
          dueOffsetDays: dto.dueOffsetDays,
          requiresDocument: dto.requiresDocument ?? Boolean(dto.documentTypeId),
          documentTypeId: dto.documentTypeId,
          instructions: this.nullableString(dto.instructions),
          metadata: this.toJson(dto.metadata),
        },
        include: this.lifecycleTemplateTaskInclude,
      });

      const after = this.toJsonObject(task);
      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeLifecycleTemplateTask', task.id, null, after);
      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_template_task.created', template.id, {
        templateId: template.id,
        templateTaskId: task.id,
        ownerType: task.ownerType,
      });

      return task;
    });
  }

  async updateEmployeeLifecycleTemplateTask(
    actor: AuthenticatedPrincipal,
    taskId: string,
    dto: UpdateEmployeeLifecycleTemplateTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findLifecycleTemplateTaskOrThrow(tx, tenantId, taskId);
      const before = this.toJsonObject(existing);
      await this.assertDocumentTypeReadable(tx, tenantId, dto.documentTypeId);
      const task = await tx.employeeLifecycleTemplateTask.update({
        where: { id: existing.id },
        data: {
          title: dto.title !== undefined ? this.requiredString(dto.title, 'lifecycleTemplateTask.title') : undefined,
          description: dto.description !== undefined ? this.nullableString(dto.description) : undefined,
          category: dto.category !== undefined ? this.nullableString(dto.category) : undefined,
          ownerType: dto.ownerType,
          priority: dto.priority,
          sortOrder: dto.sortOrder,
          dueOffsetDays: dto.dueOffsetDays,
          requiresDocument: dto.requiresDocument,
          documentTypeId: dto.documentTypeId,
          instructions: dto.instructions !== undefined ? this.nullableString(dto.instructions) : undefined,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.lifecycleTemplateTaskInclude,
      });

      const after = this.toJsonObject(task);
      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeLifecycleTemplateTask', task.id, before, after);
      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_template_task.updated', existing.templateId, {
        templateId: existing.templateId,
        templateTaskId: task.id,
        ownerType: task.ownerType,
      });

      return task;
    });
  }

  async createEmployeeLifecyclePlanFromTemplate(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: InstantiateEmployeeLifecycleTemplateDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const template = await this.findLifecycleTemplateOrThrow(tx, tenantId, dto.templateId);

      if (template.status !== EmployeeLifecycleTemplateStatus.ACTIVE) {
        throw new BadRequestException('Only active lifecycle templates can be assigned to employees.');
      }

      const startsAt = this.toDate(dto.startsAt) ?? new Date();
      const targetDate =
        this.toDate(dto.targetDate) ??
        (template.targetDays !== null && template.targetDays !== undefined
          ? this.addDays(startsAt, template.targetDays)
          : undefined);
      const plan = await tx.employeeLifecyclePlan.create({
        data: {
          tenantId,
          employeeId: employee.id,
          type: template.type,
          status: EmployeeLifecyclePlanStatus.ACTIVE,
          title: dto.title?.trim() || template.name,
          description: template.description,
          startsAt,
          targetDate,
          createdById: actor.id,
          updatedById: actor.id,
          metadata: this.toJson({
            ...this.jsonRecord(template.metadata),
            ...this.jsonRecord(dto.metadata),
            templateId: template.id,
            templateCode: template.code,
          }),
        },
      });

      for (const templateTask of template.tasks.filter((task) => !task.deletedAt)) {
        const dueAt =
          templateTask.dueOffsetDays !== null && templateTask.dueOffsetDays !== undefined
            ? this.addDays(startsAt, templateTask.dueOffsetDays)
            : undefined;
        const assignment = await this.lifecycleTaskAssignment(tx, tenantId, employee, {
          ownerType: templateTask.ownerType,
        });

        await tx.employeeLifecycleTask.create({
          data: {
            tenantId,
            employeeId: employee.id,
            planId: plan.id,
            title: templateTask.title,
            description: templateTask.description,
            category: templateTask.category,
            ownerType: templateTask.ownerType,
            assignedUserId: assignment.assignedUserId,
            assignedEmployeeId: assignment.assignedEmployeeId,
            priority: templateTask.priority,
            dueAt,
            instructions: templateTask.instructions,
            metadata: this.toJson({
              ...this.jsonRecord(templateTask.metadata),
              templateId: template.id,
              templateCode: template.code,
              templateTaskId: templateTask.id,
              requiresDocument: templateTask.requiresDocument,
              documentTypeId: templateTask.documentTypeId,
              documentTypeCode: templateTask.documentType?.code,
            }),
          },
        });
      }

      const created = await tx.employeeLifecyclePlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: this.lifecyclePlanInclude,
      });
      const after = this.toJsonObject(created);
      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeLifecyclePlan', created.id, null, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Onboarding plan assigned',
        description: `${template.name} was assigned to ${employee.employeeNumber}.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_plan.assigned_from_template', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        planId: created.id,
        templateId: template.id,
        templateCode: template.code,
        taskCount: created.tasks.length,
      });

      return created;
    });
  }

  async listEmployeeExitRecords(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId);

    return this.prisma.employeeExitRecord.findMany({
      where: { tenantId, employeeId, deletedAt: null },
      include: this.exitRecordInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async startEmployeeOffboarding(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: StartEmployeeOffboardingDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const activeExit = await tx.employeeExitRecord.findFirst({
        where: {
          tenantId,
          employeeId: employee.id,
          deletedAt: null,
          status: {
            in: [
              EmployeeExitRecordStatus.DRAFT,
              EmployeeExitRecordStatus.ACTIVE,
              EmployeeExitRecordStatus.READY_FOR_SEPARATION,
            ],
          },
        },
        select: { id: true },
      });

      if (activeExit) {
        throw new BadRequestException('This employee already has an active offboarding case.');
      }

      const startsAt = this.toDate(dto.noticeDate) ?? new Date();
      let lifecyclePlanId: string | undefined;
      let templateCode: string | undefined;

      if (dto.templateId) {
        const template = await this.findLifecycleTemplateOrThrow(tx, tenantId, dto.templateId);

        if (template.status !== EmployeeLifecycleTemplateStatus.ACTIVE) {
          throw new BadRequestException('Only active offboarding templates can be assigned.');
        }

        if (template.type !== EmployeeLifecyclePlanType.OFFBOARDING) {
          throw new BadRequestException('The selected lifecycle template must be an offboarding template.');
        }

        const plan = await tx.employeeLifecyclePlan.create({
          data: {
            tenantId,
            employeeId: employee.id,
            type: EmployeeLifecyclePlanType.OFFBOARDING,
            status: EmployeeLifecyclePlanStatus.ACTIVE,
            title: `${employee.employeeNumber} offboarding plan`,
            description: template.description,
            startsAt,
            targetDate:
              this.toDate(dto.separationDate) ??
              (template.targetDays !== null && template.targetDays !== undefined
                ? this.addDays(startsAt, template.targetDays)
                : undefined),
            createdById: actor.id,
            updatedById: actor.id,
            metadata: this.toJson({
              ...this.jsonRecord(template.metadata),
              templateId: template.id,
              templateCode: template.code,
              source: 'offboarding_case',
            }),
          },
        });

        for (const templateTask of template.tasks.filter((task) => !task.deletedAt)) {
          const dueAt =
            templateTask.dueOffsetDays !== null && templateTask.dueOffsetDays !== undefined
              ? this.addDays(startsAt, templateTask.dueOffsetDays)
              : this.toDate(dto.lastWorkingDate) ?? this.toDate(dto.separationDate);
          const assignment = await this.lifecycleTaskAssignment(tx, tenantId, employee, {
            ownerType: templateTask.ownerType,
          });

          await tx.employeeLifecycleTask.create({
            data: {
              tenantId,
              employeeId: employee.id,
              planId: plan.id,
              title: templateTask.title,
              description: templateTask.description,
              category: templateTask.category,
              ownerType: templateTask.ownerType,
              assignedUserId: assignment.assignedUserId,
              assignedEmployeeId: assignment.assignedEmployeeId,
              priority: templateTask.priority,
              dueAt,
              instructions: templateTask.instructions,
              metadata: this.toJson({
                ...this.jsonRecord(templateTask.metadata),
                templateId: template.id,
                templateCode: template.code,
                templateTaskId: templateTask.id,
                offboardingCase: true,
                requiresDocument: templateTask.requiresDocument,
                documentTypeId: templateTask.documentTypeId,
              }),
            },
          });
        }

        lifecyclePlanId = plan.id;
        templateCode = template.code;
      }

      const exitRecord = await tx.employeeExitRecord.create({
        data: {
          tenantId,
          employeeId: employee.id,
          lifecyclePlanId,
          status: EmployeeExitRecordStatus.ACTIVE,
          separationType: this.nullableString(dto.separationType),
          separationReason: this.nullableString(dto.separationReason),
          noticeDate: this.toDate(dto.noticeDate),
          lastWorkingDate: this.toDate(dto.lastWorkingDate),
          separationDate: this.toDate(dto.separationDate),
          eligibleForRehire: dto.eligibleForRehire,
          rehireRecommendation: this.nullableString(dto.rehireRecommendation),
          accessCutoffAt: this.toDate(dto.accessCutoffAt),
          createdById: actor.id,
          updatedById: actor.id,
          metadata: this.toJson({
            ...this.jsonRecord(dto.metadata),
            lifecycleTemplateId: dto.templateId,
            lifecycleTemplateCode: templateCode,
          }),
        },
      });

      const checklist = dto.checklist?.length
        ? dto.checklist
        : this.defaultExitClearanceChecklist(dto);

      for (const item of checklist) {
        await this.createClearanceItemInTransaction(tx, tenantId, employee.id, exitRecord.id, item);
      }

      const refreshed = await this.refreshExitRecordClearanceStatuses(tx, tenantId, exitRecord.id);
      const after = this.toJsonObject(refreshed);

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeExitRecord', exitRecord.id, null, after);
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Offboarding case opened',
        description: `${employee.employeeNumber} entered managed offboarding.`,
        data: after,
      });
      await this.enqueueOutbox(tx, tenantId, 'employee.offboarding.started', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        exitRecordId: exitRecord.id,
        lifecyclePlanId,
        clearanceCount: refreshed.clearanceItems.length,
      });

      return refreshed;
    });
  }

  async updateEmployeeExitRecord(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    exitRecordId: string,
    dto: UpdateEmployeeExitRecordDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findExitRecordOrThrow(tx, tenantId, employee.id, exitRecordId);
      const before = this.toJsonObject(existing);
      const updated = await tx.employeeExitRecord.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          separationType: dto.separationType !== undefined ? this.nullableString(dto.separationType) : undefined,
          separationReason:
            dto.separationReason !== undefined ? this.nullableString(dto.separationReason) : undefined,
          noticeDate: dto.noticeDate !== undefined ? this.toDate(dto.noticeDate) ?? null : undefined,
          lastWorkingDate:
            dto.lastWorkingDate !== undefined ? this.toDate(dto.lastWorkingDate) ?? null : undefined,
          separationDate: dto.separationDate !== undefined ? this.toDate(dto.separationDate) ?? null : undefined,
          eligibleForRehire: dto.eligibleForRehire,
          rehireRecommendation:
            dto.rehireRecommendation !== undefined ? this.nullableString(dto.rehireRecommendation) : undefined,
          exitInterviewCompleted: dto.exitInterviewCompleted,
          finalDocumentCollectionStatus: dto.finalDocumentCollectionStatus,
          assetClearanceStatus: dto.assetClearanceStatus,
          accessClearanceStatus: dto.accessClearanceStatus,
          accessCutoffAt: dto.accessCutoffAt !== undefined ? this.toDate(dto.accessCutoffAt) ?? null : undefined,
          cancelledAt: dto.status === EmployeeExitRecordStatus.CANCELLED ? new Date() : undefined,
          updatedById: actor.id,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.exitRecordInclude,
      });

      const after = this.toJsonObject(updated);
      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeExitRecord', updated.id, before, after);
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Offboarding case updated',
        description: `${employee.employeeNumber} offboarding controls were updated.`,
        data: after,
      });
      await this.enqueueOutbox(tx, tenantId, 'employee.offboarding.updated', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        exitRecordId: updated.id,
        status: updated.status,
      });

      return updated;
    });
  }

  async completeEmployeeExitRecord(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    exitRecordId: string,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findExitRecordOrThrow(tx, tenantId, employee.id, exitRecordId);
      const openItems = existing.clearanceItems.filter(
        (item) => !this.clearanceIsTerminal(item.status),
      );

      if (openItems.length > 0) {
        throw new BadRequestException('All clearance items must be cleared, waived, or cancelled before completion.');
      }

      const before = this.toJsonObject(existing);
      const updated = await tx.employeeExitRecord.update({
        where: { id: existing.id },
        data: {
          status: EmployeeExitRecordStatus.COMPLETED,
          completedAt: new Date(),
          completedById: actor.id,
          updatedById: actor.id,
          ...this.exitRecordAggregateStatusData(existing.clearanceItems),
        },
        include: this.exitRecordInclude,
      });

      const after = this.toJsonObject(updated);
      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeExitRecord', updated.id, before, after);
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_SEPARATED,
        title: 'Offboarding completed',
        description: `${employee.employeeNumber} offboarding clearance is complete.`,
        data: after,
      });
      await this.enqueueOutbox(tx, tenantId, 'employee.offboarding.completed', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        exitRecordId: updated.id,
        eligibleForRehire: updated.eligibleForRehire,
      });

      return updated;
    });
  }

  async createEmployeeClearanceItem(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    exitRecordId: string,
    dto: CreateEmployeeClearanceItemDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      await this.findExitRecordOrThrow(tx, tenantId, employee.id, exitRecordId);
      const item = await this.createClearanceItemInTransaction(tx, tenantId, employee.id, exitRecordId, dto);
      await this.refreshExitRecordClearanceStatuses(tx, tenantId, exitRecordId);

      const after = this.toJsonObject(item);
      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeClearanceItem', item.id, null, after);
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Clearance item added',
        description: `${item.title} was added to ${employee.employeeNumber} offboarding.`,
        data: after,
      });
      await this.enqueueOutbox(tx, tenantId, 'employee.clearance_item.created', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        exitRecordId,
        clearanceItemId: item.id,
        type: item.type,
      });

      return item;
    });
  }

  async updateEmployeeClearanceItem(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    clearanceItemId: string,
    dto: UpdateEmployeeClearanceItemDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findClearanceItemOrThrow(tx, tenantId, employee.id, clearanceItemId);
      const before = this.toJsonObject(existing);
      const clearanceStatus = dto.status;
      const isClearing = clearanceStatus === EmployeeClearanceStatus.CLEARED;
      const isMovingAwayFromCleared = Boolean(clearanceStatus && clearanceStatus !== EmployeeClearanceStatus.CLEARED);
      const item = await tx.employeeClearanceItem.update({
        where: { id: existing.id },
        data: {
          status: clearanceStatus,
          title: dto.title !== undefined ? this.requiredString(dto.title, 'clearanceItem.title') : undefined,
          description: dto.description !== undefined ? this.nullableString(dto.description) : undefined,
          ownerUserId: dto.ownerUserId !== undefined ? this.nullableString(dto.ownerUserId) : undefined,
          ownerEmployeeId:
            dto.ownerEmployeeId !== undefined ? this.nullableString(dto.ownerEmployeeId) : undefined,
          assetTag: dto.assetTag !== undefined ? this.nullableString(dto.assetTag) : undefined,
          systemName: dto.systemName !== undefined ? this.nullableString(dto.systemName) : undefined,
          dueAt: dto.dueAt !== undefined ? this.toDate(dto.dueAt) ?? null : undefined,
          clearedAt:
            isClearing
              ? this.toDate(dto.clearedAt) ?? new Date()
              : isMovingAwayFromCleared
                ? null
                : dto.clearedAt !== undefined
                  ? this.toDate(dto.clearedAt) ?? null
                  : undefined,
          clearedById:
            isClearing
              ? actor.id
              : isMovingAwayFromCleared
                ? null
                : undefined,
          blockedReason: dto.blockedReason !== undefined ? this.nullableString(dto.blockedReason) : undefined,
          evidence: dto.evidence !== undefined ? this.toJson(dto.evidence) : undefined,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.clearanceItemInclude,
      });

      const refreshed = await this.refreshExitRecordClearanceStatuses(tx, tenantId, existing.exitRecordId);
      const after = this.toJsonObject(item);

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeClearanceItem', item.id, before, after);
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Clearance item updated',
        description: `${item.title} is now ${item.status.toLowerCase().replace(/_/g, ' ')}.`,
        data: {
          ...after,
          exitRecordStatus: refreshed.status,
        },
      });
      await this.enqueueOutbox(tx, tenantId, 'employee.clearance_item.updated', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        exitRecordId: item.exitRecordId,
        clearanceItemId: item.id,
        status: item.status,
      });

      return item;
    });
  }

  async createEmployeeRehireRecord(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: CreateEmployeeRehireRecordDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId, true);
      const exitRecord = dto.exitRecordId
        ? await this.findExitRecordOrThrow(tx, tenantId, employee.id, dto.exitRecordId)
        : null;
      const status = dto.status ?? EmployeeRehireRecordStatus.REVIEW;
      const approved = status === EmployeeRehireRecordStatus.APPROVED || status === EmployeeRehireRecordStatus.COMPLETED;
      const record = await tx.employeeRehireRecord.create({
        data: {
          tenantId,
          employeeId: employee.id,
          exitRecordId: exitRecord?.id,
          policy: dto.policy ?? EmployeeRehirePolicy.SAME_EMPLOYEE_RECORD,
          status,
          effectiveDate: this.toDate(dto.effectiveDate),
          reason: this.nullableString(dto.reason),
          decisionNote: this.nullableString(dto.decisionNote),
          approvedAt: approved ? new Date() : undefined,
          approvedById: approved ? actor.id : undefined,
          completedAt: status === EmployeeRehireRecordStatus.COMPLETED ? new Date() : undefined,
          createdById: actor.id,
          metadata: this.toJson(dto.metadata),
        },
        include: this.rehireRecordInclude,
      });

      const after = this.toJsonObject(record);
      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeRehireRecord', record.id, null, after);
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_REINSTATED,
        title: 'Rehire review recorded',
        description: `${employee.employeeNumber} rehire review is ${record.status.toLowerCase().replace(/_/g, ' ')}.`,
        data: after,
      });
      await this.enqueueOutbox(tx, tenantId, 'employee.rehire_record.created', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        rehireRecordId: record.id,
        status: record.status,
        policy: record.policy,
      });

      return record;
    });
  }

  async getEmployeeGovernanceSnapshot(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId, true);
    const canViewSensitive = this.canViewSensitiveEmployeeData(actor);
    const readiness = this.masterDataReadiness(employee);
    const activeExit = await this.prisma.employeeExitRecord.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        deletedAt: null,
        status: {
          in: [
            EmployeeExitRecordStatus.DRAFT,
            EmployeeExitRecordStatus.ACTIVE,
            EmployeeExitRecordStatus.READY_FOR_SEPARATION,
          ],
        },
      },
      include: this.exitRecordInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    const [auditLogs, outboxCounts, documentCounts, timelineEvents, importJobs] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          tenantId,
          OR: [
            { entityId: employee.id },
            { entityType: { startsWith: 'Employee' }, after: { path: ['employeeId'], equals: employee.id } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 10,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      }),
      this.prisma.outboxMessage.groupBy({
        by: ['status'],
        where: {
          tenantId,
          aggregateType: 'Employee',
          aggregateId: employee.id,
        },
        _count: { _all: true },
      }),
      this.prisma.document.groupBy({
        by: ['verificationStatus'],
        where: {
          tenantId,
          employeeId: employee.id,
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      this.prisma.timelineEvent.findMany({
        where: { tenantId, employeeId: employee.id },
        orderBy: [{ createdAt: 'desc' }],
        take: 10,
      }),
      this.prisma.employeeImportJobRow.findMany({
        where: { tenantId, employeeId: employee.id },
        orderBy: [{ createdAt: 'desc' }],
        take: 5,
        include: {
          job: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      }),
    ]);

    const outbox = Object.fromEntries(outboxCounts.map((item) => [item.status, item._count._all]));
    const documents = Object.fromEntries(documentCounts.map((item) => [item.verificationStatus, item._count._all]));
    const lifecycleTasks = employee.lifecycleTasks ?? [];
    const lifecycleTotal = lifecycleTasks.length;
    const lifecycleCompleted = lifecycleTasks.filter((task) => this.lifecycleTaskIsTerminal(task.status)).length;
    const exitTotal = activeExit?.clearanceItems.length ?? 0;
    const exitCompleted =
      activeExit?.clearanceItems.filter((item) => this.clearanceIsTerminal(item.status)).length ?? 0;
    const documentPenalty =
      (documents.REJECTED ?? 0) * 20 + (documents.EXPIRED ?? 0) * 20 + (documents.PENDING ?? 0) * 5;
    const complianceInputs = [
      readiness.completionPercent,
      lifecycleTotal ? Math.round((lifecycleCompleted / lifecycleTotal) * 100) : 100,
      exitTotal ? Math.round((exitCompleted / exitTotal) * 100) : 100,
      Math.max(0, 100 - documentPenalty),
    ];
    const complianceScore = Math.round(
      complianceInputs.reduce((sum, value) => sum + value, 0) / complianceInputs.length,
    );

    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      generatedAt: new Date().toISOString(),
      fieldAccess: {
        sensitiveData: canViewSensitive ? 'VISIBLE' : 'MASKED',
        identity: {
          read: true,
          write: this.canReadTenantWideWorkforce(actor),
        },
        payout: {
          read: canViewSensitive,
          write: this.canReadTenantWideWorkforce(actor),
          masked: !canViewSensitive,
        },
        statutory: {
          read: canViewSensitive,
          write: this.canReadTenantWideWorkforce(actor),
          masked: !canViewSensitive,
        },
        exit: {
          read: this.canReadTenantWideWorkforce(actor),
          write: this.canReadTenantWideWorkforce(actor),
        },
      },
      readiness,
      compliance: {
        score: complianceScore,
        lifecycleCompletionPercent: lifecycleTotal ? Math.round((lifecycleCompleted / lifecycleTotal) * 100) : 100,
        exitClearancePercent: exitTotal ? Math.round((exitCompleted / exitTotal) * 100) : 100,
        documentCounts: documents,
        outboxCounts: outbox,
      },
      activeExit,
      sensitiveProfile: {
        payoutAccounts: (employee.payoutAccounts ?? []).map((account) => ({
          id: account.id,
          bankName: account.bankName,
          accountHolderName: canViewSensitive ? account.accountHolderName : this.maskName(account.accountHolderName),
          accountNumberLast4: account.accountNumberLast4,
          routingNumberLast4: canViewSensitive ? account.routingNumberLast4 : account.routingNumberLast4 ? '••••' : null,
          ibanLast4: account.ibanLast4,
          currencyCode: account.currencyCode,
          status: account.status,
          isPrimary: account.isPrimary,
        })),
        statutoryIdentifiers: (employee.statutoryIdentifiers ?? []).map((identifier) => ({
          id: identifier.id,
          type: identifier.type,
          label: identifier.label,
          country: identifier.country?.name ?? null,
          identifierLast4: identifier.identifierLast4,
          status: identifier.status,
          expiresAt: identifier.expiresAt,
        })),
      },
      recentAudit: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        actor: log.actor,
        createdAt: log.createdAt,
      })),
      recentTimeline: timelineEvents,
      importHistory: importJobs.map((row) => ({
        id: row.id,
        jobId: row.jobId,
        line: row.line,
        status: row.status,
        employeeNumber: row.employeeNumber,
        processedAt: row.processedAt,
        job: row.job,
      })),
      qualitySignals: {
        missingFields: readiness.missing,
        openLifecycleTasks: lifecycleTasks.filter((task) => !this.lifecycleTaskIsTerminal(task.status)).length,
        blockedLifecycleTasks: lifecycleTasks.filter((task) => task.status === EmployeeLifecycleTaskStatus.BLOCKED).length,
        openClearanceItems: activeExit?.clearanceItems.filter((item) => !this.clearanceIsTerminal(item.status)).length ?? 0,
      },
    };
  }

  async listEmployeeLifecyclePlans(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId);

    return this.prisma.employeeLifecyclePlan.findMany({
      where: { tenantId, employeeId },
      include: this.lifecyclePlanInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createEmployeeLifecyclePlan(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: CreateEmployeeLifecyclePlanDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const plan = await tx.employeeLifecyclePlan.create({
        data: {
          tenantId,
          employeeId: employee.id,
          type: dto.type,
          status: dto.status ?? EmployeeLifecyclePlanStatus.ACTIVE,
          title: this.requiredString(dto.title, 'lifecyclePlan.title'),
          description: this.nullableString(dto.description),
          startsAt: this.toDate(dto.startsAt),
          targetDate: this.toDate(dto.targetDate),
          createdById: actor.id,
          updatedById: actor.id,
          metadata: this.toJson(dto.metadata),
        },
        include: this.lifecyclePlanInclude,
      });

      const after = this.toJsonObject(plan);

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeLifecyclePlan', plan.id, null, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Lifecycle plan created',
        description: `${employee.employeeNumber} lifecycle plan "${plan.title}" was created.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_plan.created', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        planId: plan.id,
        type: plan.type,
        status: plan.status,
      });

      return plan;
    });
  }

  async updateEmployeeLifecyclePlan(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    planId: string,
    dto: UpdateEmployeeLifecyclePlanDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findLifecyclePlanOrThrow(tx, tenantId, employee.id, planId);
      const before = this.toJsonObject(existing);
      const status = dto.status;
      const now = new Date();

      const plan = await tx.employeeLifecyclePlan.update({
        where: { id: existing.id },
        data: {
          title: dto.title !== undefined ? this.requiredString(dto.title, 'lifecyclePlan.title') : undefined,
          description: dto.description !== undefined ? this.nullableString(dto.description) : undefined,
          status,
          startsAt: dto.startsAt !== undefined ? this.toDate(dto.startsAt) ?? null : undefined,
          targetDate: dto.targetDate !== undefined ? this.toDate(dto.targetDate) ?? null : undefined,
          completedAt: status === EmployeeLifecyclePlanStatus.COMPLETED ? existing.completedAt ?? now : undefined,
          cancelledAt: status === EmployeeLifecyclePlanStatus.CANCELLED ? existing.cancelledAt ?? now : undefined,
          updatedById: actor.id,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.lifecyclePlanInclude,
      });

      const after = this.toJsonObject(plan);
      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeLifecyclePlan', plan.id, before, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Lifecycle plan updated',
        description: `${employee.employeeNumber} lifecycle plan "${plan.title}" was updated.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_plan.updated', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        planId: plan.id,
        status: plan.status,
      });

      return plan;
    });
  }

  async createEmployeeLifecycleTask(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    planId: string,
    dto: CreateEmployeeLifecycleTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const plan = await this.findLifecyclePlanOrThrow(tx, tenantId, employee.id, planId);

      if (plan.status === EmployeeLifecyclePlanStatus.CANCELLED || plan.status === EmployeeLifecyclePlanStatus.ARCHIVED) {
        throw new BadRequestException('Lifecycle tasks cannot be added to a closed plan.');
      }

      const assignment = await this.lifecycleTaskAssignment(tx, tenantId, employee, dto);
      const task = await tx.employeeLifecycleTask.create({
        data: {
          tenantId,
          employeeId: employee.id,
          planId: plan.id,
          title: this.requiredString(dto.title, 'lifecycleTask.title'),
          description: this.nullableString(dto.description),
          category: this.nullableString(dto.category),
          ownerType: dto.ownerType ?? EmployeeLifecycleTaskOwnerType.HR,
          assignedUserId: assignment.assignedUserId,
          assignedEmployeeId: assignment.assignedEmployeeId,
          priority: dto.priority,
          dueAt: this.toDate(dto.dueAt),
          instructions: this.nullableString(dto.instructions),
          metadata: this.toJson(dto.metadata),
        },
        include: this.lifecycleTaskInclude,
      });

      if (plan.status === EmployeeLifecyclePlanStatus.COMPLETED) {
        await tx.employeeLifecyclePlan.update({
          where: { id: plan.id },
          data: {
            status: EmployeeLifecyclePlanStatus.ACTIVE,
            completedAt: null,
            updatedById: actor.id,
          },
        });
      }

      const after = this.toJsonObject(task);
      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'EmployeeLifecycleTask', task.id, null, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Lifecycle task added',
        description: `${task.title} was added to ${employee.employeeNumber}.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_task.created', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        planId: plan.id,
        taskId: task.id,
        ownerType: task.ownerType,
        status: task.status,
      });

      return task;
    });
  }

  async updateEmployeeLifecycleTask(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    taskId: string,
    dto: UpdateEmployeeLifecycleTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findLifecycleTaskOrThrow(tx, tenantId, employee.id, taskId);
      const before = this.toJsonObject(existing);
      const assignment = await this.lifecycleTaskAssignment(tx, tenantId, employee, dto);

      const task = await tx.employeeLifecycleTask.update({
        where: { id: existing.id },
        data: {
          title: dto.title !== undefined ? this.requiredString(dto.title, 'lifecycleTask.title') : undefined,
          description: dto.description !== undefined ? this.nullableString(dto.description) : undefined,
          category: dto.category !== undefined ? this.nullableString(dto.category) : undefined,
          ownerType: dto.ownerType,
          assignedUserId: dto.assignedUserId !== undefined || dto.ownerType === EmployeeLifecycleTaskOwnerType.EMPLOYEE ? assignment.assignedUserId : undefined,
          assignedEmployeeId: dto.assignedEmployeeId !== undefined || dto.ownerType === EmployeeLifecycleTaskOwnerType.EMPLOYEE ? assignment.assignedEmployeeId : undefined,
          status: dto.status,
          priority: dto.priority,
          dueAt: dto.dueAt !== undefined ? this.toDate(dto.dueAt) ?? null : undefined,
          instructions: dto.instructions !== undefined ? this.nullableString(dto.instructions) : undefined,
          blockedReason: dto.blockedReason !== undefined ? this.nullableString(dto.blockedReason) : undefined,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: this.lifecycleTaskInclude,
      });

      await this.refreshLifecyclePlanStatus(tx, tenantId, task.planId, actor.id);

      const after = this.toJsonObject(task);
      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeLifecycleTask', task.id, before, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Lifecycle task updated',
        description: `${task.title} was updated for ${employee.employeeNumber}.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_task.updated', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        planId: task.planId,
        taskId: task.id,
        status: task.status,
      });

      return task;
    });
  }

  async completeEmployeeLifecycleTask(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    taskId: string,
    dto: CompleteEmployeeLifecycleTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      return this.completeLifecycleTaskForEmployee(tx, actor, tenantId, employee, taskId, dto, false);
    });
  }

  async blockEmployeeLifecycleTask(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    taskId: string,
    dto: BlockEmployeeLifecycleTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findLifecycleTaskOrThrow(tx, tenantId, employee.id, taskId);

      if (this.lifecycleTaskIsTerminal(existing.status)) {
        throw new BadRequestException('Completed, waived, or cancelled lifecycle tasks cannot be blocked.');
      }

      const before = this.toJsonObject(existing);
      const task = await tx.employeeLifecycleTask.update({
        where: { id: existing.id },
        data: {
          status: EmployeeLifecycleTaskStatus.BLOCKED,
          blockedReason: this.requiredString(dto.reason, 'reason'),
        },
        include: this.lifecycleTaskInclude,
      });

      await this.refreshLifecyclePlanStatus(tx, tenantId, task.planId, actor.id);
      await this.writeLifecycleTaskMutation(tx, actor, tenantId, employee, task, before, 'blocked');

      return task;
    });
  }

  async waiveEmployeeLifecycleTask(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    taskId: string,
    dto: WaiveEmployeeLifecycleTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findLifecycleTaskOrThrow(tx, tenantId, employee.id, taskId);
      const before = this.toJsonObject(existing);
      const now = new Date();
      const task = await tx.employeeLifecycleTask.update({
        where: { id: existing.id },
        data: {
          status: EmployeeLifecycleTaskStatus.WAIVED,
          waivedAt: now,
          waivedById: actor.id,
          blockedReason: null,
          evidence: this.toJson({
            ...this.jsonRecord(existing.evidence),
            waiverReason: dto.reason ?? 'Waived by HR.',
          }),
        },
        include: this.lifecycleTaskInclude,
      });

      await this.refreshLifecyclePlanStatus(tx, tenantId, task.planId, actor.id);
      await this.writeLifecycleTaskMutation(tx, actor, tenantId, employee, task, before, 'waived');

      return task;
    });
  }

  async listMyLifecycleTasks(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.prisma.employee.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        OR: this.selfEmployeeWhere(actor),
      },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not linked.');
    }

    return this.prisma.employeeLifecycleTask.findMany({
      where: {
        tenantId,
        employeeId: employee.id,
        OR: [
          { ownerType: EmployeeLifecycleTaskOwnerType.EMPLOYEE },
          { assignedUserId: actor.id },
          { assignedEmployeeId: employee.id },
        ],
      },
      include: this.lifecycleTaskInclude,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async completeMyLifecycleTask(
    actor: AuthenticatedPrincipal,
    taskId: string,
    dto: CompleteEmployeeLifecycleTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: this.selfEmployeeWhere(actor),
        },
        include: this.employeeInclude,
      });

      if (!employee) {
        throw new NotFoundException('Employee profile not linked.');
      }

      return this.completeLifecycleTaskForEmployee(tx, actor, tenantId, employee, taskId, dto, true);
    });
  }

  async remindEmployeeLifecycleTask(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    taskId: string,
    dto: RemindEmployeeLifecycleTaskDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const task = await this.findLifecycleTaskOrThrow(tx, tenantId, employee.id, taskId);

      if (this.lifecycleTaskIsTerminal(task.status)) {
        throw new BadRequestException('Completed, waived, or cancelled lifecycle tasks do not need reminders.');
      }

      const recipientUserId = task.assignedUserId ?? employee.userId;
      const recipientEmployeeId = task.assignedEmployeeId ?? employee.id;
      const reminderMessage =
        dto.message?.trim() ||
        `Please complete "${task.title}" for ${employee.employeeNumber}.`;
      const notification = await tx.notification.create({
        data: {
          tenantId,
          channel: NotificationChannel.IN_APP,
          title: 'Employment readiness task reminder',
          body: reminderMessage,
          status: NotificationStatus.PENDING,
          templateCode: 'EMPLOYEE_LIFECYCLE_TASK_REMINDER',
          data: {
            module: 'employees',
            employeeId: employee.id,
            taskId: task.id,
            planId: task.planId,
          },
          recipients: {
            create: {
              userId: recipientUserId,
              employeeId: recipientEmployeeId,
              status: NotificationStatus.PENDING,
            },
          },
        },
        include: { recipients: true },
      });

      await tx.employeeLifecycleTask.update({
        where: { id: task.id },
        data: {
          metadata: this.toJson({
            ...this.jsonRecord(task.metadata),
            lastReminderAt: new Date().toISOString(),
            lastReminderById: actor.id,
          }),
        },
      });

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Onboarding reminder sent',
        description: `A reminder was sent for "${task.title}".`,
        data: this.toJsonObject({
          taskId: task.id,
          notificationId: notification.id,
          recipientUserId,
          recipientEmployeeId,
        }),
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.lifecycle_task.reminder', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        planId: task.planId,
        taskId: task.id,
        notificationId: notification.id,
      });

      return { notificationId: notification.id, taskId: task.id, recipients: notification.recipients.length };
    });
  }

  async createMyEmployeeDocumentUploadIntent(
    actor: AuthenticatedPrincipal,
    dto: CreateDocumentVersionUploadIntentDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.findSelfEmployeeOrThrow(this.prisma, tenantId, actor);

    try {
      const intent = this.documentStorage.createUploadIntent({
        tenantId,
        documentId: `self-service-${employee.id}`,
        dto: {
          ...dto,
          setCurrent: true,
          metadata: {
            ...dto.metadata,
            source: 'employee-self-service',
            employeeId: employee.id,
          },
        },
      });

      return {
        ...intent,
        uploadUrl:
          intent.provider === 'local'
            ? intent.uploadUrl.replace(
                '/api/v1/documents/uploads/local/',
                '/api/v1/employees/me/documents/uploads/local/',
              )
            : intent.uploadUrl,
        version: {
          ...intent.version,
          metadata: {
            ...intent.version.metadata,
            source: 'employee-self-service',
            employeeId: employee.id,
          },
        },
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Upload intent could not be created.');
    }
  }

  async saveMyEmployeeDocumentLocalUpload(
    actor: AuthenticatedPrincipal,
    uploadToken: string,
    request: import('express').Request,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findSelfEmployeeOrThrow(this.prisma, tenantId, actor);

    try {
      return await this.documentStorage.saveLocalUpload({
        tenantId,
        token: uploadToken,
        request,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Upload could not be saved.');
    }
  }

  async createMyEmployeeDocument(actor: AuthenticatedPrincipal, dto: CreateMyEmployeeDocumentDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findSelfEmployeeOrThrow(tx, tenantId, actor);
      const documentType = await this.assertDocumentTypeReadable(tx, tenantId, dto.documentTypeId);
      const hasInitialVersion = Boolean(dto.fileName || dto.fileUrl);

      if (hasInitialVersion && (!dto.fileName || !dto.fileUrl)) {
        throw new BadRequestException('File name and file URL are both required when submitting a document version.');
      }

      const document = await tx.document.create({
        data: {
          tenantId,
          employeeId: employee.id,
          documentTypeId: documentType?.id,
          title: this.requiredString(dto.title, 'document.title'),
          description: this.nullableString(dto.description),
          visibility: DocumentVisibility.EMPLOYEE_VISIBLE,
          verificationStatus: DocumentVerificationStatus.PENDING,
          expiresAt: this.toDate(dto.expiresAt) ?? null,
          createdById: actor.id,
          metadata: this.toJson({
            ...this.jsonRecord(dto.metadata),
            submittedFrom: 'employee-self-service',
          }),
        },
        include: this.selfServiceDocumentInclude,
      });

      let finalDocument = document;

      if (hasInitialVersion) {
        const version = await tx.documentVersion.create({
          data: {
            documentId: document.id,
            versionNo: 1,
            fileName: this.requiredString(dto.fileName, 'document.fileName'),
            fileUrl: this.requiredString(dto.fileUrl, 'document.fileUrl'),
            mimeType: this.nullableString(dto.mimeType),
            sizeBytes: dto.sizeBytes,
            checksum: this.nullableString(dto.checksum),
            uploadedById: actor.id,
            metadata: this.toJson({
              ...this.jsonRecord(dto.metadata),
              source: 'employee-self-service',
            }),
          },
        });

        finalDocument = await tx.document.update({
          where: { id: document.id },
          data: { currentVersionId: version.id },
          include: this.selfServiceDocumentInclude,
        });
      }

      const after = this.toJsonObject(finalDocument);
      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Document', finalDocument.id, null, after);
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.DOCUMENT_UPLOADED,
        title: 'Employee document submitted',
        description: `${finalDocument.title} was submitted for review.`,
        data: after,
      });
      await this.enqueueOutbox(tx, tenantId, 'employee.document.submitted', employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        documentId: finalDocument.id,
        documentTypeId: finalDocument.documentTypeId,
      });

      return finalDocument;
    });
  }

  async updateEmployee(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: UpdateEmployeeDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findEmployeeOrThrow(tx, tenantId, employeeId);

      if (dto.userId !== undefined) {
        await this.validateUserReference(tx, tenantId, existing.person.userId, dto.userId, existing.id);
      }

      const employeeNumber =
        dto.employeeNumber === undefined
          ? undefined
          : this.normalizeEmployeeNumber(dto.employeeNumber);

      if (employeeNumber && employeeNumber !== existing.employeeNumber) {
        await this.assertEmployeeNumberAvailable(tx, tenantId, employeeNumber, existing.id);
      }

      const updated = await tx.employee.update({
        where: { id: existing.id },
        data: {
          userId: dto.userId,
          employeeNumber,
          employmentType: dto.employmentType,
          hireDate: this.toDate(dto.hireDate),
          confirmationDate: this.toDate(dto.confirmationDate),
          endDate: this.toDate(dto.endDate),
          separationReason: dto.separationReason,
          source: dto.source,
          metadata: this.toJson(dto.metadata),
        },
        include: this.employeeInclude,
      });

      if (dto.userId && !existing.person.userId) {
        await tx.person.update({
          where: { id: existing.personId },
          data: { userId: dto.userId },
        });
      }

      const before = this.employeeState(existing);
      const after = this.employeeState(updated);

      await this.createWorkforceAction(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: WorkforceActionType.PROFILE_CHANGE,
        effectiveDate: new Date(),
        reason: 'Employee profile updated.',
        previousState: before,
        proposedState: after,
        finalState: after,
        note: 'Employee profile fields were updated.',
        metadata: dto.metadata,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'Employee', updated.id, before, after);

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Employee updated',
        description: `${updated.employeeNumber} profile was updated.`,
        data: after,
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.updated', updated.id, {
        employeeId: updated.id,
        employeeNumber: updated.employeeNumber,
        status: updated.status,
      });

      return updated;
    });
  }

  async hireEmployee(actor: AuthenticatedPrincipal, employeeId: string, dto: HireEmployeeDto) {
    const targetStatus = dto.status ?? EmployeeStatus.ACTIVE;

    if (!HIRE_TARGET_STATUSES.includes(targetStatus)) {
      throw new BadRequestException('Hire status must be ACTIVE or PROBATION.');
    }

    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus,
      type: WorkforceActionType.HIRE,
      eventType: TimelineEventType.EMPLOYEE_HIRED,
      auditAction: AuditAction.ACTIVATE,
      eventTitle: 'Employee hired',
      outboxEvent: 'employee.hired',
      allowedCurrentStatuses: [EmployeeStatus.PREBOARDING],
      data: {
        hireDate: this.effectiveDate(dto),
        endDate: null,
        separationReason: null,
        deletedAt: null,
      },
    });
  }

  async confirmEmployee(actor: AuthenticatedPrincipal, employeeId: string, dto: EmployeeLifecycleDto) {
    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus: EmployeeStatus.ACTIVE,
      type: WorkforceActionType.CONFIRMATION,
      eventType: TimelineEventType.EMPLOYEE_UPDATED,
      auditAction: AuditAction.UPDATE,
      eventTitle: 'Employee confirmed',
      outboxEvent: 'employee.confirmed',
      allowedCurrentStatuses: [EmployeeStatus.PREBOARDING, EmployeeStatus.PROBATION, EmployeeStatus.ACTIVE],
      data: {
        confirmationDate: this.effectiveDate(dto),
      },
    });
  }

  async suspendEmployee(actor: AuthenticatedPrincipal, employeeId: string, dto: EmployeeLifecycleDto) {
    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus: EmployeeStatus.SUSPENDED,
      type: WorkforceActionType.SUSPENSION,
      eventType: TimelineEventType.EMPLOYEE_SUSPENDED,
      auditAction: AuditAction.SUSPEND,
      eventTitle: 'Employee suspended',
      outboxEvent: 'employee.suspended',
      allowedCurrentStatuses: [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION],
      data: {},
    });
  }

  async reinstateEmployee(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: ReinstateEmployeeDto,
  ) {
    const targetStatus = dto.status ?? EmployeeStatus.ACTIVE;

    if (!HIRE_TARGET_STATUSES.includes(targetStatus)) {
      throw new BadRequestException('Reinstatement status must be ACTIVE or PROBATION.');
    }

    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus,
      type: WorkforceActionType.REINSTATEMENT,
      eventType: TimelineEventType.EMPLOYEE_REINSTATED,
      auditAction: AuditAction.ACTIVATE,
      eventTitle: 'Employee reinstated',
      outboxEvent: 'employee.reinstated',
      allowedCurrentStatuses: [EmployeeStatus.SUSPENDED],
      data: {},
    });
  }

  async separateEmployee(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: SeparateEmployeeDto,
  ) {
    const reason = dto.separationReason ?? dto.reason;

    if (!reason) {
      throw new BadRequestException('A separation reason is required.');
    }

    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus: EmployeeStatus.SEPARATED,
      type: WorkforceActionType.SEPARATION,
      eventType: TimelineEventType.EMPLOYEE_SEPARATED,
      auditAction: AuditAction.UPDATE,
      eventTitle: 'Employee separated',
      outboxEvent: 'employee.separated',
      disallowedCurrentStatuses: TERMINAL_EMPLOYMENT_STATUSES,
      data: {
        endDate: this.effectiveDate(dto),
        separationReason: reason,
      },
    });
  }

  async retireEmployee(actor: AuthenticatedPrincipal, employeeId: string, dto: EmployeeLifecycleDto) {
    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus: EmployeeStatus.RETIRED,
      type: WorkforceActionType.RETIREMENT,
      eventType: TimelineEventType.EMPLOYEE_SEPARATED,
      auditAction: AuditAction.UPDATE,
      eventTitle: 'Employee retired',
      outboxEvent: 'employee.retired',
      disallowedCurrentStatuses: TERMINAL_EMPLOYMENT_STATUSES,
      data: {
        endDate: this.effectiveDate(dto),
        separationReason: dto.reason ?? 'Retirement',
      },
    });
  }

  async markAlumni(actor: AuthenticatedPrincipal, employeeId: string, dto: EmployeeLifecycleDto) {
    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus: EmployeeStatus.ALUMNI,
      type: WorkforceActionType.PROFILE_CHANGE,
      eventType: TimelineEventType.EMPLOYEE_UPDATED,
      auditAction: AuditAction.UPDATE,
      eventTitle: 'Employee moved to alumni',
      outboxEvent: 'employee.alumni',
      allowedCurrentStatuses: [EmployeeStatus.SEPARATED, EmployeeStatus.RETIRED],
      data: {},
    });
  }

  async rehireEmployee(actor: AuthenticatedPrincipal, employeeId: string, dto: RehireEmployeeDto) {
    const targetStatus = dto.status ?? EmployeeStatus.PREBOARDING;

    if (!REHIRE_TARGET_STATUSES.includes(targetStatus)) {
      throw new BadRequestException('Rehire status must be PREBOARDING, ACTIVE, or PROBATION.');
    }

    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus,
      type: WorkforceActionType.REHIRE,
      eventType: TimelineEventType.EMPLOYEE_HIRED,
      auditAction: AuditAction.ACTIVATE,
      eventTitle: 'Employee rehired',
      outboxEvent: 'employee.rehired',
      allowedCurrentStatuses: TERMINAL_EMPLOYMENT_STATUSES,
      includeDeleted: true,
      data: {
        hireDate: this.effectiveDate(dto),
        endDate: null,
        separationReason: null,
        deletedAt: null,
      },
    });
  }

  async archiveEmployee(actor: AuthenticatedPrincipal, employeeId: string, dto: EmployeeLifecycleDto) {
    const tenantId = this.requireTenant(actor);
    await this.assertNoActiveAssignments(tenantId, employeeId);

    return this.transitionEmployee(actor, employeeId, {
      dto,
      targetStatus: EmployeeStatus.ARCHIVED,
      type: WorkforceActionType.PROFILE_CHANGE,
      eventType: TimelineEventType.EMPLOYEE_UPDATED,
      auditAction: AuditAction.ARCHIVE,
      eventTitle: 'Employee archived',
      outboxEvent: 'employee.archived',
      allowedCurrentStatuses: [EmployeeStatus.SEPARATED, EmployeeStatus.RETIRED, EmployeeStatus.ALUMNI],
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async deleteEmployee(actor: AuthenticatedPrincipal, employeeId: string) {
    return this.archiveEmployee(actor, employeeId, {
      reason: 'Employee archived through DELETE endpoint.',
    });
  }

  async linkEmployeeAccount(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: LinkEmployeeAccountDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const roleCode = (dto.roleCode ?? 'EMPLOYEE').trim().toUpperCase();

    const result = await this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const user = await this.resolveEmployeeAccountUser(tx, tenantId, dto);

      if (employee.userId && employee.userId !== user.id) {
        throw new BadRequestException('Employee is already linked to another user account.');
      }

      await this.validateUserReference(tx, tenantId, employee.person.userId, user.id, employee.id);
      await this.assertUserNotLinkedToAnotherPerson(tx, tenantId, user.id, employee.personId);

      const role = await tx.role.findFirst({
        where: {
          tenantId,
          code: roleCode,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true, scope: true, code: true, name: true },
      });

      if (!role) {
        throw new BadRequestException(`Role ${roleCode} is not available for this tenant.`);
      }

      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, slug: true },
      });

      if (!tenant) {
        throw new BadRequestException('Tenant is not available.');
      }

      const [updated] = await Promise.all([
        tx.employee.update({
          where: { id: employee.id },
          data: { userId: user.id },
          include: this.employeeInclude,
        }),
        tx.person.update({
          where: { id: employee.personId },
          data: { userId: user.id },
        }),
        tx.userRole.upsert({
          where: {
            userId_roleId_scope_scopeId: {
              userId: user.id,
              roleId: role.id,
              scope: role.scope,
              scopeId: '',
            },
          },
          create: {
            userId: user.id,
            roleId: role.id,
            scope: role.scope,
            scopeId: '',
          },
          update: {
            endsAt: null,
          },
        }),
      ]);

      const before = this.employeeState(employee);
      const after = this.employeeState(updated);

      await this.createWorkforceAction(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: WorkforceActionType.PROFILE_CHANGE,
        effectiveDate: new Date(),
        reason: 'Employee account linked.',
        previousState: before,
        proposedState: after,
        finalState: after,
        note: `Linked ${user.email} as ${role.code}.`,
        metadata: {
          accountLink: {
            userId: user.id,
            email: user.email,
            roleCode: role.code,
          },
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeAccount', updated.id, before, {
        ...after,
        linkedUserId: user.id,
        linkedUserEmail: user.email,
        roleCode: role.code,
      });

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: 'Employee account linked',
        description: `${updated.employeeNumber} can now access employee self service.`,
        data: {
          userId: user.id,
          email: user.email,
          roleCode: role.code,
        },
      });

      await this.enqueueOutbox(tx, tenantId, 'employee.account.linked', updated.id, {
        employeeId: updated.id,
        employeeNumber: updated.employeeNumber,
        userId: user.id,
        email: user.email,
        roleCode: role.code,
      });

      const invitation = user.passwordHash
        ? null
        : await this.createEmployeeAccountInvitation(tx, {
            actor,
            tenantId,
            email: user.email,
            userId: user.id,
            employeeId: updated.id,
            personId: updated.personId,
            roleId: role.id,
          });

      return {
        employee: updated,
        tenant,
        user,
        invitation,
      };
    });

    if (result.invitation) {
      await this.sendEmployeeAccessInvitationEmail({
        tenantId,
        tenantName: result.tenant.name,
        tenantSlug: result.tenant.slug,
        employee: result.employee,
        user: result.user,
        invitationToken: result.invitation.token,
        invitationExpiresAt: result.invitation.expiresAt,
      });
    }

    return result.employee;
  }

  async resendEmployeeAccountInvitation(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);

    const result = await this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);

      if (!employee.user) {
        throw new BadRequestException('This employee is not linked to a login account yet.');
      }

      const account = await tx.user.findFirst({
        where: { id: employee.user.id, tenantId },
        select: {
          id: true,
          email: true,
          username: true,
          status: true,
          passwordHash: true,
        },
      });

      if (!account) {
        throw new BadRequestException('Linked user account is not available.');
      }

      if (account.status === UserStatus.ARCHIVED) {
        throw new BadRequestException('Archived user accounts cannot receive setup invitations.');
      }

      if (account.passwordHash) {
        throw new BadRequestException('This account has already completed setup. Use password reset instead.');
      }

      const role = await tx.role.findFirst({
        where: {
          tenantId,
          code: 'EMPLOYEE',
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });

      if (!role) {
        throw new BadRequestException('Employee role is not available for this tenant.');
      }

      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, slug: true },
      });

      if (!tenant) {
        throw new BadRequestException('Tenant is not available.');
      }

      const invitation = await this.createEmployeeAccountInvitation(tx, {
        actor,
        tenantId,
        email: account.email,
        userId: account.id,
        employeeId: employee.id,
        personId: employee.personId,
        roleId: role.id,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.INVITE,
        'EmployeeAccountInvitation',
        invitation.id,
        null,
        this.toJsonObject({
          employeeId: employee.id,
          userId: account.id,
          email: account.email,
          resent: true,
          expiresAt: invitation.expiresAt,
        }),
      );

      return { employee, tenant, account, invitation };
    });

    await this.sendEmployeeAccessInvitationEmail({
      tenantId,
      tenantName: result.tenant.name,
      tenantSlug: result.tenant.slug,
      employee: result.employee,
      user: {
        id: result.account.id,
        email: result.account.email,
        username: result.account.username,
      },
      invitationToken: result.invitation.token,
      invitationExpiresAt: result.invitation.expiresAt,
    });

    return {
      employeeId: result.employee.id,
      email: result.account.email,
      invitationId: result.invitation.id,
      expiresAt: result.invitation.expiresAt,
      sent: true,
    };
  }

  async listLeadershipPool(actor: AuthenticatedPrincipal, query: ListLeadershipPoolQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const activeOn = this.toDate(query.activeOn) ?? new Date();
    const designationWhere: Prisma.EmployeeLeadershipDesignationWhereInput = {
      tenantId,
      role: query.role,
      organizationNodeId: query.organizationNodeId,
      isActive: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: activeOn } },
      ],
      AND: [
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: activeOn } },
          ],
        },
      ],
    };

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        id: query.excludeEmployeeId ? { not: query.excludeEmployeeId } : undefined,
        deletedAt: null,
        status: { in: [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION] },
        leadershipDesignations: {
          some: designationWhere,
        },
        OR: query.search
          ? [
              { employeeNumber: { contains: query.search, mode: 'insensitive' } },
              { person: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { person: { middleName: { contains: query.search, mode: 'insensitive' } } },
              { person: { lastName: { contains: query.search, mode: 'insensitive' } } },
              { person: { preferredName: { contains: query.search, mode: 'insensitive' } } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      take: limit,
      orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
      include: {
        ...this.employeeListInclude,
        leadershipDesignations: {
          where: designationWhere,
          include: {
            organizationNode: true,
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
        },
      },
    });

    return {
      data: employees,
      page: {
        limit,
        total: employees.length,
        nextCursor: null,
      },
    };
  }

  async createLeadershipDesignation(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: CreateLeadershipDesignationDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      await this.validateLeadershipDesignationInput(tx, tenantId, employee, dto);

      const designation = await tx.employeeLeadershipDesignation.create({
        data: {
          tenantId,
          employeeId,
          role: dto.role,
          organizationNodeId: dto.organizationNodeId,
          startsAt: this.toDate(dto.startsAt),
          endsAt: this.toDate(dto.endsAt),
          isActive: dto.isActive ?? true,
          reason: dto.reason,
          metadata: this.toJson(dto.metadata),
        },
        include: {
          organizationNode: true,
        },
      });

      await this.writeLeadershipDesignationEffects(tx, actor, tenantId, employee, {
        action: AuditAction.CREATE,
        before: null,
        after: designation,
        title: 'Leadership eligibility added',
        description: `${employee.employeeNumber} is eligible for ${this.humanizeLeadershipRole(designation.role)} assignment.`,
        eventType: 'employee.leadership-designation.created',
      });

      return designation;
    });
  }

  async updateLeadershipDesignation(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    designationId: string,
    dto: UpdateLeadershipDesignationDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await tx.employeeLeadershipDesignation.findFirst({
        where: { id: designationId, tenantId, employeeId },
        include: { organizationNode: true },
      });

      if (!existing) {
        throw new NotFoundException('Leadership designation not found.');
      }

      await this.validateLeadershipDesignationInput(tx, tenantId, employee, {
        role: existing.role,
        organizationNodeId: dto.organizationNodeId ?? existing.organizationNodeId ?? undefined,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        isActive: dto.isActive,
        reason: dto.reason,
        metadata: dto.metadata,
      });

      const updated = await tx.employeeLeadershipDesignation.update({
        where: { id: designationId },
        data: {
          organizationNodeId: dto.organizationNodeId,
          startsAt: dto.startsAt !== undefined ? this.toDate(dto.startsAt) ?? null : undefined,
          endsAt: dto.endsAt !== undefined ? this.toDate(dto.endsAt) ?? null : undefined,
          isActive: dto.isActive,
          reason: dto.reason,
          metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
        },
        include: { organizationNode: true },
      });

      await this.writeLeadershipDesignationEffects(tx, actor, tenantId, employee, {
        action: AuditAction.UPDATE,
        before: existing,
        after: updated,
        title: updated.isActive ? 'Leadership eligibility updated' : 'Leadership eligibility removed',
        description: `${employee.employeeNumber} ${updated.isActive ? 'remains eligible' : 'is no longer eligible'} for ${this.humanizeLeadershipRole(updated.role)} assignment.`,
        eventType: 'employee.leadership-designation.updated',
      });

      return updated;
    });
  }

  async listWorkforceActions(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId, true);

    return this.prisma.workforceAction.findMany({
      where: { tenantId, employeeId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        initiatedBy: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
        history: {
          orderBy: { createdAt: 'asc' },
          include: {
            actorUser: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
          },
        },
      },
    });
  }

  async listTimeline(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findVisibleEmployeeOrThrow(actor, tenantId, employeeId, true);

    return this.prisma.timelineEvent.findMany({
      where: { tenantId, employeeId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });
  }

  async getSummary(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const visibility = await this.employeeVisibilityWhere(actor, tenantId);
    const where: Prisma.EmployeeWhereInput = this.withEmployeeVisibility(
      { tenantId, deletedAt: null },
      visibility,
    );

    const [total, statusGroups, employmentTypeGroups, recentHires, recentSeparations] =
      await Promise.all([
        this.prisma.employee.count({ where }),
        this.prisma.employee.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.employee.groupBy({
          by: ['employmentType'],
          where,
          _count: { _all: true },
        }),
        this.prisma.employee.count({
          where: {
            ...where,
            hireDate: {
              gte: this.daysAgo(30),
            },
          },
        }),
        this.prisma.employee.count({
          where: {
            ...where,
            status: {
              in: [EmployeeStatus.SEPARATED, EmployeeStatus.RETIRED],
            },
            endDate: {
              gte: this.daysAgo(30),
            },
          },
        }),
      ]);

    const byStatus = Object.fromEntries(
      statusGroups.map((item) => [item.status, item._count._all]),
    ) as Partial<Record<EmployeeStatus, number>>;

    const activeWorkforce =
      (byStatus.ACTIVE ?? 0) + (byStatus.PROBATION ?? 0) + (byStatus.SUSPENDED ?? 0);

    return {
      total,
      activeWorkforce,
      recentHires,
      recentSeparations,
      byStatus,
      byEmploymentType: Object.fromEntries(
        employmentTypeGroups.map((item) => [item.employmentType, item._count._all]),
      ),
    };
  }

  private async transitionEmployee(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    options: TransitionOptions,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findEmployeeOrThrow(
        tx,
        tenantId,
        employeeId,
        options.includeDeleted ?? false,
      );

      this.assertLifecycleTransitionAllowed(existing.status, options);

      const before = this.employeeState(existing);
      const proposedState: Prisma.InputJsonObject = {
        ...before,
        ...this.toJsonObject(options.data),
        status: options.targetStatus,
      };
      const updated = await tx.employee.update({
        where: { id: existing.id },
        data: {
          ...options.data,
          status: options.targetStatus,
        },
        include: this.employeeInclude,
      });
      const after = this.employeeState(updated);

      await this.createWorkforceAction(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: options.type,
        effectiveDate: this.effectiveDate(options.dto),
        reason: options.dto.reason,
        previousState: before,
        proposedState,
        finalState: after,
        note: options.dto.note ?? options.eventTitle,
        metadata: options.dto.metadata,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        options.auditAction,
        'Employee',
        updated.id,
        before,
        after,
      );

      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: updated.id,
        type: options.eventType,
        title: options.eventTitle,
        description: `${updated.employeeNumber} moved from ${existing.status} to ${updated.status}.`,
        data: {
          before,
          after,
          reason: options.dto.reason,
        },
      });

      await this.enqueueOutbox(tx, tenantId, options.outboxEvent, updated.id, {
        employeeId: updated.id,
        employeeNumber: updated.employeeNumber,
        previousStatus: existing.status,
        status: updated.status,
      });

      return updated;
    });
  }

  private async findEmployeeOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    employeeId: string,
    includeDeleted = false,
  ) {
    const employee = await client.employee.findFirst({
      where: {
        id: employeeId,
        tenantId,
        deletedAt: includeDeleted ? undefined : null,
      },
      include: this.employeeInclude,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    return employee;
  }

  private async findVisibleEmployeeOrThrow(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    includeDeleted = false,
  ) {
    const visibility = await this.employeeVisibilityWhere(actor, tenantId);
    const employee = await this.prisma.employee.findFirst({
      where: this.withEmployeeVisibility(
        {
          id: employeeId,
          tenantId,
          deletedAt: includeDeleted ? undefined : null,
        },
        visibility,
      ),
      include: this.employeeInclude,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    return employee;
  }

  private async findSelfEmployeeOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    actor: AuthenticatedPrincipal,
  ) {
    const employee = await client.employee.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        OR: this.selfEmployeeWhere(actor),
      },
      include: this.employeeInclude,
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not linked.');
    }

    return employee;
  }

  private async findLifecycleTemplateOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    templateId: string,
    tenantOwnedOnly = false,
  ) {
    const template = await client.employeeLifecycleTemplate.findFirst({
      where: {
        id: templateId,
        deletedAt: null,
        OR: tenantOwnedOnly ? [{ tenantId }] : [{ tenantId }, { tenantId: null }],
      },
      include: this.lifecycleTemplateInclude,
    });

    if (!template) {
      throw new NotFoundException('Lifecycle template not found.');
    }

    return template;
  }

  private async findLifecycleTemplateTaskOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    taskId: string,
  ) {
    const task = await client.employeeLifecycleTemplateTask.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
        template: {
          deletedAt: null,
          OR: [{ tenantId }, { tenantId: null }],
        },
      },
      include: this.lifecycleTemplateTaskInclude,
    });

    if (!task) {
      throw new NotFoundException('Lifecycle template task not found.');
    }

    if (task.template.tenantId !== tenantId) {
      throw new ForbiddenException('Global lifecycle template tasks cannot be edited from a tenant workspace.');
    }

    return task;
  }

  private async assertDocumentTypeReadable(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    documentTypeId?: string,
  ) {
    if (!documentTypeId) return null;

    const documentType = await client.documentType.findFirst({
      where: {
        id: documentTypeId,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!documentType) {
      throw new BadRequestException('Document type was not found in this tenant.');
    }

    return documentType;
  }

  private async findLifecyclePlanOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    planId: string,
  ) {
    const plan = await tx.employeeLifecyclePlan.findFirst({
      where: { id: planId, tenantId, employeeId },
      include: this.lifecyclePlanInclude,
    });

    if (!plan) {
      throw new NotFoundException('Lifecycle plan not found.');
    }

    return plan;
  }

  private async findLifecycleTaskOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    taskId: string,
  ) {
    const task = await tx.employeeLifecycleTask.findFirst({
      where: { id: taskId, tenantId, employeeId },
      include: this.lifecycleTaskInclude,
    });

    if (!task) {
      throw new NotFoundException('Lifecycle task not found.');
    }

    return task;
  }

  private async lifecycleTaskAssignment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employee: { id: string; userId?: string | null },
    dto: {
      ownerType?: EmployeeLifecycleTaskOwnerType;
      assignedUserId?: string;
      assignedEmployeeId?: string;
    },
  ) {
    let assignedUserId = dto.assignedUserId;
    let assignedEmployeeId = dto.assignedEmployeeId;

    if (dto.ownerType === EmployeeLifecycleTaskOwnerType.EMPLOYEE) {
      assignedEmployeeId = assignedEmployeeId ?? employee.id;
      assignedUserId = assignedUserId ?? employee.userId ?? undefined;
    }

    if (assignedUserId) {
      const user = await tx.user.findFirst({
        where: { id: assignedUserId, tenantId, deletedAt: null },
        select: { id: true },
      });

      if (!user) {
        throw new BadRequestException('Assigned user was not found in this tenant.');
      }
    }

    if (assignedEmployeeId) {
      const assignedEmployee = await tx.employee.findFirst({
        where: { id: assignedEmployeeId, tenantId, deletedAt: null },
        select: { id: true },
      });

      if (!assignedEmployee) {
        throw new BadRequestException('Assigned employee was not found in this tenant.');
      }
    }

    return { assignedUserId, assignedEmployeeId };
  }

  private async completeLifecycleTaskForEmployee(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employee: { id: string; employeeNumber: string },
    taskId: string,
    dto: CompleteEmployeeLifecycleTaskDto,
    selfService: boolean,
  ) {
    const existing = await this.findLifecycleTaskOrThrow(tx, tenantId, employee.id, taskId);

    if (selfService) {
      const canComplete =
        existing.ownerType === EmployeeLifecycleTaskOwnerType.EMPLOYEE ||
        existing.assignedUserId === actor.id ||
        existing.assignedEmployeeId === employee.id;

      if (!canComplete) {
        throw new ForbiddenException('This lifecycle task is not assigned to your profile.');
      }
    }

    if (this.lifecycleTaskIsTerminal(existing.status)) {
      throw new BadRequestException('Completed, waived, or cancelled lifecycle tasks cannot be completed again.');
    }

    const before = this.toJsonObject(existing);
    const task = await tx.employeeLifecycleTask.update({
      where: { id: existing.id },
      data: {
        status: EmployeeLifecycleTaskStatus.COMPLETED,
        completedAt: new Date(),
        completedById: actor.id,
        blockedReason: null,
        evidence: this.toJson({
          ...this.jsonRecord(existing.evidence),
          ...this.jsonRecord(dto.evidence),
          note: dto.note,
        }),
      },
      include: this.lifecycleTaskInclude,
    });

    await this.refreshLifecyclePlanStatus(tx, tenantId, task.planId, actor.id);
    await this.writeLifecycleTaskMutation(tx, actor, tenantId, employee, task, before, 'completed');

    return task;
  }

  private async refreshLifecyclePlanStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    planId: string,
    actorUserId: string,
  ) {
    const plan = await tx.employeeLifecyclePlan.findFirst({
      where: { id: planId, tenantId },
      include: {
        tasks: {
          select: { status: true },
        },
      },
    });

    if (!plan || !plan.tasks.length) return;
    if (plan.status === EmployeeLifecyclePlanStatus.CANCELLED || plan.status === EmployeeLifecyclePlanStatus.ARCHIVED) return;

    const completeStatuses = new Set<EmployeeLifecycleTaskStatus>([
      EmployeeLifecycleTaskStatus.COMPLETED,
      EmployeeLifecycleTaskStatus.WAIVED,
      EmployeeLifecycleTaskStatus.CANCELLED,
    ]);
    const allComplete = plan.tasks.every((task) => completeStatuses.has(task.status));

    if (allComplete && plan.status !== EmployeeLifecyclePlanStatus.COMPLETED) {
      await tx.employeeLifecyclePlan.update({
        where: { id: plan.id },
        data: {
          status: EmployeeLifecyclePlanStatus.COMPLETED,
          completedAt: new Date(),
          updatedById: actorUserId,
        },
      });
      return;
    }

    if (!allComplete && plan.status === EmployeeLifecyclePlanStatus.COMPLETED) {
      await tx.employeeLifecyclePlan.update({
        where: { id: plan.id },
        data: {
          status: EmployeeLifecyclePlanStatus.ACTIVE,
          completedAt: null,
          updatedById: actorUserId,
        },
      });
    }
  }

  private lifecycleTaskIsTerminal(status: EmployeeLifecycleTaskStatus) {
    return new Set<EmployeeLifecycleTaskStatus>([
      EmployeeLifecycleTaskStatus.COMPLETED,
      EmployeeLifecycleTaskStatus.WAIVED,
      EmployeeLifecycleTaskStatus.CANCELLED,
    ]).has(status);
  }

  private clearanceIsTerminal(status: EmployeeClearanceStatus) {
    return new Set<EmployeeClearanceStatus>([
      EmployeeClearanceStatus.CLEARED,
      EmployeeClearanceStatus.WAIVED,
      EmployeeClearanceStatus.CANCELLED,
    ]).has(status);
  }

  private defaultExitClearanceChecklist(dto: StartEmployeeOffboardingDto): CreateEmployeeClearanceItemDto[] {
    const dueAt = dto.lastWorkingDate ?? dto.separationDate;

    return [
      {
        type: EmployeeClearanceType.ACCESS,
        title: 'Deactivate systems access',
        description: 'Review application access, remove privileges, and confirm the access cutoff window.',
        systemName: 'Identity and access management',
        dueAt: dto.accessCutoffAt ?? dueAt,
      },
      {
        type: EmployeeClearanceType.ASSET,
        title: 'Recover assigned assets',
        description: 'Collect company equipment, physical access cards, and assigned workspace assets.',
        dueAt,
      },
      {
        type: EmployeeClearanceType.DOCUMENT,
        title: 'Collect final employment documents',
        description: 'Collect final signed letters, acknowledgements, handover files, and required compliance evidence.',
        dueAt,
      },
      {
        type: EmployeeClearanceType.FINANCE,
        title: 'Complete final finance clearance',
        description: 'Review final payouts, advances, deductions, reimbursement status, and benefits handoff.',
        dueAt,
      },
      {
        type: EmployeeClearanceType.KNOWLEDGE_TRANSFER,
        title: 'Confirm knowledge transfer',
        description: 'Confirm handover notes, open work, passwords held in approved vaults, and stakeholder transition notes.',
        dueAt,
      },
    ];
  }

  private async createClearanceItemInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    exitRecordId: string,
    dto: CreateEmployeeClearanceItemDto,
  ) {
    await this.assertClearanceOwners(tx, tenantId, dto.ownerUserId, dto.ownerEmployeeId);

    return tx.employeeClearanceItem.create({
      data: {
        tenantId,
        employeeId,
        exitRecordId,
        type: dto.type,
        title: this.requiredString(dto.title, 'clearanceItem.title'),
        description: this.nullableString(dto.description),
        ownerUserId: this.nullableString(dto.ownerUserId),
        ownerEmployeeId: this.nullableString(dto.ownerEmployeeId),
        assetTag: this.nullableString(dto.assetTag),
        systemName: this.nullableString(dto.systemName),
        dueAt: this.toDate(dto.dueAt),
        metadata: this.toJson(dto.metadata),
      },
      include: this.clearanceItemInclude,
    });
  }

  private async assertClearanceOwners(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ownerUserId?: string,
    ownerEmployeeId?: string,
  ) {
    if (ownerUserId) {
      const user = await tx.user.findFirst({
        where: { id: ownerUserId, tenantId, deletedAt: null },
        select: { id: true },
      });

      if (!user) {
        throw new BadRequestException('Clearance owner user was not found in this tenant.');
      }
    }

    if (ownerEmployeeId) {
      const employee = await tx.employee.findFirst({
        where: { id: ownerEmployeeId, tenantId, deletedAt: null },
        select: { id: true },
      });

      if (!employee) {
        throw new BadRequestException('Clearance owner employee was not found in this tenant.');
      }
    }
  }

  private async findExitRecordOrThrow(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    employeeId: string,
    exitRecordId: string,
  ) {
    const exitRecord = await tx.employeeExitRecord.findFirst({
      where: { id: exitRecordId, tenantId, employeeId, deletedAt: null },
      include: this.exitRecordInclude,
    });

    if (!exitRecord) {
      throw new NotFoundException('Offboarding case not found.');
    }

    return exitRecord;
  }

  private async findClearanceItemOrThrow(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    employeeId: string,
    clearanceItemId: string,
  ) {
    const item = await tx.employeeClearanceItem.findFirst({
      where: { id: clearanceItemId, tenantId, employeeId, deletedAt: null },
      include: this.clearanceItemInclude,
    });

    if (!item) {
      throw new NotFoundException('Clearance item not found.');
    }

    return item;
  }

  private async refreshExitRecordClearanceStatuses(
    tx: Prisma.TransactionClient,
    tenantId: string,
    exitRecordId: string,
  ) {
    const exitRecord = await tx.employeeExitRecord.findFirstOrThrow({
      where: { id: exitRecordId, tenantId },
      include: {
        clearanceItems: {
          where: { deletedAt: null },
        },
      },
    });
    const statusData = this.exitRecordAggregateStatusData(exitRecord.clearanceItems);
    const allComplete =
      exitRecord.clearanceItems.length > 0 &&
      exitRecord.clearanceItems.every((item) => this.clearanceIsTerminal(item.status));

    return tx.employeeExitRecord.update({
      where: { id: exitRecord.id },
      data: {
        ...statusData,
        status:
          allComplete && exitRecord.status === EmployeeExitRecordStatus.ACTIVE
            ? EmployeeExitRecordStatus.READY_FOR_SEPARATION
            : undefined,
      },
      include: this.exitRecordInclude,
    });
  }

  private exitRecordAggregateStatusData(
    clearanceItems: Array<{ type: EmployeeClearanceType; status: EmployeeClearanceStatus }>,
  ) {
    return {
      accessClearanceStatus: this.aggregateClearanceStatus(clearanceItems, [EmployeeClearanceType.ACCESS]),
      assetClearanceStatus: this.aggregateClearanceStatus(clearanceItems, [
        EmployeeClearanceType.ASSET,
        EmployeeClearanceType.FACILITIES,
      ]),
      finalDocumentCollectionStatus: this.aggregateClearanceStatus(clearanceItems, [
        EmployeeClearanceType.DOCUMENT,
        EmployeeClearanceType.FINANCE,
        EmployeeClearanceType.BENEFITS,
      ]),
    };
  }

  private aggregateClearanceStatus(
    items: Array<{ type: EmployeeClearanceType; status: EmployeeClearanceStatus }>,
    types: EmployeeClearanceType[],
  ) {
    const scoped = items.filter((item) => types.includes(item.type));

    if (!scoped.length) return EmployeeClearanceStatus.OPEN;
    if (scoped.some((item) => item.status === EmployeeClearanceStatus.BLOCKED)) return EmployeeClearanceStatus.BLOCKED;
    if (scoped.some((item) => item.status === EmployeeClearanceStatus.IN_PROGRESS)) return EmployeeClearanceStatus.IN_PROGRESS;
    if (scoped.every((item) => item.status === EmployeeClearanceStatus.CLEARED)) return EmployeeClearanceStatus.CLEARED;
    if (scoped.every((item) => this.clearanceIsTerminal(item.status))) return EmployeeClearanceStatus.WAIVED;

    return EmployeeClearanceStatus.OPEN;
  }

  private canViewSensitiveEmployeeData(actor: AuthenticatedPrincipal) {
    return actor.type === 'PLATFORM_ADMIN' || this.hasAnyRole(actor, TENANT_WIDE_WORKFORCE_ROLES);
  }

  private maskName(value?: string | null) {
    const trimmed = value?.trim() ?? '';

    if (!trimmed) return null;

    return `${trimmed.slice(0, 1)}${'•'.repeat(Math.max(3, Math.min(10, trimmed.length - 1)))}`;
  }

  private async writeLifecycleTaskMutation(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employee: { id: string; employeeNumber: string },
    task: { id: string; planId: string; title: string; status: EmployeeLifecycleTaskStatus },
    before: Prisma.InputJsonValue,
    action: string,
  ) {
    const after = this.toJsonObject(task);
    await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeLifecycleTask', task.id, before, after);

    await this.createTimelineEvent(tx, {
      actor,
      tenantId,
      employeeId: employee.id,
      type: TimelineEventType.EMPLOYEE_UPDATED,
      title: `Lifecycle task ${action}`,
      description: `${task.title} was ${action} for ${employee.employeeNumber}.`,
      data: after,
    });

    await this.enqueueOutbox(tx, tenantId, `employee.lifecycle_task.${action}`, employee.id, {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      planId: task.planId,
      taskId: task.id,
      status: task.status,
    });
  }

  private async findPersonForEmploymentOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    personId: string,
  ) {
    const person = await tx.person.findFirst({
      where: {
        id: personId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!person) {
      throw new BadRequestException('Person reference is invalid for this tenant.');
    }

    return person;
  }

  private async validateUserReference(
    tx: Prisma.TransactionClient,
    tenantId: string,
    personUserId?: string | null,
    userId?: string | null,
    currentEmployeeId?: string,
  ) {
    if (!userId) {
      return;
    }

    if (personUserId && personUserId !== userId) {
      throw new BadRequestException('User reference does not match the person profile user.');
    }

    const [user, existingEmployee] = await Promise.all([
      tx.user.findFirst({
        where: {
          id: userId,
          tenantId,
          deletedAt: null,
        },
        select: { id: true },
      }),
      tx.employee.findFirst({
        where: {
          userId,
          tenantId,
          id: currentEmployeeId ? { not: currentEmployeeId } : undefined,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);

    if (!user) {
      throw new BadRequestException('User reference is invalid for this tenant.');
    }

    if (existingEmployee) {
      throw new BadRequestException('User is already linked to an employee record.');
    }
  }

  private async resolveEmployeeAccountUser(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: LinkEmployeeAccountDto,
  ) {
    if (dto.userId) {
      const user = await tx.user.findFirst({
        where: {
          id: dto.userId,
          tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          username: true,
          status: true,
          passwordHash: true,
          type: true,
          authProvider: true,
          emailVerifiedAt: true,
        },
      });

      if (!user) {
        throw new BadRequestException('User account is invalid for this tenant.');
      }

      await this.ensureAccountIdentityMembership(tx, tenantId, user);
      return user;
    }

    if (!dto.email) {
      throw new BadRequestException('Provide an existing user ID or an email address.');
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await tx.user.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email,
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        passwordHash: true,
        type: true,
        authProvider: true,
        emailVerifiedAt: true,
      },
    });

    if (existing) {
      await this.ensureAccountIdentityMembership(tx, tenantId, existing);
      return existing;
    }

    const hasPassword = Boolean(dto.temporaryPassword?.trim());
    const passwordHash = hasPassword
      ? await this.passwordService.hash(dto.temporaryPassword!.trim())
      : null;

    const user = await tx.user.create({
      data: {
        tenantId,
        email,
        username: dto.username?.trim() || email.split('@')[0],
        passwordHash,
        type: UserType.TENANT_USER,
        status: hasPassword ? UserStatus.ACTIVE : UserStatus.INVITED,
        authProvider: AuthProvider.LOCAL,
        emailVerifiedAt: hasPassword ? new Date() : null,
        metadata: {
          provisionedFrom: 'employee-account-link',
          requirePasswordReset: dto.requirePasswordReset ?? hasPassword,
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        passwordHash: true,
        type: true,
        authProvider: true,
        emailVerifiedAt: true,
      },
    });

    await this.ensureAccountIdentityMembership(tx, tenantId, user);
    return user;
  }

  private async ensureAccountIdentityMembership(
    tx: Prisma.TransactionClient,
    tenantId: string,
    user: {
      id: string;
      email: string;
      passwordHash: string | null;
      status: UserStatus;
      type: UserType;
      authProvider: AuthProvider;
      emailVerifiedAt: Date | null;
    },
  ) {
    const normalizedEmail = user.email.trim().toLowerCase();
    const identity = await tx.identity.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        passwordHash: user.passwordHash,
        status: user.status,
        authProvider: user.authProvider,
        emailVerifiedAt: user.emailVerifiedAt,
        metadata: {
          createdFromEmployeeAccountUserId: user.id,
        },
      },
      update: {
        passwordHash: user.passwordHash ?? undefined,
        status: user.status === UserStatus.ACTIVE ? UserStatus.ACTIVE : undefined,
        authProvider: user.authProvider,
        emailVerifiedAt: user.emailVerifiedAt ?? undefined,
        deletedAt: null,
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { identityId: identity.id },
    });

    await tx.tenantMembership.upsert({
      where: { userId: user.id },
      create: {
        identityId: identity.id,
        tenantId,
        userId: user.id,
        type: user.type,
        status: user.status,
        isDefault: false,
        metadata: {
          createdFromEmployeeAccount: true,
        },
      },
      update: {
        identityId: identity.id,
        tenantId,
        type: user.type,
        status: user.status,
        deletedAt: null,
      },
    });
  }

  private async createEmployeeAccountInvitation(
    tx: Prisma.TransactionClient,
    input: {
      actor: AuthenticatedPrincipal;
      tenantId: string;
      email: string;
      userId: string;
      employeeId: string;
      personId: string;
      roleId: string;
    },
  ) {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await tx.invitation.updateMany({
      where: {
        tenantId: input.tenantId,
        email: input.email,
        status: InvitationStatus.PENDING,
      },
      data: {
        status: InvitationStatus.REVOKED,
      },
    });

    const invitation = await tx.invitation.create({
      data: {
        tenantId: input.tenantId,
        email: input.email,
        tokenHash: this.hashInvitationToken(token),
        status: InvitationStatus.PENDING,
        invitedById: input.actor.id,
        expiresAt,
        metadata: {
          purpose: 'employee-self-service',
          userId: input.userId,
          employeeId: input.employeeId,
          personId: input.personId,
        },
        roles: {
          create: {
            roleId: input.roleId,
          },
        },
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    return {
      id: invitation.id,
      token,
      expiresAt: invitation.expiresAt,
    };
  }

  private async validateLeadershipDesignationInput(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employee: { id: string; employeeNumber: string; status: EmployeeStatus },
    dto: {
      role: WorkforceLeadershipRole;
      organizationNodeId?: string | null;
      startsAt?: string;
      endsAt?: string;
      isActive?: boolean;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const leadershipEligibleStatuses: EmployeeStatus[] = [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION];

    if (!leadershipEligibleStatuses.includes(employee.status)) {
      throw new BadRequestException(
        `Only active or probation employees can be designated for leadership assignment. ${employee.employeeNumber} is ${employee.status}.`,
      );
    }

    const startsAt = this.toDate(dto.startsAt);
    const endsAt = this.toDate(dto.endsAt);

    if (startsAt && Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('startsAt is not a valid date.');
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('endsAt is not a valid date.');
    }

    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }

    if (dto.organizationNodeId) {
      const node = await tx.organizationNode.findFirst({
        where: {
          id: dto.organizationNodeId,
          tenantId,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });

      if (!node) {
        throw new BadRequestException('Organization node reference is invalid.');
      }
    }
  }

  private async writeLeadershipDesignationEffects(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employee: { id: string; employeeNumber: string },
    input: {
      action: AuditAction;
      before: LeadershipDesignationStateSource | null;
      after: LeadershipDesignationStateSource;
      title: string;
      description: string;
      eventType: string;
    },
  ) {
    const before = input.before ? this.leadershipDesignationState(input.before) : null;
    const after = this.leadershipDesignationState(input.after);

    await this.writeAudit(
      tx,
      actor,
      tenantId,
      input.action,
      'EmployeeLeadershipDesignation',
      input.after.id,
      before,
      after,
    );

    await this.createTimelineEvent(tx, {
      actor,
      tenantId,
      employeeId: employee.id,
      type: TimelineEventType.EMPLOYEE_UPDATED,
      title: input.title,
      description: input.description,
      data: after,
    });

    await this.enqueueOutbox(tx, tenantId, input.eventType, employee.id, {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      designation: after,
    });
  }

  private leadershipDesignationState(
    designation: LeadershipDesignationStateSource,
  ): Prisma.InputJsonObject {
    return {
      id: designation.id,
      employeeId: designation.employeeId,
      role: designation.role,
      organizationNodeId: designation.organizationNodeId,
      organizationNode: designation.organizationNode
        ? {
            id: designation.organizationNode.id,
            code: designation.organizationNode.code,
            name: designation.organizationNode.name,
          }
        : null,
      startsAt: designation.startsAt?.toISOString() ?? null,
      endsAt: designation.endsAt?.toISOString() ?? null,
      isActive: designation.isActive,
      reason: designation.reason,
      metadata: this.toJsonObject(designation.metadata),
    };
  }

  private humanizeLeadershipRole(role: WorkforceLeadershipRole) {
    return role
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async findEmploymentTermOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    termId: string,
  ) {
    const term = await tx.employeeEmploymentTerm.findFirst({
      where: { id: termId, tenantId, employeeId, deletedAt: null },
      include: this.employmentTermInclude,
    });

    if (!term) {
      throw new NotFoundException('Employment terms record not found.');
    }

    return term;
  }

  private async findCompensationComponentOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    componentId: string,
  ) {
    const component = await tx.employeeCompensationComponent.findFirst({
      where: { id: componentId, tenantId, employeeId, deletedAt: null },
      include: this.compensationComponentInclude,
    });

    if (!component) {
      throw new NotFoundException('Compensation component not found.');
    }

    return component;
  }

  private async findCompensationChangeOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    changeId: string,
  ) {
    const change = await tx.employeeCompensationChange.findFirst({
      where: { id: changeId, tenantId, employeeId },
      include: this.compensationChangeInclude,
    });

    if (!change) {
      throw new NotFoundException('Compensation change not found.');
    }

    return change;
  }

  private async findReportingRelationshipOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    relationshipId: string,
  ) {
    const relationship = await tx.employeeReportingRelationship.findFirst({
      where: { id: relationshipId, tenantId, employeeId, deletedAt: null },
      include: this.reportingRelationshipInclude,
    });

    if (!relationship) {
      throw new NotFoundException('Reporting relationship not found.');
    }

    return relationship;
  }

  private async validateEmploymentTermReferences(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeeEmploymentTermDto,
  ) {
    await Promise.all([
      dto.gradeId ? this.assertTenantRecord(tx, 'positionGrade', tenantId, dto.gradeId, 'Grade reference is invalid.') : undefined,
      dto.levelId ? this.assertTenantRecord(tx, 'positionLevel', tenantId, dto.levelId, 'Level reference is invalid.') : undefined,
      dto.positionId ? this.assertTenantRecord(tx, 'position', tenantId, dto.positionId, 'Position reference is invalid.') : undefined,
      dto.organizationNodeId ? this.assertTenantRecord(tx, 'organizationNode', tenantId, dto.organizationNodeId, 'Organization reference is invalid.') : undefined,
      dto.costCenterId ? this.assertTenantRecord(tx, 'costCenter', tenantId, dto.costCenterId, 'Cost center reference is invalid.') : undefined,
      dto.documentId ? this.assertEmployeeDocumentExists(tx, tenantId, employeeId, dto.documentId) : undefined,
      dto.workflowRequestId ? this.assertApprovalRequestExists(tx, tenantId, dto.workflowRequestId) : undefined,
    ]);
  }

  private async validateCompensationComponentReferences(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeeCompensationComponentDto,
  ) {
    if (dto.termId) {
      await this.findEmploymentTermOrThrow(tx, tenantId, employeeId, dto.termId);
    }
  }

  private async validateCompensationChangeReferences(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    dto: CreateEmployeeCompensationChangeDto,
  ) {
    await Promise.all([
      dto.termId ? this.findEmploymentTermOrThrow(tx, tenantId, employeeId, dto.termId) : undefined,
      dto.workflowRequestId ? this.assertApprovalRequestExists(tx, tenantId, dto.workflowRequestId) : undefined,
    ]);
  }

  private async validateReportingRelationship(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    dto: CreateEmployeeReportingRelationshipDto,
    startsAt: Date,
    existing?: { relatedEmployeeId: string; type: ReportingRelationshipType },
  ) {
    const relatedEmployeeId = dto.relatedEmployeeId ?? existing?.relatedEmployeeId;
    const type = dto.type ?? existing?.type ?? ReportingRelationshipType.DOTTED_LINE;

    if (!relatedEmployeeId) {
      throw new BadRequestException('relatedEmployeeId is required.');
    }

    if (relatedEmployeeId === employeeId) {
      throw new BadRequestException('An employee cannot report to themselves.');
    }

    const relatedEmployee = await tx.employee.findFirst({
      where: {
        id: relatedEmployeeId,
        tenantId,
        deletedAt: null,
        status: { in: [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION] },
      },
      select: {
        id: true,
        leadershipDesignations: {
          where: {
            isActive: true,
            OR: [{ startsAt: null }, { startsAt: { lte: startsAt } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: startsAt } }] }],
          },
          select: { role: true },
        },
      },
    });

    if (!relatedEmployee) {
      throw new BadRequestException('Related employee must be active or on probation.');
    }

    const acceptedRoles = this.reportingLeadershipRoles(type);
    if (acceptedRoles.length > 0) {
      const roles = new Set(relatedEmployee.leadershipDesignations.map((designation) => designation.role));
      const allowed = acceptedRoles.some((role) => roles.has(role));

      if (!allowed) {
        throw new BadRequestException(`${this.humanizeReportingType(type)} must be selected from the matching leadership pool.`);
      }
    }

    await Promise.all([
      dto.organizationNodeId ? this.assertTenantRecord(tx, 'organizationNode', tenantId, dto.organizationNodeId, 'Organization reference is invalid.') : undefined,
      dto.positionId ? this.assertTenantRecord(tx, 'position', tenantId, dto.positionId, 'Position reference is invalid.') : undefined,
    ]);
  }

  private async mutateEmployeeCompensationChange(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    changeId: string,
    action: 'approve' | 'apply',
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tx, tenantId, employeeId);
      const existing = await this.findCompensationChangeOrThrow(tx, tenantId, employeeId, changeId);
      const before = this.compensationChangeState(existing);

      if (action === 'apply' && existing.status !== CompensationChangeStatus.APPROVED) {
        throw new BadRequestException('Only approved compensation changes can be applied.');
      }

      if (action === 'apply') {
        await this.applyCompensationProposalToTerm(tx, tenantId, employeeId, existing);
      }

      const change = await tx.employeeCompensationChange.update({
        where: { id: changeId },
        data: action === 'approve'
          ? {
              status: CompensationChangeStatus.APPROVED,
              approvedAt: new Date(),
              approvedById: actor.id,
            }
          : {
              status: CompensationChangeStatus.EFFECTIVE,
              finalState: existing.proposedState === null ? Prisma.JsonNull : (existing.proposedState as Prisma.InputJsonValue),
              appliedAt: new Date(),
            },
        include: this.compensationChangeInclude,
      });
      const after = this.compensationChangeState(change);

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'EmployeeCompensationChange', change.id, before, after);
      await this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: action === 'approve' ? 'Compensation change approved' : 'Compensation change applied',
        description: `${employee.employeeNumber} compensation change was ${action === 'approve' ? 'approved' : 'made effective'}.`,
        data: after,
      });
      await this.enqueueOutbox(tx, tenantId, `employee.compensation_change.${action}d`, employeeId, {
        employeeId,
        employeeNumber: employee.employeeNumber,
        compensationChangeId: change.id,
        status: change.status,
      });

      return change;
    });
  }

  private async applyCompensationProposalToTerm(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    change: { termId: string | null; proposedState: Prisma.JsonValue },
  ) {
    if (!change.termId) return;

    const proposed = this.jsonRecord(change.proposedState);
    const data: Prisma.EmployeeEmploymentTermUncheckedUpdateInput = {};

    if (typeof proposed.baseAmount === 'string') data.baseAmount = this.decimalString(proposed.baseAmount);
    if (typeof proposed.currencyCode === 'string') data.currencyCode = this.currencyCode(proposed.currencyCode);
    if (typeof proposed.payFrequency === 'string' && Object.values(PayFrequency).includes(proposed.payFrequency as PayFrequency)) {
      data.payFrequency = proposed.payFrequency as PayFrequency;
    }
    if (typeof proposed.gradeId === 'string') {
      await this.assertTenantRecord(tx, 'positionGrade', tenantId, proposed.gradeId, 'Grade reference is invalid.');
      data.gradeId = proposed.gradeId;
    }
    if (typeof proposed.levelId === 'string') {
      await this.assertTenantRecord(tx, 'positionLevel', tenantId, proposed.levelId, 'Level reference is invalid.');
      data.levelId = proposed.levelId;
    }

    if (Object.keys(data).length === 0) return;

    await tx.employeeEmploymentTerm.updateMany({
      where: { id: change.termId, tenantId, employeeId, deletedAt: null },
      data,
    });
  }

  private async currentCompensationState(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    termId?: string,
  ) {
    const [term, components] = await Promise.all([
      termId
        ? tx.employeeEmploymentTerm.findFirst({
            where: { id: termId, tenantId, employeeId, deletedAt: null },
            include: this.employmentTermInclude,
          })
        : tx.employeeEmploymentTerm.findFirst({
            where: { tenantId, employeeId, deletedAt: null, status: EmploymentTermStatus.ACTIVE },
            include: this.employmentTermInclude,
            orderBy: [{ effectiveFrom: 'desc' }],
          }),
      tx.employeeCompensationComponent.findMany({
        where: { tenantId, employeeId, deletedAt: null, status: CompensationChangeStatus.EFFECTIVE },
        include: this.compensationComponentInclude,
        orderBy: [{ type: 'asc' }, { effectiveFrom: 'desc' }],
      }),
    ]);

    return this.toJsonObject({
      term: term ? this.employmentTermState(term) : null,
      components: components.map((component) => this.compensationComponentState(component)),
    });
  }

  private async assertTenantRecord(
    tx: Prisma.TransactionClient,
    model: 'positionGrade' | 'positionLevel' | 'position' | 'organizationNode' | 'costCenter',
    tenantId: string,
    id: string,
    message: string,
  ) {
    const where = { id, tenantId, deletedAt: null };
    const record =
      model === 'positionGrade'
        ? await tx.positionGrade.findFirst({ where, select: { id: true } })
        : model === 'positionLevel'
          ? await tx.positionLevel.findFirst({ where, select: { id: true } })
          : model === 'position'
            ? await tx.position.findFirst({ where, select: { id: true } })
            : model === 'organizationNode'
              ? await tx.organizationNode.findFirst({ where, select: { id: true } })
              : await tx.costCenter.findFirst({ where, select: { id: true } });

    if (!record) {
      throw new BadRequestException(message);
    }
  }

  private async assertApprovalRequestExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    approvalRequestId: string,
  ) {
    const request = await tx.approvalRequest.findFirst({
      where: { id: approvalRequestId, tenantId },
      select: { id: true },
    });

    if (!request) {
      throw new BadRequestException('Approval request reference is invalid.');
    }
  }

  private writeEmploymentTermEffects(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employee: { id: string; employeeNumber: string },
    input: {
      action: AuditAction;
      before: Prisma.InputJsonValue | null;
      after: EmploymentTermStateSource;
      title: string;
      description: string;
      eventType: string;
    },
  ) {
    const after = this.employmentTermState(input.after);

    return Promise.all([
      this.writeAudit(tx, actor, tenantId, input.action, 'EmployeeEmploymentTerm', input.after.id, input.before, after),
      this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: input.title,
        description: input.description,
        data: after,
      }),
      this.enqueueOutbox(tx, tenantId, input.eventType, employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        employmentTerm: after,
      }),
    ]);
  }

  private writeCompensationComponentEffects(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employee: { id: string; employeeNumber: string },
    input: {
      action: AuditAction;
      before: Prisma.InputJsonValue | null;
      after: CompensationComponentStateSource;
      title: string;
      description: string;
      eventType: string;
    },
  ) {
    const after = this.compensationComponentState(input.after);

    return Promise.all([
      this.writeAudit(tx, actor, tenantId, input.action, 'EmployeeCompensationComponent', input.after.id, input.before, after),
      this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: TimelineEventType.EMPLOYEE_UPDATED,
        title: input.title,
        description: input.description,
        data: after,
      }),
      this.enqueueOutbox(tx, tenantId, input.eventType, employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        compensationComponent: after,
      }),
    ]);
  }

  private writeReportingRelationshipEffects(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employee: { id: string; employeeNumber: string },
    input: {
      action: AuditAction;
      before: Prisma.InputJsonValue | null;
      after: ReportingRelationshipStateSource;
      title: string;
      description: string;
      eventType: string;
    },
  ) {
    const after = this.reportingRelationshipState(input.after);

    return Promise.all([
      this.writeAudit(tx, actor, tenantId, input.action, 'EmployeeReportingRelationship', input.after.id, input.before, after),
      this.createTimelineEvent(tx, {
        actor,
        tenantId,
        employeeId: employee.id,
        type: input.after.type === ReportingRelationshipType.MANAGER ? TimelineEventType.MANAGER_CHANGED : TimelineEventType.EMPLOYEE_UPDATED,
        title: input.title,
        description: input.description,
        data: after,
      }),
      this.enqueueOutbox(tx, tenantId, input.eventType, employee.id, {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        reportingRelationship: after,
      }),
    ]);
  }

  private employmentTermState(term: EmploymentTermStateSource): Prisma.InputJsonObject {
    return this.toJsonObject({
      id: term.id,
      contractType: term.contractType,
      status: term.status,
      title: term.title,
      reference: term.reference,
      payFrequency: term.payFrequency,
      currencyCode: term.currencyCode,
      baseAmount: this.decimalToString(term.baseAmount),
      gradeId: term.gradeId,
      levelId: term.levelId,
      positionId: term.positionId,
      organizationNodeId: term.organizationNodeId,
      costCenterId: term.costCenterId,
      documentId: term.documentId,
      workflowRequestId: term.workflowRequestId,
      effectiveFrom: term.effectiveFrom?.toISOString?.() ?? null,
      effectiveTo: term.effectiveTo?.toISOString?.() ?? null,
      approvedAt: term.approvedAt?.toISOString?.() ?? null,
      approvedById: term.approvedById,
    });
  }

  private compensationComponentState(component: CompensationComponentStateSource): Prisma.InputJsonObject {
    return this.toJsonObject({
      id: component.id,
      termId: component.termId,
      type: component.type,
      name: component.name,
      amount: this.decimalToString(component.amount),
      currencyCode: component.currencyCode,
      frequency: component.frequency,
      taxable: component.taxable,
      status: component.status,
      effectiveFrom: component.effectiveFrom?.toISOString?.() ?? null,
      effectiveTo: component.effectiveTo?.toISOString?.() ?? null,
    });
  }

  private compensationChangeState(change: CompensationChangeStateSource): Prisma.InputJsonObject {
    return this.toJsonObject({
      id: change.id,
      termId: change.termId,
      status: change.status,
      effectiveDate: change.effectiveDate?.toISOString?.() ?? null,
      reason: change.reason,
      previousState: change.previousState,
      proposedState: change.proposedState,
      finalState: change.finalState,
      workflowRequestId: change.workflowRequestId,
      initiatedById: change.initiatedById,
      approvedAt: change.approvedAt?.toISOString?.() ?? null,
      approvedById: change.approvedById,
      appliedAt: change.appliedAt?.toISOString?.() ?? null,
    });
  }

  private reportingRelationshipState(relationship: ReportingRelationshipStateSource): Prisma.InputJsonObject {
    return this.toJsonObject({
      id: relationship.id,
      employeeId: relationship.employeeId,
      relatedEmployeeId: relationship.relatedEmployeeId,
      type: relationship.type,
      status: relationship.status,
      organizationNodeId: relationship.organizationNodeId,
      positionId: relationship.positionId,
      startsAt: relationship.startsAt?.toISOString?.() ?? null,
      endsAt: relationship.endsAt?.toISOString?.() ?? null,
      reason: relationship.reason,
    });
  }

  private reportingLeadershipRoles(type: ReportingRelationshipType): WorkforceLeadershipRole[] {
    if (type === ReportingRelationshipType.MANAGER) return [WorkforceLeadershipRole.MANAGER, WorkforceLeadershipRole.DEPARTMENT_HEAD];
    if (type === ReportingRelationshipType.SUPERVISOR) return [WorkforceLeadershipRole.SUPERVISOR, WorkforceLeadershipRole.MANAGER];
    if (type === ReportingRelationshipType.UNIT_HEAD) return [WorkforceLeadershipRole.UNIT_HEAD, WorkforceLeadershipRole.DEPARTMENT_HEAD];
    if (type === ReportingRelationshipType.PROJECT_LEAD) return [WorkforceLeadershipRole.PROJECT_LEAD];
    if (type === ReportingRelationshipType.HR_BUSINESS_PARTNER) return [WorkforceLeadershipRole.HR_BUSINESS_PARTNER];
    if (type === ReportingRelationshipType.APPROVER) return [WorkforceLeadershipRole.APPROVER, WorkforceLeadershipRole.MANAGER];
    return [];
  }

  private reportingTypeIsExclusive(type: ReportingRelationshipType) {
    return new Set<ReportingRelationshipType>([
      ReportingRelationshipType.MANAGER,
      ReportingRelationshipType.SUPERVISOR,
      ReportingRelationshipType.UNIT_HEAD,
      ReportingRelationshipType.HR_BUSINESS_PARTNER,
    ]).has(type);
  }

  private humanizeReportingType(type: ReportingRelationshipType) {
    return type
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private assertEffectiveWindow(startsAt: Date, endsAt?: Date | null) {
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Effective start date is invalid.');
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Effective end date is invalid.');
    }

    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('Effective end date must be after the start date.');
    }
  }

  private currencyCode(value?: string | null) {
    const code = this.nullableString(value)?.toUpperCase();
    if (code && code.length !== 3) {
      throw new BadRequestException('currencyCode must be a three-letter ISO currency code.');
    }
    return code;
  }

  private decimalString(value?: string | null) {
    const normalized = this.nullableString(value);
    if (!normalized) return normalized;
    if (!/^-?\d{1,16}(\.\d{1,2})?$/.test(normalized)) {
      throw new BadRequestException('Amount must be a valid decimal with up to two decimal places.');
    }
    return normalized;
  }

  private decimalToString(value: unknown) {
    return value && typeof value === 'object' && 'toString' in value
      ? (value as { toString: () => string }).toString()
      : value ?? null;
  }

  private async sendEmployeeAccessInvitationEmail(input: {
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    employee: {
      id: string;
      person: {
        firstName: string;
        middleName: string | null;
        lastName: string;
        preferredName: string | null;
      };
    };
    user: { id: string; email: string; username: string | null };
    invitationToken: string;
    invitationExpiresAt: Date;
  }) {
    const setupUrl = this.employeeInvitationUrl(input.invitationToken);
    const employeeName = this.personDisplayName(input.employee.person);
    const title = `Set up your TimeSync access for ${input.tenantName}`;
    const body = [
      `Hello ${employeeName},`,
      `${input.tenantName} has created your TimeSync employee self-service account.`,
      `Use this secure link to set your password:`,
      setupUrl,
      `Tenant workspace: ${input.tenantSlug}`,
      `This invitation expires on ${input.invitationExpiresAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC.`,
      `After setup, sign in with ${input.user.email} and tenant slug ${input.tenantSlug}.`,
    ].join('\n\n');

    const notification = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        channel: NotificationChannel.EMAIL,
        title,
        body,
        status: NotificationStatus.PENDING,
        templateCode: 'USER_INVITED',
        data: {
          module: 'employees',
          purpose: 'employee-self-service',
          employeeId: input.employee.id,
          invitationExpiresAt: input.invitationExpiresAt.toISOString(),
        },
        recipients: {
          create: {
            userId: input.user.id,
            employeeId: input.employee.id,
            destination: input.user.email,
            status: NotificationStatus.PENDING,
          },
        },
      },
      include: {
        recipients: true,
      },
    });

    const recipient = notification.recipients[0];
    const delivery = await this.notificationDelivery.deliver({ notification, recipient });

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationRecipient.update({
        where: { id: recipient.id },
        data: {
          status: delivery.status,
          deliveredAt: this.isSuccessfulNotificationDelivery(delivery.status) ? new Date() : undefined,
          failureReason: delivery.failureReason,
        },
      });

      await tx.notification.update({
        where: { id: notification.id },
        data: {
          status: delivery.status,
          sentAt: new Date(),
          data: {
            ...(notification.data && typeof notification.data === 'object' && !Array.isArray(notification.data)
              ? (notification.data as Record<string, unknown>)
              : {}),
            deliveryStatus: delivery.status,
            deliveryFailureReason: delivery.failureReason,
            providerMessageId: delivery.providerMessageId,
          },
        },
      });
    });
  }

  private employeeInvitationUrl(token: string) {
    const frontendUrl = this.config.get<string>('app.frontendUrl', 'http://localhost:3000');
    const url = new URL('/accept-invitation', frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private hashInvitationToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private isSuccessfulNotificationDelivery(status: NotificationStatus) {
    const successfulStatuses: NotificationStatus[] = [
      NotificationStatus.SENT,
      NotificationStatus.DELIVERED,
      NotificationStatus.READ,
    ];

    return successfulStatuses.includes(status);
  }

  private personDisplayName(person: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    preferredName?: string | null;
  }) {
    return person.preferredName || [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
  }

  private async assertUserNotLinkedToAnotherPerson(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    currentPersonId: string,
  ) {
    const existingPerson = await tx.person.findFirst({
      where: {
        tenantId,
        userId,
        id: { not: currentPersonId },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existingPerson) {
      throw new BadRequestException('User is already linked to another person profile.');
    }
  }

  private async assertNoConcurrentEmployment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    personId: string,
  ) {
    const existing = await tx.employee.findFirst({
      where: {
        tenantId,
        personId,
        deletedAt: null,
        status: {
          in: ACTIVE_EMPLOYMENT_STATUSES,
        },
      },
      select: { id: true, employeeNumber: true, status: true },
    });

    if (existing) {
      throw new BadRequestException(
        `Person already has an active employment relationship: ${existing.employeeNumber}.`,
      );
    }
  }

  private async assertEmployeeNumberAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeNumber: string,
    currentEmployeeId?: string,
  ) {
    const existing = await tx.employee.findFirst({
      where: {
        tenantId,
        employeeNumber,
        id: currentEmployeeId ? { not: currentEmployeeId } : undefined,
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Employee number is already in use for this tenant.');
    }
  }

  private async assertNoActiveAssignments(tenantId: string, employeeId: string) {
    const activeAssignmentCount = await this.prisma.employeeAssignment.count({
      where: {
        tenantId,
        employeeId,
        effectiveTo: null,
      },
    });

    if (activeAssignmentCount > 0) {
      throw new BadRequestException('Employee cannot be archived while active assignments exist.');
    }
  }

  private assertLifecycleTransitionAllowed(currentStatus: EmployeeStatus, options: TransitionOptions) {
    if (
      options.allowedCurrentStatuses &&
      !options.allowedCurrentStatuses.includes(currentStatus)
    ) {
      throw new BadRequestException(
        `Employee status ${currentStatus} cannot transition to ${options.targetStatus}.`,
      );
    }

    if (options.disallowedCurrentStatuses?.includes(currentStatus)) {
      throw new BadRequestException(`Employee status ${currentStatus} cannot be changed by this action.`);
    }
  }

  private async generateEmployeeNumber(tx: Prisma.TransactionClient, tenantId: string) {
    const setting = await tx.tenantSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        employeeNumberPrefix: 'EMP',
        employeeNumberNextSeq: 2,
      },
      update: {
        employeeNumberNextSeq: {
          increment: 1,
        },
      },
      select: {
        employeeNumberPrefix: true,
        employeeNumberNextSeq: true,
      },
    });

    return this.formatEmployeeNumber(setting.employeeNumberPrefix, setting.employeeNumberNextSeq - 1);
  }

  private formatEmployeeNumber(prefix: string | null | undefined, sequence: number) {
    return `${prefix ?? 'EMP'}${sequence.toString().padStart(6, '0')}`;
  }

  private normalizeEmployeeNumber(employeeNumber: string) {
    return employeeNumber.trim().toUpperCase();
  }

  private async createWorkforceAction(
    tx: Prisma.TransactionClient,
    input: {
      actor: AuthenticatedPrincipal;
      tenantId: string;
      employeeId: string;
      type: WorkforceActionType;
      effectiveDate: Date;
      reason?: string;
      previousState: Prisma.InputJsonValue | null;
      proposedState: Prisma.InputJsonValue;
      finalState: Prisma.InputJsonValue;
      note: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.workforceAction.create({
      data: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        type: input.type,
        status: WorkforceActionStatus.COMPLETED,
        effectiveDate: input.effectiveDate,
        reason: input.reason,
        previousState: input.previousState ?? undefined,
        proposedState: input.proposedState,
        finalState: input.finalState,
        initiatedById: input.actor.id,
        completedAt: new Date(),
        metadata: this.toJson(input.metadata),
        history: {
          create: {
            status: WorkforceActionStatus.COMPLETED,
            note: input.note,
            actorUserId: input.actor.id,
            snapshot: input.finalState,
          },
        },
      },
    });
  }

  private async createTimelineEvent(
    tx: Prisma.TransactionClient,
    input: {
      actor: AuthenticatedPrincipal;
      tenantId: string;
      employeeId: string;
      type: TimelineEventType;
      title: string;
      description: string;
      data: Prisma.InputJsonValue;
    },
  ) {
    await tx.timelineEvent.create({
      data: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        actorUserId: input.actor.id,
        type: input.type,
        title: input.title,
        description: input.description,
        entityType: 'Employee',
        entityId: input.employeeId,
        data: input.data,
      },
    });
  }

  private async enqueueOutbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventType: string,
    employeeId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType: 'Employee',
        aggregateId: employeeId,
        payload,
      },
    });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'employees',
        entityType,
        entityId,
        before: before ?? undefined,
        after,
      },
    });
  }

  private employeeState(employee: EmployeeStateSource): Prisma.InputJsonObject {
    return {
      id: employee.id,
      personId: employee.personId,
      userId: employee.userId,
      employeeNumber: employee.employeeNumber,
      status: employee.status,
      employmentType: employee.employmentType,
      hireDate: employee.hireDate?.toISOString() ?? null,
      confirmationDate: employee.confirmationDate?.toISOString() ?? null,
      endDate: employee.endDate?.toISOString() ?? null,
      separationReason: employee.separationReason,
      source: employee.source,
      deletedAt: employee.deletedAt?.toISOString() ?? null,
    };
  }

  private withMasterDataReadiness<T extends EmployeeMasterDataSource>(employee: T) {
    return {
      ...employee,
      masterDataReadiness: this.masterDataReadiness(employee),
    };
  }

  private masterDataReadiness(employee: EmployeeMasterDataSource) {
    const person = employee.person;
    const assignments = employee.assignments ?? [];
    const activeAssignment =
      assignments.find((assignment) => assignment.isPrimary && !assignment.effectiveTo) ??
      assignments.find((assignment) => !assignment.effectiveTo) ??
      null;
    const primaryEmail = person?.contacts?.some(
      (contact) => contact.type.toUpperCase() === 'EMAIL' && Boolean(contact.value),
    );
    const primaryPhone = person?.contacts?.some(
      (contact) => contact.type.toUpperCase() === 'PHONE' && Boolean(contact.value),
    );
    const primaryAddress = person?.addresses?.some(
      (address) => Boolean(address.line1 || address.city || address.countryId),
    );
    const emergencyContact = person?.emergencyContacts?.some(
      (contact) => Boolean(contact.name && (contact.phone || contact.email)),
    );
    const demographicProfile = person?.demographicProfile;
    const readyReferenceStatuses = new Set<EmployeeReferenceStatus>([
      EmployeeReferenceStatus.CONTACTED,
      EmployeeReferenceStatus.VERIFIED,
    ]);
    const readyPayoutStatuses = new Set<PayoutAccountStatus>([
      PayoutAccountStatus.PENDING_VERIFICATION,
      PayoutAccountStatus.VERIFIED,
    ]);
    const readyBackgroundStatuses = new Set<EmployeeBackgroundCheckStatus>([
      EmployeeBackgroundCheckStatus.CLEAR,
      EmployeeBackgroundCheckStatus.REVIEW_REQUIRED,
    ]);
    const readyStatutoryStatuses = new Set<EmployeeStatutoryIdentifierStatus>([
      EmployeeStatutoryIdentifierStatus.PENDING_VERIFICATION,
      EmployeeStatutoryIdentifierStatus.VERIFIED,
    ]);
    const blockedEligibilityStatuses = new Set<WorkEligibilityStatus>([
      WorkEligibilityStatus.EXPIRED,
      WorkEligibilityStatus.REJECTED,
    ]);
    const referencesReady = (employee.references ?? []).some((reference) =>
      readyReferenceStatuses.has(reference.status),
    );
    const payoutReady = (employee.payoutAccounts ?? []).some((account) =>
      readyPayoutStatuses.has(account.status),
    );
    const backgroundCheckReady = (employee.backgroundChecks ?? []).some((check) =>
      readyBackgroundStatuses.has(check.status),
    );
    const statutoryReady = (employee.statutoryIdentifiers ?? []).some((identifier) =>
      readyStatutoryStatuses.has(identifier.status),
    );
    const workEligibilityReady =
      Boolean(employee.workEligibility?.workCountryId || employee.workEligibility?.taxCountryId) &&
      Boolean(employee.workEligibility?.status) &&
      !blockedEligibilityStatuses.has(employee.workEligibility?.status ?? WorkEligibilityStatus.NOT_REVIEWED);
    const employmentTermsReady = (employee.employmentTerms ?? []).some(
      (term) =>
        term.status === EmploymentTermStatus.ACTIVE &&
        Boolean(term.effectiveFrom) &&
        Boolean(term.contractType),
    );
    const reportingRelationshipReady = (employee.reportingRelationships ?? []).some(
      (relationship) =>
        relationship.status === ReportingRelationshipStatus.ACTIVE &&
        Boolean(relationship.relatedEmployeeId) &&
        Boolean(relationship.startsAt),
    );

    const checks = [
      { key: 'legal_name', label: 'Legal name', complete: Boolean(person?.firstName && person.lastName) },
      { key: 'date_of_birth', label: 'Date of birth', complete: Boolean(person?.dateOfBirth) },
      { key: 'nationality', label: 'Nationality', complete: Boolean(person?.nationalityId) },
      { key: 'employment_record', label: 'Employment record', complete: Boolean(employee.employeeNumber && employee.employmentType && employee.status) },
      { key: 'hire_date', label: 'Hire date', complete: Boolean(employee.hireDate) },
      { key: 'employment_terms', label: 'Employment terms', complete: employmentTermsReady },
      { key: 'primary_assignment', label: 'Primary assignment', complete: Boolean(activeAssignment) },
      { key: 'position', label: 'Position', complete: Boolean(activeAssignment?.positionId) },
      { key: 'organization', label: 'Organization placement', complete: Boolean(activeAssignment?.organizationNodeId) },
      { key: 'manager', label: 'Manager', complete: Boolean(activeAssignment?.managerEmployeeId) },
      { key: 'reporting_relationship', label: 'Reporting relationship', complete: reportingRelationshipReady },
      { key: 'email', label: 'Email contact', complete: Boolean(primaryEmail) },
      { key: 'phone', label: 'Phone contact', complete: Boolean(primaryPhone) },
      { key: 'address', label: 'Primary address', complete: Boolean(primaryAddress) },
      { key: 'emergency_contact', label: 'Emergency contact', complete: Boolean(emergencyContact) },
      { key: 'demographics', label: 'Demographic consent', complete: Boolean(demographicProfile?.consentGivenAt && !demographicProfile.consentWithdrawnAt) },
      { key: 'reference', label: 'Reference record', complete: referencesReady },
      { key: 'background_check', label: 'Background check', complete: backgroundCheckReady },
      { key: 'payout_account', label: 'Payout account', complete: payoutReady },
      { key: 'statutory_identifier', label: 'Tax or statutory identifier', complete: statutoryReady },
      { key: 'work_eligibility', label: 'Work eligibility', complete: workEligibilityReady },
    ];
    const completed = checks.filter((check) => check.complete).length;

    return {
      completed,
      total: checks.length,
      completionPercent: Math.round((completed / checks.length) * 100),
      missing: checks.filter((check) => !check.complete).map(({ key, label }) => ({ key, label })),
      groups: {
        identity: this.readinessGroup(checks, ['legal_name', 'date_of_birth', 'nationality']),
        employment: this.readinessGroup(checks, ['employment_record', 'hire_date', 'employment_terms']),
        assignment: this.readinessGroup(checks, ['primary_assignment', 'position', 'organization', 'manager', 'reporting_relationship']),
        contacts: this.readinessGroup(checks, ['email', 'phone', 'address', 'emergency_contact']),
        compliance: this.readinessGroup(checks, ['demographics', 'reference', 'background_check', 'payout_account', 'statutory_identifier', 'work_eligibility']),
      },
    };
  }

  private readinessGroup(
    checks: Array<{ key: string; label: string; complete: boolean }>,
    keys: string[],
  ) {
    const groupChecks = checks.filter((check) => keys.includes(check.key));
    const completed = groupChecks.filter((check) => check.complete).length;

    return {
      completed,
      total: groupChecks.length,
      completionPercent: groupChecks.length ? Math.round((completed / groupChecks.length) * 100) : 0,
      missing: groupChecks.filter((check) => !check.complete).map(({ key, label }) => ({ key, label })),
    };
  }

  private employeeMasterDataState(employee: EmployeeMasterDataSource): Prisma.InputJsonObject {
    const person = employee.person;

    return this.toJsonObject({
      employee: this.employeeState(employee),
      person: person
        ? {
            id: person.id,
            firstName: person.firstName,
            middleName: person.middleName,
            lastName: person.lastName,
            preferredName: person.preferredName,
            dateOfBirth: person.dateOfBirth?.toISOString() ?? null,
            gender: person.gender,
            maritalStatus: person.maritalStatus,
            nationalityId: person.nationalityId,
            photoUrl: person.photoUrl,
            bloodGroup: person.bloodGroup,
            disabilityStatus: person.disabilityStatus,
            veteranStatus: person.veteranStatus,
            bio: person.bio,
            contactCount: person.contacts?.length ?? 0,
            addressCount: person.addresses?.length ?? 0,
            emergencyContactCount: person.emergencyContacts?.length ?? 0,
                  demographicProfile: person.demographicProfile
              ? {
                  pronouns: person.demographicProfile.pronouns,
                  genderIdentity: person.demographicProfile.genderIdentity,
                  sexAssignedAtBirth: person.demographicProfile.sexAssignedAtBirth,
                  sexualOrientation: person.demographicProfile.sexualOrientation,
                  race: person.demographicProfile.race,
                  preferredLanguageCode: person.demographicProfile.preferredLanguageCode,
                  primaryLanguageCode: person.demographicProfile.primaryLanguageCode,
                  ethnicity: person.demographicProfile.ethnicity,
                  ethnicityDetail: person.demographicProfile.ethnicityDetail,
                  religion: person.demographicProfile.religion,
                  religionDetail: person.demographicProfile.religionDetail,
                  demographicCountryId: person.demographicProfile.demographicCountryId,
                  caregiverStatus: person.demographicProfile.caregiverStatus,
                  disabilityAccommodation: person.demographicProfile.disabilityAccommodation,
                  accommodationRequired: person.demographicProfile.accommodationRequired,
                  veteranCategory: person.demographicProfile.veteranCategory,
                  consentSource: person.demographicProfile.consentSource,
                  consentNote: person.demographicProfile.consentNote,
                  consentGivenAt: person.demographicProfile.consentGivenAt?.toISOString() ?? null,
                  consentWithdrawnAt: person.demographicProfile.consentWithdrawnAt?.toISOString() ?? null,
                  verifiedAt: person.demographicProfile.verifiedAt?.toISOString() ?? null,
                  verifiedById: person.demographicProfile.verifiedById,
                }
              : null,
          }
        : null,
      readiness: this.masterDataReadiness(employee),
    });
  }

  private hrPersonMasterData(dto: UpdateEmployeeMasterDataDto): Prisma.PersonUncheckedUpdateInput {
    const data: Prisma.PersonUncheckedUpdateInput = {};

    if (dto.firstName !== undefined) data.firstName = this.requiredString(dto.firstName, 'firstName');
    if (dto.middleName !== undefined) data.middleName = this.nullableString(dto.middleName);
    if (dto.lastName !== undefined) data.lastName = this.requiredString(dto.lastName, 'lastName');
    if (dto.preferredName !== undefined) data.preferredName = this.nullableString(dto.preferredName);
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = this.toDate(dto.dateOfBirth);
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.maritalStatus !== undefined) data.maritalStatus = dto.maritalStatus;
    if (dto.nationalityId !== undefined) data.nationalityId = this.nullableString(dto.nationalityId);
    if (dto.photoUrl !== undefined) data.photoUrl = this.nullableString(dto.photoUrl);
    if (dto.bloodGroup !== undefined) data.bloodGroup = this.nullableString(dto.bloodGroup);
    if (dto.disabilityStatus !== undefined) data.disabilityStatus = this.nullableString(dto.disabilityStatus);
    if (dto.veteranStatus !== undefined) data.veteranStatus = this.nullableString(dto.veteranStatus);
    if (dto.bio !== undefined) data.bio = this.nullableString(dto.bio);

    return data;
  }

  private selfServicePersonMasterData(dto: UpdateEmployeeSelfServiceMasterDataDto): Prisma.PersonUncheckedUpdateInput {
    const data: Prisma.PersonUncheckedUpdateInput = {};

    if (dto.preferredName !== undefined) data.preferredName = this.nullableString(dto.preferredName);
    if (dto.photoUrl !== undefined) data.photoUrl = this.nullableString(dto.photoUrl);
    if (dto.bio !== undefined) data.bio = this.nullableString(dto.bio);

    return data;
  }

  private async upsertDemographicProfile(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    personId: string,
    dto: UpdateEmployeeDemographicProfileDto,
    verify = false,
  ) {
    const consentData =
      dto.consentGiven === undefined
        ? {}
        : dto.consentGiven
          ? { consentGivenAt: new Date(), consentWithdrawnAt: null }
          : { consentWithdrawnAt: new Date() };
    const data: Prisma.PersonDemographicProfileUncheckedCreateInput = {
      tenantId,
      personId,
      pronouns: this.nullableString(dto.pronouns),
      genderIdentity: this.nullableString(dto.genderIdentity),
      sexAssignedAtBirth: this.nullableString(dto.sexAssignedAtBirth),
      sexualOrientation: this.nullableString(dto.sexualOrientation),
      race: this.nullableString(dto.race),
      preferredLanguageCode: this.nullableString(dto.preferredLanguageCode),
      primaryLanguageCode: this.nullableString(dto.primaryLanguageCode),
      ethnicity: this.nullableString(dto.ethnicity),
      ethnicityDetail: this.nullableString(dto.ethnicityDetail),
      religion: this.nullableString(dto.religion),
      religionDetail: this.nullableString(dto.religionDetail),
      demographicCountryId: this.nullableString(dto.demographicCountryId),
      caregiverStatus: this.nullableString(dto.caregiverStatus),
      disabilityAccommodation: this.nullableString(dto.disabilityAccommodation),
      accommodationRequired: dto.accommodationRequired,
      veteranCategory: this.nullableString(dto.veteranCategory),
      consentSource: this.nullableString(dto.consentSource),
      consentNote: this.nullableString(dto.consentNote),
      metadata: this.toJson(dto.metadata),
      ...(verify ? { verifiedAt: new Date(), verifiedById: actor.id } : {}),
      ...consentData,
    };
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => !['tenantId', 'personId'].includes(key) && value !== undefined),
    ) as Prisma.PersonDemographicProfileUncheckedUpdateInput;

    await tx.personDemographicProfile.upsert({
      where: { personId },
      create: data,
      update: updateData,
    });
  }

  private async upsertPersonContact(
    tx: Prisma.TransactionClient,
    personId: string,
    input: { type: string; label: string; value: string },
  ) {
    const value = this.requiredString(input.value, input.type.toLowerCase());
    const existing = await tx.personContact.findFirst({
      where: {
        personId,
        type: input.type,
        label: input.label,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    const existingPrimary = await tx.personContact.findFirst({
      where: {
        personId,
        type: input.type,
        isPrimary: true,
      },
      select: { id: true },
    });

    if (existing) {
      await tx.personContact.update({
        where: { id: existing.id },
        data: { value },
      });
      return;
    }

    await tx.personContact.create({
      data: {
        personId,
        type: input.type,
        label: input.label,
        value,
        isPrimary: !existingPrimary,
      },
    });
  }

  private async upsertSelfServiceAddress(
    tx: Prisma.TransactionClient,
    personId: string,
    dto: UpdateSelfServiceAddressDto,
  ) {
    if (!Object.values(dto).some(Boolean)) {
      return;
    }

    const existing = await tx.personAddress.findFirst({
      where: {
        personId,
        OR: [{ isPrimary: true }, { type: dto.type ?? 'home' }],
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    const data = {
      type: this.nullableString(dto.type) ?? 'home',
      line1: this.nullableString(dto.line1),
      line2: this.nullableString(dto.line2),
      city: this.nullableString(dto.city),
      state: this.nullableString(dto.state),
      postalCode: this.nullableString(dto.postalCode),
      countryId: this.nullableString(dto.countryId),
      isPrimary: true,
    };

    if (existing) {
      await tx.personAddress.update({
        where: { id: existing.id },
        data,
      });
      return;
    }

    await tx.personAddress.create({
      data: {
        personId,
        ...data,
      },
    });
  }

  private async upsertSelfServiceEmergencyContact(
    tx: Prisma.TransactionClient,
    personId: string,
    dto: UpdateSelfServiceEmergencyContactDto,
  ) {
    if (!Object.values(dto).some(Boolean)) {
      return;
    }

    const existing = await tx.emergencyContact.findFirst({
      where: {
        personId,
        isPrimary: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    if (!existing && !dto.name?.trim()) {
      throw new BadRequestException('Emergency contact name is required.');
    }

    const data = {
      name: dto.name !== undefined ? this.requiredString(dto.name, 'emergencyContact.name') : existing?.name,
      relationship: this.nullableString(dto.relationship),
      phone: this.nullableString(dto.phone),
      email: this.nullableString(dto.email),
      isPrimary: true,
    };

    if (existing) {
      await tx.emergencyContact.update({
        where: { id: existing.id },
        data,
      });
      return;
    }

    await tx.emergencyContact.create({
      data: {
        personId,
        ...data,
        name: data.name ?? this.requiredString(dto.name, 'emergencyContact.name'),
      },
    });
  }

  private employeeExtendedProfile(employee: EmployeeExtendedProfileSource) {
    return {
      dependents: employee.dependents ?? [],
      references: employee.references ?? [],
      referenceDocuments: employee.referenceDocuments ?? [],
      backgroundChecks: employee.backgroundChecks ?? [],
      payoutAccounts: employee.payoutAccounts ?? [],
      statutoryIdentifiers: employee.statutoryIdentifiers ?? [],
      workEligibility: employee.workEligibility ?? null,
    };
  }

  private employeeExtendedProfileState(employee: EmployeeExtendedProfileSource): Prisma.InputJsonObject {
    return this.toJsonObject({
      employee: this.employeeState(employee),
      dependents: (employee.dependents ?? [])
        .filter((dependent) => !dependent.deletedAt)
        .map((dependent) => ({
          id: dependent.id,
          relationship: dependent.relationship,
          benefitEligible: dependent.benefitEligible,
          taxDependent: dependent.taxDependent,
          startsAt: dependent.startsAt?.toISOString() ?? null,
          endsAt: dependent.endsAt?.toISOString() ?? null,
        })),
      references: (employee.references ?? [])
        .filter((reference) => !reference.deletedAt)
        .map((reference) => ({
          id: reference.id,
          type: reference.type,
          relationship: reference.relationship,
          company: reference.company,
          status: reference.status,
          verifiedAt: reference.verifiedAt?.toISOString() ?? null,
          verifiedById: reference.verifiedById,
        })),
      referenceDocuments: (employee.referenceDocuments ?? [])
        .filter((document) => !document.deletedAt)
        .map((document) => ({
          id: document.id,
          referenceId: document.referenceId,
          documentId: document.documentId,
          fileName: document.fileName,
          fileUrl: document.fileUrl,
          verificationStatus: document.verificationStatus,
        })),
      backgroundChecks: (employee.backgroundChecks ?? []).map((check) => ({
        id: check.id,
        provider: check.provider,
        packageName: check.packageName,
        status: check.status,
        requestedAt: check.requestedAt?.toISOString() ?? null,
        completedAt: check.completedAt?.toISOString() ?? null,
        expiresAt: check.expiresAt?.toISOString() ?? null,
        adjudicatedAt: check.adjudicatedAt?.toISOString() ?? null,
        adjudicatedById: check.adjudicatedById,
      })),
      payoutAccounts: (employee.payoutAccounts ?? [])
        .filter((account) => !account.deletedAt)
        .map((account) => ({
          id: account.id,
          bankName: account.bankName,
          accountType: account.accountType,
          currencyCode: account.currencyCode,
          countryId: account.countryId,
          accountNumberLast4: account.accountNumberLast4,
          routingNumberLast4: account.routingNumberLast4,
          ibanLast4: account.ibanLast4,
          allocationPercent: account.allocationPercent,
          isPrimary: account.isPrimary,
          status: account.status,
          verifiedAt: account.verifiedAt?.toISOString() ?? null,
          verifiedById: account.verifiedById,
        })),
      statutoryIdentifiers: (employee.statutoryIdentifiers ?? [])
        .filter((identifier) => !identifier.deletedAt)
        .map((identifier) => ({
          id: identifier.id,
          type: identifier.type,
          label: identifier.label,
          countryId: identifier.countryId,
          identifierLast4: identifier.identifierLast4,
          issuedAt: identifier.issuedAt?.toISOString() ?? null,
          expiresAt: identifier.expiresAt?.toISOString() ?? null,
          status: identifier.status,
          verifiedAt: identifier.verifiedAt?.toISOString() ?? null,
          verifiedById: identifier.verifiedById,
        })),
      workEligibility: employee.workEligibility
        ? {
            status: employee.workEligibility.status,
            workCountryId: employee.workEligibility.workCountryId,
            taxCountryId: employee.workEligibility.taxCountryId,
            workPermitRequired: employee.workEligibility.workPermitRequired,
            permitType: employee.workEligibility.permitType,
            issuedAt: employee.workEligibility.issuedAt?.toISOString() ?? null,
            expiresAt: employee.workEligibility.expiresAt?.toISOString() ?? null,
            verifiedAt: employee.workEligibility.verifiedAt?.toISOString() ?? null,
            verifiedById: employee.workEligibility.verifiedById,
          }
        : null,
    });
  }

  private extendedProfileMetadata(dto: UpdateEmployeeExtendedProfileDto) {
    return {
      dependents: dto.dependents?.length ?? 0,
      references: dto.references?.length ?? 0,
      referenceDocuments: dto.referenceDocuments?.length ?? 0,
      backgroundChecks: dto.backgroundChecks?.length ?? 0,
      payoutAccounts: dto.payoutAccounts?.length ?? 0,
      statutoryIdentifiers: dto.statutoryIdentifiers?.length ?? 0,
      workEligibility: Boolean(dto.workEligibility),
      removals:
        (dto.removeDependentIds?.length ?? 0) +
        (dto.removeReferenceIds?.length ?? 0) +
        (dto.removeReferenceDocumentIds?.length ?? 0) +
        (dto.removeBackgroundCheckIds?.length ?? 0) +
        (dto.removePayoutAccountIds?.length ?? 0) +
        (dto.removeStatutoryIdentifierIds?.length ?? 0),
    };
  }

  private async applyEmployeeExtendedProfile(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    dto: UpdateEmployeeExtendedProfileDto,
    options: { selfService: boolean },
  ) {
    if (options.selfService && this.hasSelfServiceRemovalRequest(dto)) {
      throw new BadRequestException('Submitted employment records cannot be removed from self-service. HR can archive, reject, or reopen the record.');
    }

    await this.softDeleteEmployeeDependents(tx, tenantId, employeeId, dto.removeDependentIds);
    await this.softDeleteEmployeeReferences(tx, tenantId, employeeId, dto.removeReferenceIds);
    await this.softDeleteEmployeeReferenceDocuments(tx, tenantId, employeeId, dto.removeReferenceDocumentIds);
    await this.deleteEmployeeBackgroundChecks(tx, tenantId, employeeId, dto.removeBackgroundCheckIds);
    await this.softDeleteEmployeePayoutAccounts(tx, tenantId, employeeId, dto.removePayoutAccountIds);
    await this.softDeleteEmployeeStatutoryIdentifiers(tx, tenantId, employeeId, dto.removeStatutoryIdentifierIds);

    for (const dependent of dto.dependents ?? []) {
      await this.upsertEmployeeDependent(tx, tenantId, employeeId, dependent);
    }

    for (const reference of dto.references ?? []) {
      await this.upsertEmployeeReference(tx, actor, tenantId, employeeId, reference, options.selfService);
    }

    for (const referenceDocument of dto.referenceDocuments ?? []) {
      await this.upsertEmployeeReferenceDocument(tx, actor, tenantId, employeeId, referenceDocument);
    }

    for (const backgroundCheck of dto.backgroundChecks ?? []) {
      await this.upsertEmployeeBackgroundCheck(tx, actor, tenantId, employeeId, backgroundCheck, options.selfService);
    }

    for (const payoutAccount of dto.payoutAccounts ?? []) {
      await this.upsertEmployeePayoutAccount(tx, actor, tenantId, employeeId, payoutAccount, options.selfService);
    }

    for (const statutoryIdentifier of dto.statutoryIdentifiers ?? []) {
      await this.upsertEmployeeStatutoryIdentifier(tx, actor, tenantId, employeeId, statutoryIdentifier, options.selfService);
    }

    if (dto.workEligibility) {
      await this.upsertEmployeeWorkEligibility(tx, actor, tenantId, employeeId, dto.workEligibility, options.selfService);
    }
  }

  private async softDeleteEmployeeDependents(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    ids?: string[],
  ) {
    const uniqueIds = [...new Set(ids ?? [])];

    if (!uniqueIds.length) return;

    const result = await tx.employeeDependent.updateMany({
      where: { tenantId, employeeId, id: { in: uniqueIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count !== uniqueIds.length) {
      throw new BadRequestException('One or more dependent records could not be found for this employee.');
    }
  }

  private async softDeleteEmployeeReferences(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    ids?: string[],
  ) {
    const uniqueIds = [...new Set(ids ?? [])];

    if (!uniqueIds.length) return;

    const result = await tx.employeeReference.updateMany({
      where: { tenantId, employeeId, id: { in: uniqueIds }, deletedAt: null },
      data: { deletedAt: new Date(), status: EmployeeReferenceStatus.ARCHIVED },
    });

    if (result.count !== uniqueIds.length) {
      throw new BadRequestException('One or more reference records could not be found for this employee.');
    }
  }

  private async softDeleteEmployeeReferenceDocuments(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    ids?: string[],
  ) {
    const uniqueIds = [...new Set(ids ?? [])];

    if (!uniqueIds.length) return;

    const result = await tx.employeeReferenceDocument.updateMany({
      where: { tenantId, employeeId, id: { in: uniqueIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count !== uniqueIds.length) {
      throw new BadRequestException('One or more reference document records could not be found for this employee.');
    }
  }

  private async deleteEmployeeBackgroundChecks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    ids?: string[],
  ) {
    const uniqueIds = [...new Set(ids ?? [])];

    if (!uniqueIds.length) return;

    const result = await tx.employeeBackgroundCheck.updateMany({
      where: { tenantId, employeeId, id: { in: uniqueIds }, deletedAt: null },
      data: { deletedAt: new Date(), status: EmployeeBackgroundCheckStatus.CANCELLED },
    });

    if (result.count !== uniqueIds.length) {
      throw new BadRequestException('One or more background check records could not be found for this employee.');
    }
  }

  private async softDeleteEmployeePayoutAccounts(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    ids?: string[],
  ) {
    const uniqueIds = [...new Set(ids ?? [])];

    if (!uniqueIds.length) return;

    const result = await tx.employeePayoutAccount.updateMany({
      where: { tenantId, employeeId, id: { in: uniqueIds }, deletedAt: null },
      data: { deletedAt: new Date(), status: PayoutAccountStatus.ARCHIVED },
    });

    if (result.count !== uniqueIds.length) {
      throw new BadRequestException('One or more payout account records could not be found for this employee.');
    }
  }

  private async softDeleteEmployeeStatutoryIdentifiers(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    ids?: string[],
  ) {
    const uniqueIds = [...new Set(ids ?? [])];

    if (!uniqueIds.length) return;

    const result = await tx.employeeStatutoryIdentifier.updateMany({
      where: { tenantId, employeeId, id: { in: uniqueIds }, deletedAt: null },
      data: { deletedAt: new Date(), status: EmployeeStatutoryIdentifierStatus.ARCHIVED },
    });

    if (result.count !== uniqueIds.length) {
      throw new BadRequestException('One or more statutory identifier records could not be found for this employee.');
    }
  }

  private async upsertEmployeeDependent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeeDependentDto,
  ) {
    if (!this.hasDefinedValue(dto)) return;

    const data = {
      fullName: dto.fullName !== undefined ? this.requiredString(dto.fullName, 'dependent.fullName') : undefined,
      relationship: dto.relationship !== undefined ? this.requiredString(dto.relationship, 'dependent.relationship') : undefined,
      dateOfBirth: dto.dateOfBirth !== undefined ? this.toDate(dto.dateOfBirth) ?? null : undefined,
      gender: dto.gender !== undefined ? dto.gender : undefined,
      phone: dto.phone !== undefined ? this.nullableString(dto.phone) : undefined,
      email: dto.email !== undefined ? this.nullableString(dto.email) : undefined,
      taxDependent: dto.taxDependent,
      benefitEligible: dto.benefitEligible,
      isStudent: dto.isStudent,
      isDisabled: dto.isDisabled,
      startsAt: dto.startsAt !== undefined ? this.toDate(dto.startsAt) ?? null : undefined,
      endsAt: dto.endsAt !== undefined ? this.toDate(dto.endsAt) ?? null : undefined,
      metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
    } satisfies Prisma.EmployeeDependentUncheckedUpdateInput;

    if (dto.id) {
      await this.assertEmployeeDependentExists(tx, tenantId, employeeId, dto.id);
      await tx.employeeDependent.update({
        where: { id: dto.id },
        data,
      });
      return;
    }

    await tx.employeeDependent.create({
      data: {
        tenantId,
        employeeId,
        fullName: this.requiredString(dto.fullName, 'dependent.fullName'),
        relationship: this.requiredString(dto.relationship, 'dependent.relationship'),
        dateOfBirth: this.toDate(dto.dateOfBirth),
        gender: dto.gender,
        phone: this.nullableString(dto.phone),
        email: this.nullableString(dto.email),
        taxDependent: dto.taxDependent ?? false,
        benefitEligible: dto.benefitEligible ?? false,
        isStudent: dto.isStudent ?? false,
        isDisabled: dto.isDisabled ?? false,
        startsAt: this.toDate(dto.startsAt),
        endsAt: this.toDate(dto.endsAt),
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  private async upsertEmployeeReference(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeeReferenceDto,
    selfService: boolean,
  ) {
    if (!this.hasDefinedValue(dto)) return;

    const status = selfService ? EmployeeReferenceStatus.PENDING : dto.status;
    const verificationData = this.referenceVerificationData(actor, status);
    const data = {
      type: dto.type,
      name: dto.name !== undefined ? this.requiredString(dto.name, 'reference.name') : undefined,
      relationship: dto.relationship !== undefined ? this.nullableString(dto.relationship) : undefined,
      company: dto.company !== undefined ? this.nullableString(dto.company) : undefined,
      jobTitle: dto.jobTitle !== undefined ? this.nullableString(dto.jobTitle) : undefined,
      email: dto.email !== undefined ? this.nullableString(dto.email) : undefined,
      phone: dto.phone !== undefined ? this.nullableString(dto.phone) : undefined,
      yearsKnown: dto.yearsKnown,
      status,
      note: dto.note !== undefined ? this.nullableString(dto.note) : undefined,
      metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
      ...verificationData,
    } satisfies Prisma.EmployeeReferenceUncheckedUpdateInput;

    if (dto.id) {
      if (selfService) {
        await this.assertSelfServiceReferenceEditable(tx, tenantId, employeeId, dto.id);
      } else {
        await this.assertEmployeeReferenceExists(tx, tenantId, employeeId, dto.id);
      }
      await tx.employeeReference.update({
        where: { id: dto.id },
        data,
      });
      return;
    }

    const createStatus = status ?? EmployeeReferenceStatus.PENDING;
    await tx.employeeReference.create({
      data: {
        tenantId,
        employeeId,
        type: dto.type,
        name: this.requiredString(dto.name, 'reference.name'),
        relationship: this.nullableString(dto.relationship),
        company: this.nullableString(dto.company),
        jobTitle: this.nullableString(dto.jobTitle),
        email: this.nullableString(dto.email),
        phone: this.nullableString(dto.phone),
        yearsKnown: dto.yearsKnown,
        status: createStatus,
        note: this.nullableString(dto.note),
        metadata: this.toJson(dto.metadata),
        ...this.referenceVerificationData(actor, createStatus),
      },
    });
  }

  private async upsertEmployeeReferenceDocument(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeeReferenceDocumentDto,
  ) {
    if (!this.hasDefinedValue(dto)) return;

    if (dto.referenceId) {
      await this.assertEmployeeReferenceExists(tx, tenantId, employeeId, dto.referenceId);
    }

    if (dto.documentId) {
      await this.assertEmployeeDocumentExists(tx, tenantId, employeeId, dto.documentId);
    }

    const data = {
      referenceId: dto.referenceId !== undefined ? this.nullableString(dto.referenceId) : undefined,
      documentId: dto.documentId !== undefined ? this.nullableString(dto.documentId) : undefined,
      fileName: dto.fileName !== undefined ? this.requiredString(dto.fileName, 'referenceDocument.fileName') : undefined,
      fileUrl: dto.fileUrl !== undefined ? this.requiredString(dto.fileUrl, 'referenceDocument.fileUrl') : undefined,
      mimeType: dto.mimeType !== undefined ? this.nullableString(dto.mimeType) : undefined,
      sizeBytes: dto.sizeBytes === undefined ? undefined : Math.round(dto.sizeBytes),
      checksum: dto.checksum !== undefined ? this.nullableString(dto.checksum) : undefined,
      verificationStatus: dto.verificationStatus,
      metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
    } satisfies Prisma.EmployeeReferenceDocumentUncheckedUpdateInput;

    if (dto.id) {
      await this.assertEmployeeReferenceDocumentExists(tx, tenantId, employeeId, dto.id);
      await tx.employeeReferenceDocument.update({
        where: { id: dto.id },
        data,
      });
      return;
    }

    await tx.employeeReferenceDocument.create({
      data: {
        tenantId,
        employeeId,
        referenceId: this.nullableString(dto.referenceId),
        documentId: this.nullableString(dto.documentId),
        fileName: this.requiredString(dto.fileName, 'referenceDocument.fileName'),
        fileUrl: this.requiredString(dto.fileUrl, 'referenceDocument.fileUrl'),
        mimeType: this.nullableString(dto.mimeType),
        sizeBytes: dto.sizeBytes === undefined ? undefined : Math.round(dto.sizeBytes),
        checksum: this.nullableString(dto.checksum),
        verificationStatus: dto.verificationStatus,
        uploadedById: actor.id,
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  private async upsertEmployeeBackgroundCheck(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeeBackgroundCheckDto,
    selfService: boolean,
  ) {
    if (!this.hasDefinedValue(dto)) return;

    if (selfService) {
      throw new BadRequestException('Background checks are managed by authorized HR and compliance teams.');
    }

    const status = dto.status;
    const adjudicationData = this.backgroundCheckAdjudicationData(actor, status);
    const data = {
      provider: dto.provider !== undefined ? this.nullableString(dto.provider) : undefined,
      packageName: dto.packageName !== undefined ? this.nullableString(dto.packageName) : undefined,
      status,
      requestedAt: dto.requestedAt !== undefined ? this.toDate(dto.requestedAt) ?? null : undefined,
      completedAt: dto.completedAt !== undefined ? this.toDate(dto.completedAt) ?? null : undefined,
      expiresAt: dto.expiresAt !== undefined ? this.toDate(dto.expiresAt) ?? null : undefined,
      resultSummary: dto.resultSummary !== undefined ? this.nullableString(dto.resultSummary) : undefined,
      reportUrl: dto.reportUrl !== undefined ? this.nullableString(dto.reportUrl) : undefined,
      metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
      ...adjudicationData,
    } satisfies Prisma.EmployeeBackgroundCheckUncheckedUpdateInput;

    if (dto.id) {
      await this.assertEmployeeBackgroundCheckExists(tx, tenantId, employeeId, dto.id);
      await tx.employeeBackgroundCheck.update({
        where: { id: dto.id },
        data,
      });
      return;
    }

    const createStatus = status ?? EmployeeBackgroundCheckStatus.REQUESTED;
    await tx.employeeBackgroundCheck.create({
      data: {
        tenantId,
        employeeId,
        provider: this.nullableString(dto.provider),
        packageName: this.nullableString(dto.packageName),
        status: createStatus,
        requestedAt: this.toDate(dto.requestedAt) ?? new Date(),
        completedAt: this.toDate(dto.completedAt),
        expiresAt: this.toDate(dto.expiresAt),
        resultSummary: this.nullableString(dto.resultSummary),
        reportUrl: this.nullableString(dto.reportUrl),
        metadata: this.toJson(dto.metadata),
        ...this.backgroundCheckAdjudicationData(actor, createStatus),
      },
    });
  }

  private async upsertEmployeePayoutAccount(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeePayoutAccountDto,
    selfService: boolean,
  ) {
    if (!this.hasDefinedValue(dto)) return;

    if (dto.countryId) {
      await this.assertCountryExists(tx, dto.countryId);
    }

    if (dto.isPrimary) {
      await tx.employeePayoutAccount.updateMany({
        where: { tenantId, employeeId, deletedAt: null, id: dto.id ? { not: dto.id } : undefined },
        data: { isPrimary: false },
      });
    }

    const status = selfService ? PayoutAccountStatus.PENDING_VERIFICATION : dto.status;
    const secureAccount = this.securePaymentValue(tenantId, dto.accountNumber);
    const secureRouting = this.securePaymentValue(tenantId, dto.routingNumber);
    const secureIban = this.securePaymentValue(tenantId, dto.iban);
    const verificationData = this.payoutVerificationData(actor, status);
    const data = {
      accountHolderName:
        dto.accountHolderName !== undefined
          ? this.requiredString(dto.accountHolderName, 'payoutAccount.accountHolderName')
          : undefined,
      bankName: dto.bankName !== undefined ? this.requiredString(dto.bankName, 'payoutAccount.bankName') : undefined,
      accountType: dto.accountType !== undefined ? this.nullableString(dto.accountType) : undefined,
      countryId: dto.countryId !== undefined ? this.nullableString(dto.countryId) : undefined,
      currencyCode: dto.currencyCode !== undefined ? this.nullableString(dto.currencyCode)?.toUpperCase() : undefined,
      accountNumberLast4: secureAccount?.last4,
      accountFingerprint: secureAccount?.fingerprint,
      routingNumberLast4: secureRouting?.last4,
      routingFingerprint: secureRouting?.fingerprint,
      ibanLast4: secureIban?.last4,
      swiftCode: dto.swiftCode !== undefined ? this.nullableString(dto.swiftCode)?.toUpperCase() : undefined,
      allocationPercent: dto.allocationPercent,
      isPrimary: dto.isPrimary,
      status,
      metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
      ...verificationData,
    } satisfies Prisma.EmployeePayoutAccountUncheckedUpdateInput;

    if (dto.id) {
      if (selfService) {
        await this.assertSelfServicePayoutAccountEditable(tx, tenantId, employeeId, dto.id);
      } else {
        await this.assertEmployeePayoutAccountExists(tx, tenantId, employeeId, dto.id);
      }
      await tx.employeePayoutAccount.update({
        where: { id: dto.id },
        data,
      });
      return;
    }

    const createStatus = status ?? PayoutAccountStatus.PENDING_VERIFICATION;
    await tx.employeePayoutAccount.create({
      data: {
        tenantId,
        employeeId,
        accountHolderName: this.requiredString(dto.accountHolderName, 'payoutAccount.accountHolderName'),
        bankName: this.requiredString(dto.bankName, 'payoutAccount.bankName'),
        accountType: this.nullableString(dto.accountType),
        countryId: this.nullableString(dto.countryId),
        currencyCode: this.nullableString(dto.currencyCode)?.toUpperCase(),
        accountNumberLast4: secureAccount?.last4,
        accountFingerprint: secureAccount?.fingerprint,
        routingNumberLast4: secureRouting?.last4,
        routingFingerprint: secureRouting?.fingerprint,
        ibanLast4: secureIban?.last4,
        swiftCode: this.nullableString(dto.swiftCode)?.toUpperCase(),
        allocationPercent: dto.allocationPercent ?? 100,
        isPrimary: dto.isPrimary ?? true,
        status: createStatus,
        metadata: this.toJson(dto.metadata),
        ...this.payoutVerificationData(actor, createStatus),
      },
    });
  }

  private async upsertEmployeeStatutoryIdentifier(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeeStatutoryIdentifierDto,
    selfService: boolean,
  ) {
    if (!this.hasDefinedValue(dto)) return;

    if (dto.countryId) {
      await this.assertCountryExists(tx, dto.countryId);
    }

    const status = selfService ? EmployeeStatutoryIdentifierStatus.PENDING_VERIFICATION : dto.status;
    const secureIdentifier = this.securePaymentValue(tenantId, dto.identifier);
    const verificationData = this.statutoryIdentifierVerificationData(actor, status);
    const data = {
      type: dto.type,
      label: dto.label !== undefined ? this.nullableString(dto.label) : undefined,
      countryId: dto.countryId !== undefined ? this.nullableString(dto.countryId) : undefined,
      identifierLast4: secureIdentifier?.last4,
      identifierFingerprint: secureIdentifier?.fingerprint,
      issuedAt: dto.issuedAt !== undefined ? this.toDate(dto.issuedAt) ?? null : undefined,
      expiresAt: dto.expiresAt !== undefined ? this.toDate(dto.expiresAt) ?? null : undefined,
      status,
      note: dto.note !== undefined ? this.nullableString(dto.note) : undefined,
      metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
      ...verificationData,
    } satisfies Prisma.EmployeeStatutoryIdentifierUncheckedUpdateInput;

    if (dto.id) {
      if (selfService) {
        await this.assertSelfServiceStatutoryIdentifierEditable(tx, tenantId, employeeId, dto.id);
      } else {
        await this.assertEmployeeStatutoryIdentifierExists(tx, tenantId, employeeId, dto.id);
      }
      await tx.employeeStatutoryIdentifier.update({
        where: { id: dto.id },
        data,
      });
      return;
    }

    const createStatus = status ?? EmployeeStatutoryIdentifierStatus.PENDING_VERIFICATION;
    await tx.employeeStatutoryIdentifier.create({
      data: {
        tenantId,
        employeeId,
        type: dto.type ?? EmployeeStatutoryIdentifierType.TAX_ID,
        label: this.nullableString(dto.label),
        countryId: this.nullableString(dto.countryId),
        identifierLast4: secureIdentifier?.last4,
        identifierFingerprint: secureIdentifier?.fingerprint,
        issuedAt: this.toDate(dto.issuedAt),
        expiresAt: this.toDate(dto.expiresAt),
        status: createStatus,
        note: this.nullableString(dto.note),
        metadata: this.toJson(dto.metadata),
        ...this.statutoryIdentifierVerificationData(actor, createStatus),
      },
    });
  }

  private async upsertEmployeeWorkEligibility(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    dto: UpsertEmployeeWorkEligibilityDto,
    selfService: boolean,
  ) {
    if (!this.hasDefinedValue(dto)) return;

    if (selfService) {
      await this.assertSelfServiceWorkEligibilityEditable(tx, tenantId, employeeId);
    }

    if (dto.workCountryId) {
      await this.assertCountryExists(tx, dto.workCountryId);
    }

    if (dto.taxCountryId) {
      await this.assertCountryExists(tx, dto.taxCountryId);
    }

    const status = selfService ? WorkEligibilityStatus.PENDING_REVIEW : dto.status;
    const verificationData = this.workEligibilityVerificationData(actor, status);
    const data = {
      status,
      workCountryId: dto.workCountryId !== undefined ? this.nullableString(dto.workCountryId) : undefined,
      taxCountryId: dto.taxCountryId !== undefined ? this.nullableString(dto.taxCountryId) : undefined,
      workPermitRequired: dto.workPermitRequired,
      permitType: dto.permitType !== undefined ? this.nullableString(dto.permitType) : undefined,
      permitNumber: dto.permitNumber !== undefined ? this.nullableString(dto.permitNumber) : undefined,
      issuedAt: dto.issuedAt !== undefined ? this.toDate(dto.issuedAt) ?? null : undefined,
      expiresAt: dto.expiresAt !== undefined ? this.toDate(dto.expiresAt) ?? null : undefined,
      note: dto.note !== undefined ? this.nullableString(dto.note) : undefined,
      metadata: dto.metadata !== undefined ? this.toJson(dto.metadata) : undefined,
      ...verificationData,
    } satisfies Prisma.EmployeeWorkEligibilityUncheckedUpdateInput;

    await tx.employeeWorkEligibility.upsert({
      where: { employeeId },
      create: {
        tenantId,
        employeeId,
        status: status ?? WorkEligibilityStatus.PENDING_REVIEW,
        workCountryId: this.nullableString(dto.workCountryId),
        taxCountryId: this.nullableString(dto.taxCountryId),
        workPermitRequired: dto.workPermitRequired ?? false,
        permitType: this.nullableString(dto.permitType),
        permitNumber: this.nullableString(dto.permitNumber),
        issuedAt: this.toDate(dto.issuedAt),
        expiresAt: this.toDate(dto.expiresAt),
        note: this.nullableString(dto.note),
        metadata: this.toJson(dto.metadata),
        ...this.workEligibilityVerificationData(actor, status ?? WorkEligibilityStatus.PENDING_REVIEW),
      },
      update: data,
    });
  }

  private referenceVerificationData(
    actor: AuthenticatedPrincipal,
    status?: EmployeeReferenceStatus,
  ): { verifiedAt?: Date | null; verifiedById?: string | null } {
    if (!status) return {};

    if (status === EmployeeReferenceStatus.VERIFIED) {
      return { verifiedAt: new Date(), verifiedById: actor.id };
    }

    return { verifiedAt: null, verifiedById: null };
  }

  private payoutVerificationData(
    actor: AuthenticatedPrincipal,
    status?: PayoutAccountStatus,
  ): { verifiedAt?: Date | null; verifiedById?: string | null } {
    if (!status) return {};

    if (status === PayoutAccountStatus.VERIFIED) {
      return { verifiedAt: new Date(), verifiedById: actor.id };
    }

    return { verifiedAt: null, verifiedById: null };
  }

  private workEligibilityVerificationData(
    actor: AuthenticatedPrincipal,
    status?: WorkEligibilityStatus,
  ): { verifiedAt?: Date | null; verifiedById?: string | null } {
    if (!status) return {};

    if (status === WorkEligibilityStatus.AUTHORIZED || status === WorkEligibilityStatus.EXPIRING_SOON) {
      return { verifiedAt: new Date(), verifiedById: actor.id };
    }

    return { verifiedAt: null, verifiedById: null };
  }

  private backgroundCheckAdjudicationData(
    actor: AuthenticatedPrincipal,
    status?: EmployeeBackgroundCheckStatus,
  ): { adjudicatedAt?: Date | null; adjudicatedById?: string | null } {
    if (!status) return {};

    if (
      status === EmployeeBackgroundCheckStatus.CLEAR ||
      status === EmployeeBackgroundCheckStatus.REVIEW_REQUIRED ||
      status === EmployeeBackgroundCheckStatus.ADVERSE_ACTION
    ) {
      return { adjudicatedAt: new Date(), adjudicatedById: actor.id };
    }

    return { adjudicatedAt: null, adjudicatedById: null };
  }

  private statutoryIdentifierVerificationData(
    actor: AuthenticatedPrincipal,
    status?: EmployeeStatutoryIdentifierStatus,
  ): { verifiedAt?: Date | null; verifiedById?: string | null } {
    if (!status) return {};

    if (status === EmployeeStatutoryIdentifierStatus.VERIFIED) {
      return { verifiedAt: new Date(), verifiedById: actor.id };
    }

    return { verifiedAt: null, verifiedById: null };
  }

  private hasSelfServiceRemovalRequest(dto: UpdateEmployeeExtendedProfileDto) {
    return [
      dto.removeDependentIds,
      dto.removeReferenceIds,
      dto.removeReferenceDocumentIds,
      dto.removeBackgroundCheckIds,
      dto.removePayoutAccountIds,
      dto.removeStatutoryIdentifierIds,
    ].some((ids) => (ids?.length ?? 0) > 0);
  }

  private async assertSelfServiceReferenceEditable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeeReference.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { status: true },
    });

    if (!record) {
      throw new BadRequestException('Reference record was not found for this employee.');
    }

    if (record.status !== EmployeeReferenceStatus.REJECTED) {
      throw new BadRequestException('Submitted reference records are review-only. HR must reject or request a correction before the employee can change them.');
    }
  }

  private async assertSelfServicePayoutAccountEditable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeePayoutAccount.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { status: true },
    });

    if (!record) {
      throw new BadRequestException('Payout account record was not found for this employee.');
    }

    if (record.status !== PayoutAccountStatus.REJECTED && record.status !== PayoutAccountStatus.DRAFT) {
      throw new BadRequestException('Submitted payout records are locked and masked. HR must reject or reopen the record before the employee can change it.');
    }
  }

  private async assertSelfServiceStatutoryIdentifierEditable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeeStatutoryIdentifier.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { status: true },
    });

    if (!record) {
      throw new BadRequestException('Statutory identifier record was not found for this employee.');
    }

    if (
      record.status !== EmployeeStatutoryIdentifierStatus.REJECTED &&
      record.status !== EmployeeStatutoryIdentifierStatus.DRAFT
    ) {
      throw new BadRequestException('Submitted statutory records are locked and masked. HR must reject or reopen the record before the employee can change it.');
    }
  }

  private async assertSelfServiceWorkEligibilityEditable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
  ) {
    const record = await tx.employeeWorkEligibility.findFirst({
      where: { tenantId, employeeId },
      select: { status: true },
    });

    if (!record) return;

    if (record.status !== WorkEligibilityStatus.REJECTED && record.status !== WorkEligibilityStatus.NOT_REVIEWED) {
      throw new BadRequestException('Submitted work eligibility records are review-only. HR must reject or request a correction before the employee can change them.');
    }
  }

  private async assertEmployeeDependentExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeeDependent.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new BadRequestException('Dependent record was not found for this employee.');
    }
  }

  private async assertEmployeeReferenceExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeeReference.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new BadRequestException('Reference record was not found for this employee.');
    }
  }

  private async assertEmployeeReferenceDocumentExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeeReferenceDocument.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new BadRequestException('Reference document record was not found for this employee.');
    }
  }

  private async assertEmployeeBackgroundCheckExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeeBackgroundCheck.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new BadRequestException('Background check record was not found for this employee.');
    }
  }

  private async assertEmployeePayoutAccountExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeePayoutAccount.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new BadRequestException('Payout account record was not found for this employee.');
    }
  }

  private async assertEmployeeStatutoryIdentifierExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    id: string,
  ) {
    const record = await tx.employeeStatutoryIdentifier.findFirst({
      where: { id, tenantId, employeeId, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new BadRequestException('Statutory identifier record was not found for this employee.');
    }
  }

  private async assertEmployeeDocumentExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    documentId: string,
  ) {
    const record = await tx.document.findFirst({
      where: {
        id: documentId,
        tenantId,
        deletedAt: null,
        OR: [{ employeeId }, { employeeId: null }],
      },
      select: { id: true },
    });

    if (!record) {
      throw new BadRequestException('Document record was not found for this employee.');
    }
  }

  private securePaymentValue(tenantId: string, value?: string) {
    const normalized = value?.replace(/\s+/g, '').toUpperCase();

    if (!normalized) return undefined;

    return {
      last4: normalized.slice(-4),
      fingerprint: createHash('sha256').update(`${tenantId}:${normalized}`).digest('hex'),
    };
  }

  private hasDefinedValue(value: object) {
    return Object.entries(value).some(([key, item]) => key !== 'id' && item !== undefined && item !== null && item !== '');
  }

  private async assertCountryExists(
    tx: Prisma.TransactionClient,
    countryId: string,
  ) {
    const country = await tx.country.findUnique({
      where: { id: countryId },
      select: { id: true },
    });

    if (!country) {
      throw new BadRequestException('Country reference was not found.');
    }
  }

  private nullableString(value?: string | null) {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value?.trim() ?? '';
    return trimmed ? trimmed : null;
  }

  private requiredString(value: string | undefined, field: string) {
    const trimmed = value?.trim() ?? '';

    if (!trimmed) {
      throw new BadRequestException(`${field} is required.`);
    }

    return trimmed;
  }

  private effectiveDate(dto: EmployeeLifecycleDto) {
    return this.toDate(dto.effectiveDate) ?? new Date();
  }

  private employeeWhere(tenantId: string, query: ListEmployeesQueryDto): Prisma.EmployeeWhereInput {
    return {
      tenantId,
      status: query.status,
      employmentType: query.employmentType,
      personId: query.personId,
      userId: query.userId,
      deletedAt: query.includeDeleted ? undefined : null,
      hireDate: this.dateRange(query.hiredFrom, query.hiredTo),
      OR: query.search
        ? [
            { employeeNumber: { contains: query.search, mode: 'insensitive' } },
            { source: { contains: query.search, mode: 'insensitive' } },
            { person: { firstName: { contains: query.search, mode: 'insensitive' } } },
            { person: { middleName: { contains: query.search, mode: 'insensitive' } } },
            { person: { lastName: { contains: query.search, mode: 'insensitive' } } },
            { person: { preferredName: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private async employeeVisibilityWhere(
    actor: AuthenticatedPrincipal,
    tenantId: string,
  ): Promise<Prisma.EmployeeWhereInput> {
    if (this.canReadTenantWideWorkforce(actor)) {
      return {};
    }

    const selfWhere = this.selfEmployeeWhere(actor);

    if (!this.hasAnyRole(actor, TEAM_WORKFORCE_ROLES)) {
      return { OR: selfWhere };
    }

    const managerEmployee = await this.prisma.employee.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        OR: selfWhere,
      },
      select: { id: true },
    });

    if (!managerEmployee) {
      return { OR: selfWhere };
    }

    return {
      OR: [
        ...selfWhere,
        {
          assignments: {
            some: {
              managerEmployeeId: managerEmployee.id,
              effectiveTo: null,
            },
          },
        },
      ],
    };
  }

  private withEmployeeVisibility(
    base: Prisma.EmployeeWhereInput,
    visibility: Prisma.EmployeeWhereInput,
  ): Prisma.EmployeeWhereInput {
    return Object.keys(visibility).length > 0 ? { AND: [base, visibility] } : base;
  }

  private selfEmployeeWhere(actor: AuthenticatedPrincipal): Prisma.EmployeeWhereInput[] {
    return [
      { userId: actor.id },
      {
        person: {
          userId: actor.id,
        },
      },
    ];
  }

  private canReadTenantWideWorkforce(actor: AuthenticatedPrincipal) {
    return actor.type === 'PLATFORM_ADMIN' || this.hasAnyRole(actor, TENANT_WIDE_WORKFORCE_ROLES);
  }

  private hasAnyRole(actor: AuthenticatedPrincipal, roles: Set<string>) {
    return actor.roles.some((role) => roles.has(role));
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeNullableFilter | undefined {
    if (!from && !to) {
      return undefined;
    }

    return {
      gte: this.toDate(from),
      lte: this.toDate(to),
    };
  }

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private requireTenant(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }

  private toDate(value?: string): Date | undefined {
    return value ? new Date(value) : undefined;
  }

  private toIsoDate(value?: Date | null) {
    return value?.toISOString().slice(0, 10) ?? '';
  }

  private normalizeCode(code: string) {
    return this.requiredString(code, 'code').toUpperCase().replace(/\s+/g, '_');
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private toJsonObject(value: unknown): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonObject;
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private importBatchIdFromMetadata(value: Prisma.JsonValue | null | undefined) {
    const metadata = this.jsonRecord(value);
    const importMetadata = this.jsonRecord(metadata.import);
    const batchId = importMetadata.batchId ?? metadata.importBatchId;

    return typeof batchId === 'string' ? batchId : null;
  }

  private async assertNoActiveEmployeeImportJob(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const activeJob = await tx.employeeImportJob.findFirst({
      where: {
        tenantId,
        status: {
          in: [EmployeeImportJobStatus.QUEUED, EmployeeImportJobStatus.PROCESSING],
        },
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    if (activeJob) {
      throw new BadRequestException(
        `Employee import ${activeJob.id} is already ${activeJob.status.toLowerCase()} for this tenant.`,
      );
    }
  }

  private async employeeImportJobRowCounts(jobId: string) {
    const grouped = await this.prisma.employeeImportJobRow.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    });
    const count = (status: EmployeeImportRowStatus) =>
      grouped.find((item) => item.status === status)?._count._all ?? 0;

    return {
      pending: count(EmployeeImportRowStatus.PENDING),
      processing: count(EmployeeImportRowStatus.PROCESSING),
      created: count(EmployeeImportRowStatus.CREATED),
      failed: count(EmployeeImportRowStatus.FAILED),
      skipped: count(EmployeeImportRowStatus.SKIPPED),
    };
  }

  private async importActorsById(actorUserIds: string[]) {
    const uniqueIds = [...new Set(actorUserIds)].filter(Boolean);

    if (uniqueIds.length === 0) {
      return new Map<string, EmployeeImportActor>();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    return new Map(users.map((user) => [user.id, user]));
  }

  private importWorkerActor(job: EmployeeImportWorkerJob): AuthenticatedPrincipal {
    return {
      id: job.actorUserId,
      tenantId: job.tenantId,
      email: 'employee-import-worker@timesync.local',
      username: 'employee-import-worker',
      type: 'TENANT_USER',
      status: 'ACTIVE',
      sessionId: `employee-import:${job.id}`,
      roles: [],
      permissions: [],
    };
  }

  private employeeImportRowFromJson(value: Prisma.JsonValue): EmployeeImportNormalizedRow {
    const row = this.jsonRecord(value);
    const employmentType = row.employmentType;
    const status = row.status;

    if (
      typeof row.firstName !== 'string' ||
      typeof row.lastName !== 'string' ||
      typeof employmentType !== 'string' ||
      !Object.values(EmploymentType).includes(employmentType as EmploymentType) ||
      typeof status !== 'string' ||
      !Object.values(EmployeeStatus).includes(status as EmployeeStatus)
    ) {
      throw new BadRequestException('Stored import row is no longer valid.');
    }

    return {
      employeeNumber: typeof row.employeeNumber === 'string' ? row.employeeNumber : null,
      firstName: row.firstName,
      middleName: typeof row.middleName === 'string' ? row.middleName : null,
      lastName: row.lastName,
      preferredName: typeof row.preferredName === 'string' ? row.preferredName : null,
      email: typeof row.email === 'string' ? row.email : null,
      employmentType: employmentType as EmploymentType,
      status: status as EmployeeStatus,
      hireDate: typeof row.hireDate === 'string' ? row.hireDate : null,
      source: typeof row.source === 'string' ? row.source : 'CSV_IMPORT',
    };
  }

  private committedEmployeeFromImportRow(row: EmployeeImportCommittedRow): EmployeeImportCommittedEmployee {
    const normalized = this.employeeImportRowFromJson(row.normalized);

    return {
      line: row.line,
      id: row.employeeId ?? '',
      personId: row.personId ?? '',
      employeeNumber: row.employeeNumber ?? '',
      status: normalized.status,
    };
  }

  private importBatchFromJob(
    job: EmployeeImportJobWithRows,
    actor: EmployeeImportActor | null,
  ): EmployeeImportBatch {
    const employees = job.rows
      .filter((row) => row.status === EmployeeImportRowStatus.CREATED)
      .map((row) => this.committedEmployeeFromImportRow(row));
    const employeeIds = employees.map((employee) => employee.id).filter(Boolean);

    return {
      id: job.id,
      status: job.status,
      rows: job.totalRows,
      created: job.createdRows || employees.length,
      failed: job.failedRows,
      skipped: job.skippedRows,
      processed: job.processedRows,
      employeeIds,
      employees,
      metadata: job.metadata,
      committedAt: (job.completedAt ?? job.createdAt).toISOString(),
      queuedAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      committedBy: actor,
    };
  }

  private importBatchFromActivity(activity: EmployeeImportBatchActivity): EmployeeImportBatch | null {
    const metadata = this.jsonRecord(activity.metadata);
    const importBatchId = metadata.importBatchId;

    if (typeof importBatchId !== 'string') {
      return null;
    }

    const employees = Array.isArray(metadata.employees)
      ? (metadata.employees as EmployeeImportCommittedEmployee[])
      : [];
    const employeeIds = Array.isArray(metadata.employeeIds)
      ? metadata.employeeIds.filter((employeeId): employeeId is string => typeof employeeId === 'string')
      : employees.map((employee) => employee.id);

    return {
      id: importBatchId,
      status: EmployeeImportJobStatus.COMPLETED,
      rows: Number(metadata.rows ?? employees.length),
      created: Number(metadata.created ?? employees.length),
      failed: Number(metadata.failed ?? 0),
      skipped: Number(metadata.skipped ?? 0),
      processed: Number(metadata.created ?? employees.length),
      employeeIds,
      employees,
      metadata: metadata.metadata ?? null,
      committedAt: activity.createdAt.toISOString(),
      queuedAt: activity.createdAt.toISOString(),
      completedAt: activity.createdAt.toISOString(),
      committedBy: activity.user
        ? {
            id: activity.user.id,
            email: activity.user.email,
            username: activity.user.username,
          }
        : null,
    };
  }

  private stringifyCsv(rows: Array<Record<string, unknown>>) {
    const headers = rows[0]
      ? Object.keys(rows[0])
      : [
          'employeeNumber',
          'firstName',
          'middleName',
          'lastName',
          'preferredName',
          'email',
          'status',
          'employmentType',
          'hireDate',
          'confirmationDate',
          'endDate',
          'positionCode',
          'positionTitle',
          'organizationNode',
          'costCenter',
          'managerEmployeeNumber',
        ];
    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => this.csvCell(row[header])).join(',')),
    ];

    return `${lines.join('\n')}\n`;
  }

  private csvCell(value: unknown) {
    const text =
      value === null || value === undefined
        ? ''
        : typeof value === 'string'
          ? value
            : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
              ? String(value)
              : value instanceof Date
                ? value.toISOString()
                : JSON.stringify(value) ?? '';

    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  private async validateEmployeeImport(tenantId: string, csv: string): Promise<EmployeeImportValidation> {
    const parsedRows = this.parseCsv(csv);
    const rowNumbers = new Set<string>();
    const employeeNumbers = parsedRows
      .map((row) => row.employeeNumber?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => this.normalizeEmployeeNumber(value));
    const existingEmployeeNumbers = new Set(
      (
        await this.prisma.employee.findMany({
          where: {
            tenantId,
            employeeNumber: {
              in: [...new Set(employeeNumbers)],
            },
          },
          select: {
            employeeNumber: true,
          },
        })
      ).map((employee) => employee.employeeNumber),
    );
    const allRows = parsedRows.map((row, index): EmployeeImportPreviewRow => {
      const line = index + 2;
      const errors: string[] = [];
      const employeeNumber = row.employeeNumber
        ? this.normalizeEmployeeNumber(row.employeeNumber)
        : '';
      const employmentType = row.employmentType?.trim().toUpperCase();
      const status = row.status?.trim().toUpperCase() || EmployeeStatus.PREBOARDING;

      if (!row.firstName?.trim()) errors.push('firstName is required.');
      if (!row.lastName?.trim()) errors.push('lastName is required.');
      if (!employmentType) errors.push('employmentType is required.');
      if (employmentType && !Object.values(EmploymentType).includes(employmentType as EmploymentType)) {
        errors.push(`employmentType ${employmentType} is not supported.`);
      }
      if (status && !Object.values(EmployeeStatus).includes(status as EmployeeStatus)) {
        errors.push(`status ${status} is not supported.`);
      }
      if (row.email && !this.looksLikeEmail(row.email)) {
        errors.push('email is not valid.');
      }
      if (employeeNumber) {
        if (rowNumbers.has(employeeNumber)) {
          errors.push(`employeeNumber ${employeeNumber} is duplicated in this file.`);
        }
        if (existingEmployeeNumbers.has(employeeNumber)) {
          errors.push(`employeeNumber ${employeeNumber} already exists in this tenant.`);
        }
        rowNumbers.add(employeeNumber);
      }
      if (row.hireDate && Number.isNaN(new Date(row.hireDate).getTime())) {
        errors.push('hireDate is not a valid date.');
      }

      return {
        line,
        valid: errors.length === 0,
        errors,
        normalized: {
          employeeNumber: employeeNumber || null,
          firstName: row.firstName?.trim() ?? '',
          middleName: row.middleName?.trim() || null,
          lastName: row.lastName?.trim() ?? '',
          preferredName: row.preferredName?.trim() || null,
          email: row.email?.trim().toLowerCase() || null,
          employmentType: (employmentType as EmploymentType | undefined) ?? EmploymentType.FULL_TIME,
          status: (status as EmployeeStatus | undefined) ?? EmployeeStatus.PREBOARDING,
          hireDate: row.hireDate?.trim() || null,
          source: row.source?.trim() || 'CSV_IMPORT',
        },
      };
    });
    const invalidRows = allRows.filter((row) => !row.valid);

    return {
      rows: parsedRows.length,
      validRows: allRows.length - invalidRows.length,
      invalidRows: invalidRows.length,
      errors: invalidRows.flatMap((row) =>
        row.errors.map((message) => ({ line: row.line, message })),
      ),
      preview: allRows.slice(0, 25),
      allRows,
      acceptedHeaders: [
        'employeeNumber',
        'firstName',
        'middleName',
        'lastName',
        'preferredName',
        'email',
        'employmentType',
        'status',
        'hireDate',
        'source',
      ],
    };
  }

  private parseCsv(csv: string) {
    const rows: string[][] = [];
    let current = '';
    let row: string[] = [];
    let quoted = false;

    for (let index = 0; index < csv.length; index += 1) {
      const char = csv[index];
      const next = csv[index + 1];

      if (char === '"' && quoted && next === '"') {
        current += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        quoted = !quoted;
        continue;
      }

      if (char === ',' && !quoted) {
        row.push(current);
        current = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') {
          index += 1;
        }
        row.push(current);
        current = '';
        if (row.some((cell) => cell.trim())) {
          rows.push(row);
        }
        row = [];
        continue;
      }

      current += char;
    }

    row.push(current);
    if (row.some((cell) => cell.trim())) {
      rows.push(row);
    }

    const [headers = [], ...dataRows] = rows;
    const normalizedHeaders = headers.map((header) => header.trim());

    return dataRows.map((cells) =>
      Object.fromEntries(
        normalizedHeaders.map((header, index) => [header, cells[index]?.trim() ?? '']),
      ) as Record<string, string>,
    );
  }

  private looksLikeEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  private get lifecycleTemplateTaskInclude() {
    return {
      documentType: {
        select: {
          id: true,
          code: true,
          name: true,
          requiresExpiry: true,
          requiresVerification: true,
        },
      },
      template: {
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          type: true,
          status: true,
        },
      },
    } satisfies Prisma.EmployeeLifecycleTemplateTaskInclude;
  }

  private get lifecycleTemplateInclude() {
    return {
      createdBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      tasks: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          documentType: {
            select: {
              id: true,
              code: true,
              name: true,
              requiresExpiry: true,
              requiresVerification: true,
            },
          },
        },
      },
    } satisfies Prisma.EmployeeLifecycleTemplateInclude;
  }

  private get lifecycleTaskInclude() {
    return {
      plan: {
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
        },
      },
      assignedUser: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      assignedEmployee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
      completedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      waivedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.EmployeeLifecycleTaskInclude;
  }

  private get lifecyclePlanInclude() {
    return {
      createdBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      tasks: {
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        include: this.lifecycleTaskInclude,
      },
    } satisfies Prisma.EmployeeLifecyclePlanInclude;
  }

  private get clearanceItemInclude() {
    return {
      ownerUser: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      ownerEmployee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
      clearedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.EmployeeClearanceItemInclude;
  }

  private get rehireRecordInclude() {
    return {
      exitRecord: {
        select: {
          id: true,
          status: true,
          separationDate: true,
          eligibleForRehire: true,
        },
      },
      newEmployee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
      approvedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.EmployeeRehireRecordInclude;
  }

  private get exitRecordInclude() {
    return {
      lifecyclePlan: {
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
          targetDate: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      completedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      clearanceItems: {
        where: { deletedAt: null },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
        include: this.clearanceItemInclude,
      },
      rehireRecords: {
        orderBy: [{ createdAt: 'desc' }],
        include: this.rehireRecordInclude,
      },
    } satisfies Prisma.EmployeeExitRecordInclude;
  }

  private get employmentTermInclude() {
    return {
      grade: true,
      level: true,
      position: true,
      organizationNode: true,
      costCenter: true,
      document: {
        select: {
          id: true,
          title: true,
          verificationStatus: true,
          expiresAt: true,
        },
      },
      workflowRequest: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.EmployeeEmploymentTermInclude;
  }

  private get compensationComponentInclude() {
    return {
      term: {
        select: {
          id: true,
          title: true,
          reference: true,
          status: true,
        },
      },
    } satisfies Prisma.EmployeeCompensationComponentInclude;
  }

  private get compensationChangeInclude() {
    return {
      term: {
        select: {
          id: true,
          title: true,
          reference: true,
          status: true,
        },
      },
      workflowRequest: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      initiatedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.EmployeeCompensationChangeInclude;
  }

  private get reportingRelationshipInclude() {
    return {
      relatedEmployee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
          leadershipDesignations: {
            where: { isActive: true },
            include: { organizationNode: true },
          },
        },
      },
      organizationNode: true,
      position: true,
    } satisfies Prisma.EmployeeReportingRelationshipInclude;
  }

  private get employeeListInclude() {
    return {
      person: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          preferredName: true,
          photoUrl: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          status: true,
        },
      },
      assignments: {
        where: { effectiveTo: null },
        orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'desc' }],
        take: 5,
        include: {
          position: true,
          organizationNode: true,
          costCenter: true,
          managerEmployee: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
          supervisorEmployee: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
          unitHeadEmployee: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
        },
      },
      leadershipDesignations: {
        where: { isActive: true },
        include: { organizationNode: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      },
    } satisfies Prisma.EmployeeInclude;
  }

  private get employeeInclude() {
    return {
      person: {
        include: {
          nationality: true,
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { type: 'asc' }, { createdAt: 'asc' }],
          },
          addresses: {
            include: { country: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
          emergencyContacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
          demographicProfile: {
            include: {
              demographicCountry: true,
              verifiedBy: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
            },
          },
          skills: {
            include: { skill: true },
            orderBy: [{ createdAt: 'desc' }],
          },
          languages: {
            orderBy: [{ languageCode: 'asc' }],
          },
          certifications: {
            orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
          },
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          status: true,
          type: true,
          lastLoginAt: true,
        },
      },
      assignments: {
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        include: {
          position: true,
          organizationNode: true,
          costCenter: true,
          managerEmployee: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
          supervisorEmployee: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
          unitHeadEmployee: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
          grade: true,
          level: true,
        },
      },
      leadershipDesignations: {
        where: { isActive: true },
        include: { organizationNode: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      },
      dependents: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
      },
      references: {
        where: { deletedAt: null },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          documents: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: 'desc' }],
          },
          verifiedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      referenceDocuments: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
      },
      backgroundChecks: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          adjudicatedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      payoutAccounts: {
        where: { deletedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { status: 'asc' }, { createdAt: 'desc' }],
        include: {
          country: true,
          verifiedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      statutoryIdentifiers: {
        where: { deletedAt: null },
        orderBy: [{ type: 'asc' }, { status: 'asc' }, { createdAt: 'desc' }],
        include: {
          country: true,
          verifiedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      lifecyclePlans: {
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 8,
        include: {
          tasks: {
            orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
            include: {
              assignedUser: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
              assignedEmployee: {
                include: {
                  person: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      preferredName: true,
                    },
                  },
                },
              },
              completedBy: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
            },
          },
        },
      },
      lifecycleTasks: {
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 20,
        include: {
          plan: {
            select: {
              id: true,
              type: true,
              status: true,
              title: true,
            },
          },
          assignedUser: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
          assignedEmployee: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
          completedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      workEligibility: {
        include: {
          workCountry: true,
          taxCountry: true,
          verifiedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      employmentTerms: {
        where: { deletedAt: null },
        orderBy: [{ status: 'asc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        include: this.employmentTermInclude,
      },
      compensationComponents: {
        where: { deletedAt: null },
        orderBy: [{ type: 'asc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        include: this.compensationComponentInclude,
      },
      compensationChanges: {
        orderBy: [{ createdAt: 'desc' }],
        take: 10,
        include: this.compensationChangeInclude,
      },
      reportingRelationships: {
        where: { deletedAt: null },
        orderBy: [{ status: 'asc' }, { startsAt: 'desc' }, { createdAt: 'desc' }],
        include: this.reportingRelationshipInclude,
      },
      exitRecords: {
        where: { deletedAt: null },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 6,
        include: this.exitRecordInclude,
      },
      clearanceItems: {
        where: { deletedAt: null },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 20,
        include: this.clearanceItemInclude,
      },
      rehireRecords: {
        orderBy: [{ createdAt: 'desc' }],
        take: 10,
        include: this.rehireRecordInclude,
      },
      workforceActions: {
        orderBy: [{ createdAt: 'desc' }],
        take: 10,
        include: {
          initiatedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
          history: {
            orderBy: [{ createdAt: 'asc' }],
          },
        },
      },
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 20,
      },
    } satisfies Prisma.EmployeeInclude;
  }

  private get selfServiceDocumentInclude() {
    return {
      documentType: true,
      currentVersion: {
        select: {
          id: true,
          versionNo: true,
          fileName: true,
          fileUrl: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
      versions: {
        orderBy: [{ versionNo: 'desc' }],
        take: 3,
        select: {
          id: true,
          versionNo: true,
          fileName: true,
          fileUrl: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
    } satisfies Prisma.DocumentInclude;
  }

  private get employeeSelfServiceInclude() {
    return {
      ...this.employeeInclude,
      documents: {
        where: {
          deletedAt: null,
          visibility: {
            in: [DocumentVisibility.EMPLOYEE_VISIBLE, DocumentVisibility.PUBLIC_INTERNAL],
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        include: this.selfServiceDocumentInclude,
      },
    } satisfies Prisma.EmployeeInclude;
  }

  private get importBatchActivityInclude() {
    return {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.ActivityLogInclude;
  }
}

type EmployeeStateSource = {
  id: string;
  personId: string;
  userId: string | null;
  employeeNumber: string;
  status: EmployeeStatus;
  employmentType: string;
  hireDate: Date | null;
  confirmationDate: Date | null;
  endDate: Date | null;
  separationReason: string | null;
  source: string | null;
  deletedAt: Date | null;
};

type EmployeeMasterDataSource = EmployeeStateSource & {
  person?: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    preferredName: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    maritalStatus: string | null;
    nationalityId: string | null;
    photoUrl: string | null;
    bloodGroup: string | null;
    disabilityStatus: string | null;
    veteranStatus: string | null;
    bio: string | null;
    contacts?: Array<{
      id: string;
      type: string;
      value: string;
      label: string | null;
      isPrimary: boolean;
    }>;
    addresses?: Array<{
      id: string;
      type: string | null;
      line1: string | null;
      city: string | null;
      countryId: string | null;
    }>;
    emergencyContacts?: Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      isPrimary: boolean;
    }>;
    demographicProfile?: {
      pronouns: string | null;
      genderIdentity: string | null;
      sexAssignedAtBirth: string | null;
      sexualOrientation: string | null;
      race: string | null;
      preferredLanguageCode: string | null;
      primaryLanguageCode: string | null;
      ethnicity: string | null;
      ethnicityDetail: string | null;
      religion: string | null;
      religionDetail: string | null;
      demographicCountryId: string | null;
      caregiverStatus: string | null;
      disabilityAccommodation: string | null;
      accommodationRequired: boolean | null;
      veteranCategory: string | null;
      consentSource: string | null;
      consentNote: string | null;
      consentGivenAt: Date | null;
      consentWithdrawnAt: Date | null;
      verifiedAt: Date | null;
      verifiedById: string | null;
    } | null;
  };
  assignments?: Array<{
    isPrimary?: boolean | null;
    effectiveTo?: Date | null;
    positionId?: string | null;
    organizationNodeId?: string | null;
    costCenterId?: string | null;
    managerEmployeeId?: string | null;
  }>;
  references?: Array<{
    id: string;
    type: string;
    relationship: string | null;
    company: string | null;
    status: EmployeeReferenceStatus;
    verifiedAt: Date | null;
    verifiedById: string | null;
    deletedAt?: Date | null;
  }>;
  referenceDocuments?: Array<{
    id: string;
    referenceId: string | null;
    documentId: string | null;
    fileName: string;
    fileUrl: string;
    verificationStatus: string;
    deletedAt?: Date | null;
  }>;
  backgroundChecks?: Array<{
    id: string;
    provider: string | null;
    packageName: string | null;
    status: EmployeeBackgroundCheckStatus;
    requestedAt: Date | null;
    completedAt: Date | null;
    expiresAt: Date | null;
    adjudicatedAt: Date | null;
    adjudicatedById: string | null;
    deletedAt?: Date | null;
  }>;
  payoutAccounts?: Array<{
    id: string;
    bankName: string;
    accountType: string | null;
    countryId: string | null;
    currencyCode: string | null;
    accountNumberLast4: string | null;
    routingNumberLast4: string | null;
    ibanLast4: string | null;
    allocationPercent: number;
    isPrimary: boolean;
    status: PayoutAccountStatus;
    verifiedAt: Date | null;
    verifiedById: string | null;
    deletedAt?: Date | null;
  }>;
  statutoryIdentifiers?: Array<{
    id: string;
    type: EmployeeStatutoryIdentifierType;
    label: string | null;
    countryId: string | null;
    identifierLast4: string | null;
    issuedAt: Date | null;
    expiresAt: Date | null;
    status: EmployeeStatutoryIdentifierStatus;
    verifiedAt: Date | null;
    verifiedById: string | null;
    deletedAt?: Date | null;
  }>;
  workEligibility?: {
    status: WorkEligibilityStatus;
    workCountryId: string | null;
    taxCountryId: string | null;
    workPermitRequired: boolean;
    permitType: string | null;
    issuedAt: Date | null;
    expiresAt: Date | null;
    verifiedAt: Date | null;
    verifiedById: string | null;
  } | null;
  employmentTerms?: Array<{
    id: string;
    contractType: EmploymentContractType;
    status: EmploymentTermStatus;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    deletedAt?: Date | null;
  }>;
  reportingRelationships?: Array<{
    id: string;
    relatedEmployeeId: string;
    type: ReportingRelationshipType;
    status: ReportingRelationshipStatus;
    startsAt: Date;
    endsAt: Date | null;
    deletedAt?: Date | null;
  }>;
};

type EmployeeExtendedProfileSource = EmployeeMasterDataSource & {
  dependents?: Array<{
    id: string;
    fullName: string;
    relationship: string;
    dateOfBirth: Date | null;
    gender: string | null;
    phone: string | null;
    email: string | null;
    taxDependent: boolean;
    benefitEligible: boolean;
    isStudent: boolean;
    isDisabled: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    deletedAt?: Date | null;
  }>;
};

type LeadershipDesignationStateSource = {
  id: string;
  employeeId: string;
  role: WorkforceLeadershipRole;
  organizationNodeId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  reason: string | null;
  metadata: Prisma.JsonValue | null;
  organizationNode?: {
    id: string;
    code: string;
    name: string;
  } | null;
};

type EmploymentTermStateSource = {
  id: string;
  contractType: EmploymentContractType;
  status: EmploymentTermStatus;
  title: string | null;
  reference: string | null;
  payFrequency: PayFrequency | null;
  currencyCode: string | null;
  baseAmount: unknown;
  gradeId: string | null;
  levelId: string | null;
  positionId: string | null;
  organizationNodeId: string | null;
  costCenterId: string | null;
  documentId: string | null;
  workflowRequestId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  approvedAt: Date | null;
  approvedById: string | null;
};

type CompensationComponentStateSource = {
  id: string;
  termId: string | null;
  type: CompensationComponentType;
  name: string;
  amount: unknown;
  currencyCode: string | null;
  frequency: PayFrequency | null;
  taxable: boolean;
  status: CompensationChangeStatus;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type CompensationChangeStateSource = {
  id: string;
  termId: string | null;
  status: CompensationChangeStatus;
  effectiveDate: Date;
  reason: string | null;
  previousState: Prisma.JsonValue | null;
  proposedState: Prisma.JsonValue;
  finalState: Prisma.JsonValue | null;
  workflowRequestId: string | null;
  initiatedById: string | null;
  approvedAt: Date | null;
  approvedById: string | null;
  appliedAt: Date | null;
};

type ReportingRelationshipStateSource = {
  id: string;
  employeeId: string;
  relatedEmployeeId: string;
  type: ReportingRelationshipType;
  status: ReportingRelationshipStatus;
  organizationNodeId: string | null;
  positionId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  reason: string | null;
};

type TransitionOptions = {
  dto: EmployeeLifecycleDto;
  targetStatus: EmployeeStatus;
  type: WorkforceActionType;
  eventType: TimelineEventType;
  auditAction: AuditAction;
  eventTitle: string;
  outboxEvent: string;
  data: Prisma.EmployeeUpdateInput;
  includeDeleted?: boolean;
  allowedCurrentStatuses?: EmployeeStatus[];
  disallowedCurrentStatuses?: EmployeeStatus[];
};

type EmployeeImportNormalizedRow = {
  employeeNumber: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  hireDate: string | null;
  source: string;
};

type EmployeeImportPreviewRow = {
  line: number;
  valid: boolean;
  errors: string[];
  normalized: EmployeeImportNormalizedRow;
};

type EmployeeImportValidation = {
  rows: number;
  validRows: number;
  invalidRows: number;
  errors: Array<{ line: number; message: string }>;
  preview: EmployeeImportPreviewRow[];
  allRows: EmployeeImportPreviewRow[];
  acceptedHeaders: string[];
};

type EmployeeImportCommittedEmployee = {
  line: number;
  id: string;
  personId: string;
  employeeNumber: string;
  status: EmployeeStatus;
};

type EmployeeImportActor = {
  id: string;
  email: string;
  username: string | null;
};

type EmployeeImportBatchActivity = {
  id: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  user?: {
    id: string;
    email: string;
    username: string | null;
  } | null;
};

type EmployeeImportBatch = {
  id: string;
  status: EmployeeImportJobStatus;
  rows: number;
  processed: number;
  created: number;
  failed: number;
  skipped: number;
  employeeIds: string[];
  employees: EmployeeImportCommittedEmployee[];
  metadata: unknown;
  committedAt: string;
  queuedAt: string;
  completedAt: string | null;
  committedBy: EmployeeImportActor | null;
};

type EmployeeImportWorkerJob = {
  id: string;
  tenantId: string;
  actorUserId: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

type EmployeeImportWorkerRow = {
  id: string;
  line: number;
  normalized: Prisma.JsonValue;
};

type EmployeeImportCommittedRow = {
  line: number;
  status: EmployeeImportRowStatus;
  normalized: Prisma.JsonValue;
  employeeId: string | null;
  personId: string | null;
  employeeNumber: string | null;
};

type EmployeeImportJobWithRows = {
  id: string;
  status: EmployeeImportJobStatus;
  totalRows: number;
  processedRows: number;
  createdRows: number;
  failedRows: number;
  skippedRows: number;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  completedAt: Date | null;
  rows: EmployeeImportCommittedRow[];
};

type EmployeeImportRollbackBlocked = {
  employeeId: string;
  employeeNumber: string;
  reason: string;
};
