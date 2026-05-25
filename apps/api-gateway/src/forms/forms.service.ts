import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  EmployeeStatus,
  FormAssignmentStatus,
  FormQuestionType,
  FormStatus,
  NotificationChannel,
  NotificationStatus,
  TimelineEventType,
  type Employee,
  type Form,
  type FormAssignment,
  type FormQuestion,
  type Prisma,
  type User,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { AssignFormDto } from './dto/assign-form.dto';
import { CreateFormDto } from './dto/create-form.dto';
import {
  ListFormResponsesQueryDto,
  ListFormsQueryDto,
  ListMyFormAssignmentsQueryDto,
} from './dto/list-forms-query.dto';
import { SubmitFormResponseDto } from './dto/submit-form-response.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { UpsertFormQuestionDto } from './dto/form-question.dto';

type AssignmentTarget = {
  employeeId: string | null;
  userId: string | null;
  email: string | null;
  name: string;
};

type StoredAnswer = {
  questionId: string;
  title: string;
  type: FormQuestionType;
  value: Prisma.InputJsonValue;
};

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForm(actor: AuthenticatedPrincipal, dto: CreateFormDto) {
    const tenantId = this.requireTenant(actor);
    const status = dto.status ?? FormStatus.DRAFT;
    const questions = this.normalizeQuestions(dto.questions);

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          code: dto.code ? this.normalizeCode(dto.code) : undefined,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          status,
          anonymous: dto.anonymous ?? false,
          allowMultipleResponses: dto.allowMultipleResponses ?? false,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
          publishedAt: status === FormStatus.PUBLISHED ? new Date() : undefined,
          metadata: this.toJson(dto.metadata),
          createdById: actor.id,
          updatedById: actor.id,
          questions: {
            create: questions,
          },
        },
        include: this.formInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Form', form.id, null, {
        title: form.title,
        status: form.status,
        questionCount: form.questions.length,
      });
      await this.enqueueOutbox(tx, tenantId, 'form.created', 'Form', form.id, {
        formId: form.id,
        title: form.title,
        status: form.status,
      });

      return form;
    });
  }

  async listForms(actor: AuthenticatedPrincipal, query: ListFormsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const forms = await this.prisma.form.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: query.status,
        OR: query.search
          ? [
              { title: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: {
        _count: {
          select: {
            questions: true,
            assignments: true,
            responses: true,
          },
        },
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    return this.paginate(forms, limit);
  }

  async getForm(actor: AuthenticatedPrincipal, formId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findFormForAdminOrThrow(this.prisma, tenantId, formId);
  }

  async updateForm(actor: AuthenticatedPrincipal, formId: string, dto: UpdateFormDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findFormForAdminOrThrow(tx, tenantId, formId);

      if (dto.questions) {
        const responseCount = await tx.formResponse.count({ where: { formId: existing.id } });
        if (responseCount > 0) {
          throw new BadRequestException(
            'Questions cannot be replaced after responses exist. Archive this form and create a new version.',
          );
        }
      }

      await tx.form.update({
        where: { id: existing.id },
        data: {
          code: dto.code ? this.normalizeCode(dto.code) : undefined,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          status: dto.status,
          anonymous: dto.anonymous,
          allowMultipleResponses: dto.allowMultipleResponses,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
          metadata: this.toJson(dto.metadata),
          updatedById: actor.id,
          publishedAt:
            dto.status === FormStatus.PUBLISHED && existing.publishedAt === null
              ? new Date()
              : undefined,
        },
      });

      if (dto.questions) {
        await tx.formQuestion.deleteMany({ where: { formId: existing.id } });
        await tx.formQuestion.createMany({
          data: this.normalizeQuestions(dto.questions).map((question) => ({
            ...question,
            formId: existing.id,
          })),
        });
      }

      const updated = await this.findFormForAdminOrThrow(tx, tenantId, formId);
      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'Form',
        updated.id,
        this.formState(existing),
        this.formState(updated),
      );
      await this.enqueueOutbox(tx, tenantId, 'form.updated', 'Form', updated.id, {
        formId: updated.id,
        title: updated.title,
        status: updated.status,
      });

      return updated;
    });
  }

  async publishForm(actor: AuthenticatedPrincipal, formId: string) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findFormForAdminOrThrow(tx, tenantId, formId);
      if (existing.questions.length === 0) {
        throw new BadRequestException('A form requires at least one question before publishing.');
      }

      const updated = await tx.form.update({
        where: { id: existing.id },
        data: {
          status: FormStatus.PUBLISHED,
          publishedAt: existing.publishedAt ?? new Date(),
          archivedAt: null,
          updatedById: actor.id,
        },
        include: this.formInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.ACTIVATE, 'Form', updated.id, this.formState(existing), this.formState(updated));
      await this.enqueueOutbox(tx, tenantId, 'form.published', 'Form', updated.id, {
        formId: updated.id,
        title: updated.title,
      });

      return updated;
    });
  }

  async archiveForm(actor: AuthenticatedPrincipal, formId: string) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findFormForAdminOrThrow(tx, tenantId, formId);
      const updated = await tx.form.update({
        where: { id: existing.id },
        data: {
          status: FormStatus.ARCHIVED,
          archivedAt: new Date(),
          updatedById: actor.id,
        },
        include: this.formInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.ARCHIVE, 'Form', updated.id, this.formState(existing), this.formState(updated));
      await this.enqueueOutbox(tx, tenantId, 'form.archived', 'Form', updated.id, {
        formId: updated.id,
        title: updated.title,
      });

      return updated;
    });
  }

  async assignForm(actor: AuthenticatedPrincipal, formId: string, dto: AssignFormDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const form = await this.findFormForAdminOrThrow(tx, tenantId, formId);
      if (form.status !== FormStatus.PUBLISHED) {
        throw new BadRequestException('Only published forms can be assigned.');
      }
      if (form.closesAt && form.closesAt <= new Date()) {
        throw new BadRequestException('This form is already closed.');
      }

      const targets = await this.resolveAssignmentTargets(tx, tenantId, dto);
      if (targets.length === 0) {
        throw new BadRequestException('At least one employee or user target is required.');
      }

      const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      const assignments: FormAssignment[] = [];

      for (const target of targets) {
        const existing = await tx.formAssignment.findFirst({
          where: {
            tenantId,
            formId: form.id,
            employeeId: target.employeeId,
            userId: target.userId,
            status: { notIn: [FormAssignmentStatus.CANCELLED, FormAssignmentStatus.EXPIRED] },
          },
        });

        const assignment = existing
          ? await tx.formAssignment.update({
              where: { id: existing.id },
              data: {
                dueAt,
                status:
                  existing.status === FormAssignmentStatus.SUBMITTED
                    ? existing.status
                    : FormAssignmentStatus.ASSIGNED,
                sentAt: new Date(),
                assignedById: actor.id,
                metadata: this.toJson(dto.metadata),
              },
            })
          : await tx.formAssignment.create({
              data: {
                tenantId,
                formId: form.id,
                employeeId: target.employeeId,
                userId: target.userId,
                assignedById: actor.id,
                dueAt,
                sentAt: new Date(),
                metadata: this.toJson(dto.metadata),
              },
            });

        assignments.push(assignment);

        if (target.employeeId) {
          await tx.timelineEvent.create({
            data: {
              tenantId,
              employeeId: target.employeeId,
              actorUserId: actor.id,
              type: TimelineEventType.FORM_ASSIGNED,
              title: 'Form assigned',
              description: `${form.title} was assigned to ${target.name}.`,
              entityType: 'FormAssignment',
              entityId: assignment.id,
              data: this.toJson({ formId: form.id, formTitle: form.title }),
            },
          });
        }
      }

      if (dto.notifyRecipients ?? true) {
        await this.createAssignmentNotification(tx, tenantId, form, assignments, targets, dto.message);
      }

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'FormAssignment', form.id, null, {
        formId: form.id,
        title: form.title,
        assignmentCount: assignments.length,
      });
      await this.enqueueOutbox(tx, tenantId, 'form.assigned', 'Form', form.id, {
        formId: form.id,
        title: form.title,
        assignmentIds: assignments.map((assignment) => assignment.id),
      });

      return {
        formId: form.id,
        assigned: assignments.length,
        assignments,
      };
    });
  }

  async listResponses(
    actor: AuthenticatedPrincipal,
    formId: string,
    query: ListFormResponsesQueryDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const form = await this.findFormForAdminOrThrow(this.prisma, tenantId, formId);
    const limit = query.limit ?? 50;
    const responses = await this.prisma.formResponse.findMany({
      where: { tenantId, formId: form.id },
      include: {
        employee: {
          include: {
            person: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
        assignment: true,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
    });

    const page = this.paginate(responses, limit);
    if (!form.anonymous) {
      return page;
    }

    return {
      ...page,
      data: page.data.map((response) => ({
        ...response,
        employee: null,
        user: null,
        respondentEmail: null,
      })),
    };
  }

  async responseSummary(actor: AuthenticatedPrincipal, formId: string) {
    const tenantId = this.requireTenant(actor);
    const form = await this.findFormForAdminOrThrow(this.prisma, tenantId, formId);
    const responses = await this.prisma.formResponse.findMany({
      where: { tenantId, formId: form.id },
      select: {
        id: true,
        submittedAt: true,
        answers: true,
      },
      orderBy: { submittedAt: 'asc' },
      take: 5000,
    });
    const assignments = await this.prisma.formAssignment.groupBy({
      by: ['status'],
      where: { tenantId, formId: form.id },
      _count: { _all: true },
    });
    const questions = form.questions.map((question) => this.questionSummary(question, responses));

    return {
      form: {
        id: form.id,
        title: form.title,
        status: form.status,
        anonymous: form.anonymous,
        allowMultipleResponses: form.allowMultipleResponses,
      },
      totals: {
        questions: form.questions.length,
        assignments: assignments.reduce((sum, row) => sum + row._count._all, 0),
        responses: responses.length,
        submittedAssignments:
          assignments.find((row) => row.status === FormAssignmentStatus.SUBMITTED)?._count._all ?? 0,
      },
      assignmentStatus: assignments.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      questions,
    };
  }

  async listMyAssignments(actor: AuthenticatedPrincipal, query: ListMyFormAssignmentsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const where: Prisma.FormAssignmentWhereInput = {
      tenantId,
      status: query.status,
      form: {
        status: FormStatus.PUBLISHED,
        deletedAt: null,
      },
      OR: [{ userId: actor.id }, { employee: { userId: actor.id } }],
    };

    if (query.openOnly) {
      where.status = { notIn: [FormAssignmentStatus.SUBMITTED, FormAssignmentStatus.CANCELLED, FormAssignmentStatus.EXPIRED] };
    }

    const assignments = await this.prisma.formAssignment.findMany({
      where,
      include: {
        form: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
            _count: {
              select: {
                responses: true,
              },
            },
          },
        },
      },
      take: query.limit ?? 50,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });

    return assignments;
  }

  async getMyAssignment(actor: AuthenticatedPrincipal, assignmentId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findMyAssignmentOrThrow(this.prisma, tenantId, actor.id, assignmentId);
  }

  async submitMyResponse(
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    dto: SubmitFormResponseDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const assignment = await this.findMyAssignmentOrThrow(tx, tenantId, actor.id, assignmentId);
      const form = assignment.form;
      const now = new Date();

      if (form.status !== FormStatus.PUBLISHED) {
        throw new BadRequestException('This form is not accepting responses.');
      }
      if (form.closesAt && form.closesAt <= now) {
        await tx.formAssignment.update({
          where: { id: assignment.id },
          data: { status: FormAssignmentStatus.EXPIRED },
        });
        throw new BadRequestException('This form is closed.');
      }
      if (assignment.status === FormAssignmentStatus.SUBMITTED && !form.allowMultipleResponses) {
        throw new BadRequestException('This form has already been submitted.');
      }

      const storedAnswers = this.validateAndStoreAnswers(form.questions, dto.answers);
      const response = await tx.formResponse.create({
        data: {
          tenantId,
          formId: form.id,
          assignmentId: assignment.id,
          employeeId: form.anonymous ? null : assignment.employeeId,
          userId: form.anonymous ? null : actor.id,
          respondentEmail: form.anonymous ? null : actor.email,
          answers: storedAnswers,
          metadata: this.toJson(dto.metadata),
          submittedAt: now,
        },
      });

      const updatedAssignment = await tx.formAssignment.update({
        where: { id: assignment.id },
        data: {
          status: FormAssignmentStatus.SUBMITTED,
          startedAt: assignment.startedAt ?? now,
          submittedAt: now,
        },
      });

      if (assignment.employeeId) {
        await tx.timelineEvent.create({
          data: {
            tenantId,
            employeeId: assignment.employeeId,
            actorUserId: actor.id,
            type: TimelineEventType.FORM_SUBMITTED,
            title: 'Form submitted',
            description: `${form.title} was submitted.`,
            entityType: 'FormResponse',
            entityId: response.id,
            data: this.toJson({ formId: form.id, formTitle: form.title, anonymous: form.anonymous }),
          },
        });
      }

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'FormResponse', response.id, null, {
        formId: form.id,
        assignmentId: assignment.id,
        anonymous: form.anonymous,
      });
      await this.enqueueOutbox(tx, tenantId, 'form.response.submitted', 'FormResponse', response.id, {
        formId: form.id,
        assignmentId: assignment.id,
        responseId: response.id,
        anonymous: form.anonymous,
      });

      return {
        assignment: updatedAssignment,
        response,
      };
    });
  }

  private normalizeQuestions(questions: UpsertFormQuestionDto[]) {
    return questions.map((question, index) => {
      const order = question.order ?? index + 1;
      const requiresOptions = this.questionTypeNeedsOptions(question.type);

      if (requiresOptions && (!question.options || question.options.length < 2)) {
        throw new BadRequestException(`${question.title} requires at least two answer options.`);
      }

      if (!requiresOptions && question.options && question.options.length > 0) {
        throw new BadRequestException(`${question.title} does not support answer options.`);
      }

      const optionValues = new Set((question.options ?? []).map((option) => option.value.trim()));
      if (optionValues.size !== (question.options ?? []).length) {
        throw new BadRequestException(`${question.title} has duplicate option values.`);
      }

      return {
        order,
        type: question.type,
        title: question.title.trim(),
        description: question.description?.trim(),
        required: question.required ?? false,
        options: this.toJson(question.options),
        validation: this.toJson(question.validation),
      };
    });
  }

  private validateAndStoreAnswers(
    questions: FormQuestion[],
    answers: SubmitFormResponseDto['answers'],
  ): StoredAnswer[] {
    const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer.value]));
    const storedAnswers: StoredAnswer[] = [];

    for (const question of questions) {
      const value = answerByQuestionId.get(question.id);
      if (question.required && this.isEmptyAnswer(value)) {
        throw new BadRequestException(`${question.title} is required.`);
      }
      if (this.isEmptyAnswer(value)) {
        continue;
      }

      storedAnswers.push({
        questionId: question.id,
        title: question.title,
        type: question.type,
        value: this.validateQuestionValue(question, value),
      });
    }

    const unknownAnswer = answers.find((answer) => !questions.some((question) => question.id === answer.questionId));
    if (unknownAnswer) {
      throw new BadRequestException('One or more answers reference a question that is not on this form.');
    }

    return storedAnswers;
  }

  private validateQuestionValue(question: FormQuestion, value: unknown): Prisma.InputJsonValue {
    switch (question.type) {
      case FormQuestionType.SHORT_TEXT:
      case FormQuestionType.LONG_TEXT:
      case FormQuestionType.DATE:
        if (typeof value !== 'string') {
          throw new BadRequestException(`${question.title} requires a text answer.`);
        }
        return value.trim();
      case FormQuestionType.NUMBER:
      case FormQuestionType.RATING:
        if (typeof value !== 'number' || Number.isNaN(value)) {
          throw new BadRequestException(`${question.title} requires a numeric answer.`);
        }
        return value;
      case FormQuestionType.YES_NO:
        if (typeof value !== 'boolean') {
          throw new BadRequestException(`${question.title} requires yes or no.`);
        }
        return value;
      case FormQuestionType.SINGLE_CHOICE:
      case FormQuestionType.DROPDOWN:
        if (typeof value !== 'string') {
          throw new BadRequestException(`${question.title} requires one selected answer.`);
        }
        this.assertOptionValue(question, value);
        return value;
      case FormQuestionType.MULTI_CHOICE: {
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
          throw new BadRequestException(`${question.title} requires one or more selected answers.`);
        }
        const selectedValues = value.filter((item): item is string => typeof item === 'string');
        selectedValues.forEach((item) => this.assertOptionValue(question, item));
        return selectedValues;
      }
    }
  }

  private assertOptionValue(question: FormQuestion, value: string) {
    const options = this.optionValues(question);
    if (!options.has(value)) {
      throw new BadRequestException(`${question.title} includes an invalid option.`);
    }
  }

  private optionValues(question: FormQuestion) {
    if (!Array.isArray(question.options)) {
      return new Set<string>();
    }

    return new Set(
      question.options
        .map((option) => (this.isRecord(option) && typeof option.value === 'string' ? option.value : null))
        .filter((value): value is string => value !== null),
    );
  }

  private questionSummary(
    question: FormQuestion,
    responses: Array<{ answers: Prisma.JsonValue }>,
  ) {
    const values = responses
      .flatMap((response) => this.answerArray(response.answers))
      .filter((answer) => answer.questionId === question.id)
      .map((answer) => answer.value);

    const optionCounts: Record<string, number> = {};
    const numericValues: number[] = [];

    for (const value of values) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            optionCounts[item] = (optionCounts[item] ?? 0) + 1;
          }
        }
      } else if (typeof value === 'string' || typeof value === 'boolean') {
        const key = String(value);
        optionCounts[key] = (optionCounts[key] ?? 0) + 1;
      } else if (typeof value === 'number') {
        numericValues.push(value);
      }
    }

    const average =
      numericValues.length > 0
        ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
        : null;

    return {
      questionId: question.id,
      title: question.title,
      type: question.type,
      required: question.required,
      responseCount: values.length,
      optionCounts,
      average,
    };
  }

  private answerArray(value: Prisma.JsonValue): Array<{
    questionId: string;
    title: string;
    type: string;
    value: unknown;
  }> {
    if (!Array.isArray(value)) {
      return [];
    }

    const answers: Array<{
      questionId: string;
      title: string;
      type: string;
      value: unknown;
    }> = [];

    for (const item of value) {
      if (!this.isRecord(item)) {
        continue;
      }

      const questionId = item['questionId'];
      const title = item['title'];
      const type = item['type'];
      const answerValue = item['value'];

      if (typeof questionId === 'string' && typeof title === 'string' && typeof type === 'string') {
        answers.push({
          questionId,
          title,
          type,
          value: answerValue,
        });
      }
    }

    return answers;
  }

  private questionTypeNeedsOptions(type: FormQuestionType) {
    return (
      type === FormQuestionType.SINGLE_CHOICE ||
      type === FormQuestionType.MULTI_CHOICE ||
      type === FormQuestionType.DROPDOWN
    );
  }

  private async resolveAssignmentTargets(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: AssignFormDto,
  ): Promise<AssignmentTarget[]> {
    const targets = new Map<string, AssignmentTarget>();

    if (dto.allActiveEmployees) {
      const employees = await tx.employee.findMany({
        where: {
          tenantId,
          userId: { not: null },
          deletedAt: null,
          status: { in: [EmployeeStatus.PREBOARDING, EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION] },
        },
        include: { person: true, user: true },
        take: 1000,
      });
      employees.forEach((employee) => this.addEmployeeTarget(targets, employee));
    }

    if (dto.employeeIds?.length) {
      const employees = await tx.employee.findMany({
        where: {
          tenantId,
          id: { in: dto.employeeIds },
          deletedAt: null,
        },
        include: { person: true, user: true },
      });
      if (employees.length !== new Set(dto.employeeIds).size) {
        throw new BadRequestException('One or more employees could not be found in this tenant.');
      }
      employees.forEach((employee) => this.addEmployeeTarget(targets, employee));
    }

    if (dto.userIds?.length) {
      const users = await tx.user.findMany({
        where: {
          tenantId,
          id: { in: dto.userIds },
          deletedAt: null,
        },
        include: { employee: { include: { person: true } } },
      });
      if (users.length !== new Set(dto.userIds).size) {
        throw new BadRequestException('One or more users could not be found in this tenant.');
      }
      users.forEach((user) => this.addUserTarget(targets, user));
    }

    return Array.from(targets.values());
  }

  private addEmployeeTarget(
    targets: Map<string, AssignmentTarget>,
    employee: Employee & { person: { firstName: string; lastName: string }; user: User | null },
  ) {
    const key = employee.userId ? `user:${employee.userId}` : `employee:${employee.id}`;
    targets.set(key, {
      employeeId: employee.id,
      userId: employee.userId,
      email: employee.user?.email ?? null,
      name: `${employee.person.firstName} ${employee.person.lastName}`.trim(),
    });
  }

  private addUserTarget(
    targets: Map<string, AssignmentTarget>,
    user: User & { employee: (Employee & { person: { firstName: string; lastName: string } }) | null },
  ) {
    const key = `user:${user.id}`;
    targets.set(key, {
      employeeId: user.employee?.id ?? null,
      userId: user.id,
      email: user.email,
      name: user.employee
        ? `${user.employee.person.firstName} ${user.employee.person.lastName}`.trim()
        : user.username ?? user.email,
    });
  }

  private async createAssignmentNotification(
    tx: Prisma.TransactionClient,
    tenantId: string,
    form: Form,
    assignments: FormAssignment[],
    targets: AssignmentTarget[],
    message?: string,
  ) {
    if (assignments.length === 0) {
      return;
    }

    await tx.notification.create({
      data: {
        tenantId,
        channel: NotificationChannel.IN_APP,
        title: `Form assigned: ${form.title}`,
        body: message?.trim() || 'A workforce form is ready for your response.',
        status: NotificationStatus.SENT,
        templateCode: 'FORM_ASSIGNED',
        data: this.toJson({
          module: 'forms',
          formId: form.id,
          formTitle: form.title,
          assignmentCount: assignments.length,
        }),
        sentAt: new Date(),
        recipients: {
          create: targets.map((target) => ({
              userId: target.userId,
              employeeId: target.employeeId,
              destination: target.email,
              status: NotificationStatus.DELIVERED,
              deliveredAt: new Date(),
              failureReason: target.userId ? undefined : 'Employee does not have a linked login account.',
            })),
        },
      },
    });
  }

  private async findFormForAdminOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    formId: string,
  ) {
    const form = await client.form.findFirst({
      where: {
        id: formId,
        tenantId,
        deletedAt: null,
      },
      include: this.formInclude,
    });

    if (!form) {
      throw new NotFoundException('Form not found.');
    }

    return form;
  }

  private async findMyAssignmentOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    userId: string,
    assignmentId: string,
  ) {
    const assignment = await client.formAssignment.findFirst({
      where: {
        id: assignmentId,
        tenantId,
        OR: [{ userId }, { employee: { userId } }],
      },
      include: {
        form: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Form assignment not found.');
    }

    return assignment;
  }

  private formState(form: Form & { questions?: FormQuestion[] }) {
    return {
      id: form.id,
      code: form.code,
      title: form.title,
      status: form.status,
      anonymous: form.anonymous,
      allowMultipleResponses: form.allowMultipleResponses,
      closesAt: form.closesAt,
      questionCount: form.questions?.length,
    };
  }

  private async writeAudit(
    client: Prisma.TransactionClient | PrismaService,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    await client.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'forms',
        entityType,
        entityId,
        before: this.toJson(before),
        after: this.toJson(after),
      },
    });
  }

  private async enqueueOutbox(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    await client.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        payload: this.toJson(payload) ?? {},
      },
    });
  }

  private requireTenant(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase().replace(/\s+/g, '_');
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private isEmptyAnswer(value: unknown) {
    return (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private paginate<T extends { id: string }>(rows: T[], limit: number) {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    return {
      data,
      nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
    };
  }

  private readonly formInclude = {
    questions: {
      orderBy: { order: 'asc' },
    },
    _count: {
      select: {
        assignments: true,
        responses: true,
      },
    },
  } satisfies Prisma.FormInclude;
}
