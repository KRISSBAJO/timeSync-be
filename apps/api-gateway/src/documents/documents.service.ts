import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  DocumentVerificationStatus,
  DocumentVisibility,
  TimelineEventType,
  type Document,
  type DocumentType,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { CreateDocumentVersionDto } from './dto/create-document-version.dto';
import { CreateDocumentVersionUploadIntentDto } from './dto/create-document-version-upload-intent.dto';
import { DocumentComplianceQueryDto } from './dto/document-compliance-query.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { ListDocumentTypesQueryDto } from './dto/list-document-types-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';
import { DocumentStorageService } from './storage/document-storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
  ) {}

  async createDocumentType(actor: AuthenticatedPrincipal, dto: CreateDocumentTypeDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const documentType = await tx.documentType.create({
        data: {
          tenantId,
          code: this.normalizeCode(dto.code),
          name: dto.name.trim(),
          description: dto.description,
          requiresExpiry: dto.requiresExpiry ?? false,
          requiresVerification: dto.requiresVerification ?? false,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'DocumentType', documentType.id, null, {
        code: documentType.code,
        name: documentType.name,
      });

      await this.enqueueOutbox(tx, tenantId, 'document.type.created', 'DocumentType', documentType.id, {
        documentTypeId: documentType.id,
        code: documentType.code,
      });

      return documentType;
    });
  }

  async listDocumentTypes(actor: AuthenticatedPrincipal, query: ListDocumentTypesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const documentTypes = await this.prisma.documentType.findMany({
      where: {
        AND: [
          {
            OR: query.includeGlobal === false ? [{ tenantId }] : [{ tenantId: null }, { tenantId }],
          },
          {
            requiresExpiry: query.requiresExpiry,
            requiresVerification: query.requiresVerification,
          },
          query.search
            ? {
                OR: [
                  { code: { contains: query.search, mode: 'insensitive' } },
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { description: { contains: query.search, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      include: {
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });

    return this.paginate(documentTypes, limit);
  }

  async getDocumentType(actor: AuthenticatedPrincipal, documentTypeId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findDocumentTypeForReadOrThrow(this.prisma, tenantId, documentTypeId);
  }

  async updateDocumentType(
    actor: AuthenticatedPrincipal,
    documentTypeId: string,
    dto: UpdateDocumentTypeDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTenantDocumentTypeOrThrow(tx, tenantId, documentTypeId);
      const updated = await tx.documentType.update({
        where: { id: existing.id },
        data: {
          code: dto.code ? this.normalizeCode(dto.code) : undefined,
          name: dto.name?.trim(),
          description: dto.description,
          requiresExpiry: dto.requiresExpiry,
          requiresVerification: dto.requiresVerification,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'DocumentType',
        updated.id,
        this.documentTypeState(existing),
        this.documentTypeState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'document.type.updated', 'DocumentType', updated.id, {
        documentTypeId: updated.id,
        code: updated.code,
      });

      return updated;
    });
  }

  async deleteDocumentType(actor: AuthenticatedPrincipal, documentTypeId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTenantDocumentTypeOrThrow(tx, tenantId, documentTypeId);
      const documents = await tx.document.count({
        where: {
          tenantId,
          documentTypeId: existing.id,
          deletedAt: null,
        },
      });

      if (documents > 0) {
        throw new BadRequestException('Cannot delete a document type that is still in use.');
      }

      await tx.documentType.delete({ where: { id: existing.id } });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DELETE,
        'DocumentType',
        existing.id,
        this.documentTypeState(existing),
        { deleted: true },
      );

      await this.enqueueOutbox(tx, tenantId, 'document.type.deleted', 'DocumentType', existing.id, {
        documentTypeId: existing.id,
        deleted: true,
      });

      return { deleted: true };
    });
  }

  async createDocument(actor: AuthenticatedPrincipal, dto: CreateDocumentDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const employeeId = await this.validateEmployeeReference(tx, tenantId, dto.employeeId);
      const documentType = await this.resolveDocumentType(tx, tenantId, dto.documentTypeId, dto.documentTypeCode);
      const expiresAt = this.toNullableDate(dto.expiresAt);

      this.assertExpirySatisfied(documentType, expiresAt);

      const document = await tx.document.create({
        data: {
          tenantId,
          employeeId,
          documentTypeId: documentType?.id ?? null,
          title: dto.title.trim(),
          description: dto.description,
          visibility: dto.visibility ?? DocumentVisibility.HR_ONLY,
          verificationStatus:
            dto.verificationStatus ?? this.initialVerificationStatus(documentType),
          expiresAt,
          createdById: actor.id,
          metadata: this.toJson(dto.metadata),
        },
        include: this.documentInclude,
      });

      let finalDocument = document;

      if (dto.initialVersion) {
        const version = await this.createVersionRecord(tx, actor, tenantId, document.id, dto.initialVersion, 1);
        finalDocument = await this.updateCurrentVersion(tx, tenantId, document.id, version.id, true);
      }

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Document', document.id, null, {
        title: finalDocument.title,
        employeeId: finalDocument.employeeId,
        documentTypeId: finalDocument.documentTypeId,
        currentVersionId: finalDocument.currentVersionId,
      });

      await this.createDocumentTimeline(tx, actor, tenantId, finalDocument, 'Document created');
      await this.enqueueOutbox(tx, tenantId, 'document.created', 'Document', finalDocument.id, {
        documentId: finalDocument.id,
        employeeId: finalDocument.employeeId,
        documentTypeId: finalDocument.documentTypeId,
      });

      return finalDocument;
    });
  }

  async createVersionUploadIntent(
    actor: AuthenticatedPrincipal,
    documentId: string,
    dto: CreateDocumentVersionUploadIntentDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findDocumentOrThrow(this.prisma, tenantId, documentId);

    try {
      return this.storage.createUploadIntent({ tenantId, documentId, dto });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Upload intent could not be created.');
    }
  }

  async saveLocalUpload(actor: AuthenticatedPrincipal, uploadToken: string, request: import('express').Request) {
    const tenantId = this.requireTenant(actor);

    try {
      return await this.storage.saveLocalUpload({
        tenantId,
        token: uploadToken,
        request,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Upload could not be saved.');
    }
  }

  async localFile(actor: AuthenticatedPrincipal, objectToken: string) {
    const tenantId = this.requireTenant(actor);
    const file = await this.storage.localFileStats(objectToken).catch(() => {
      throw new NotFoundException('Document file not found.');
    });

    if (!file.objectKey.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException('Document file does not belong to the current tenant.');
    }

    return {
      ...file,
      stream: this.storage.localFileStream(file.path),
    };
  }

  async listDocuments(actor: AuthenticatedPrincipal, query: ListDocumentsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const documentType = query.documentTypeCode
      ? await this.resolveDocumentType(this.prisma, tenantId, undefined, query.documentTypeCode)
      : null;
    const now = new Date();

    const documents = await this.prisma.document.findMany({
      where: {
        tenantId,
        employeeId: query.employeeId,
        documentTypeId: query.documentTypeId ?? documentType?.id,
        visibility: query.visibility,
        verificationStatus: query.verificationStatus,
        currentVersionId: query.missingCurrentVersion ? null : undefined,
        deletedAt: query.includeDeleted ? undefined : null,
        expiresAt: query.expiredOnly
          ? { lt: now }
          : query.expiringBefore
            ? { lte: new Date(query.expiringBefore) }
            : undefined,
        OR: query.search
          ? [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { documentType: { name: { contains: query.search, mode: 'insensitive' } } },
              { documentType: { code: { contains: query.search, mode: 'insensitive' } } },
              { employee: { employeeNumber: { contains: query.search, mode: 'insensitive' } } },
              { employee: { person: { firstName: { contains: query.search, mode: 'insensitive' } } } },
              { employee: { person: { lastName: { contains: query.search, mode: 'insensitive' } } } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: this.documentInclude,
    });

    return this.paginate(documents, limit);
  }

  async getDocument(actor: AuthenticatedPrincipal, documentId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findDocumentOrThrow(this.prisma, tenantId, documentId);
  }

  async updateDocument(actor: AuthenticatedPrincipal, documentId: string, dto: UpdateDocumentDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDocumentOrThrow(tx, tenantId, documentId);
      const employeeId =
        dto.employeeId !== undefined
          ? await this.validateEmployeeReference(tx, tenantId, dto.employeeId ?? undefined)
          : undefined;
      const documentType = await this.resolveDocumentTypeForUpdate(tx, tenantId, existing, dto);
      const expiresAt = dto.expiresAt !== undefined ? this.toNullableDate(dto.expiresAt) : undefined;
      const documentTypeWasChanged =
        dto.documentTypeId !== undefined || dto.documentTypeCode !== undefined;
      const expiresAtWasChanged = dto.expiresAt !== undefined;
      const effectiveDocumentType = documentTypeWasChanged ? documentType : existing.documentType;
      const effectiveExpiresAt = expiresAtWasChanged ? expiresAt : existing.expiresAt;

      this.assertExpirySatisfied(effectiveDocumentType, effectiveExpiresAt);

      const updated = await tx.document.update({
        where: { id: existing.id },
        data: {
          employeeId,
          documentTypeId:
            dto.documentTypeId !== undefined || dto.documentTypeCode !== undefined
              ? documentType?.id ?? null
              : undefined,
          title: dto.title?.trim(),
          description: dto.description,
          visibility: dto.visibility,
          verificationStatus: dto.verificationStatus,
          expiresAt,
          metadata: this.toJson(dto.metadata),
        },
        include: this.documentInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'Document',
        updated.id,
        this.documentState(existing),
        this.documentState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'document.updated', 'Document', updated.id, {
        documentId: updated.id,
        employeeId: updated.employeeId,
        documentTypeId: updated.documentTypeId,
      });

      return updated;
    });
  }

  async deleteDocument(actor: AuthenticatedPrincipal, documentId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDocumentOrThrow(tx, tenantId, documentId);
      const deleted = await tx.document.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DELETE,
        'Document',
        existing.id,
        this.documentState(existing),
        { deletedAt: deleted.deletedAt?.toISOString() ?? null },
      );

      await this.enqueueOutbox(tx, tenantId, 'document.deleted', 'Document', existing.id, {
        documentId: existing.id,
        deleted: true,
      });

      return { deleted: true };
    });
  }

  async addVersion(
    actor: AuthenticatedPrincipal,
    documentId: string,
    dto: CreateDocumentVersionDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const document = await this.findDocumentOrThrow(tx, tenantId, documentId);
      const versionNo = await this.nextVersionNo(tx, document.id);
      const version = await this.createVersionRecord(tx, actor, tenantId, document.id, dto, versionNo);
      const updated =
        dto.setCurrent === false
          ? await this.findDocumentOrThrow(tx, tenantId, document.id)
          : await this.updateCurrentVersion(tx, tenantId, document.id, version.id, true);

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'DocumentVersion', version.id, null, {
        documentId: document.id,
        versionNo: version.versionNo,
        fileName: version.fileName,
      });

      await this.createDocumentTimeline(tx, actor, tenantId, updated, 'Document version uploaded');
      await this.enqueueOutbox(tx, tenantId, 'document.version.created', 'Document', document.id, {
        documentId: document.id,
        documentVersionId: version.id,
        versionNo: version.versionNo,
        currentVersionId: updated.currentVersionId,
      });

      return updated;
    });
  }

  async listVersions(actor: AuthenticatedPrincipal, documentId: string) {
    const tenantId = this.requireTenant(actor);
    const document = await this.findDocumentOrThrow(this.prisma, tenantId, documentId);

    return this.prisma.documentVersion.findMany({
      where: { documentId: document.id },
      orderBy: [{ versionNo: 'desc' }],
      include: {
        uploadedBy: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });
  }

  async setCurrentVersion(actor: AuthenticatedPrincipal, documentId: string, versionId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const document = await this.findDocumentOrThrow(tx, tenantId, documentId);
      await this.findVersionOrThrow(tx, document.id, versionId);
      const updated = await this.updateCurrentVersion(tx, tenantId, document.id, versionId, true);

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'Document',
        document.id,
        this.documentState(document),
        this.documentState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'document.current_version.changed', 'Document', document.id, {
        documentId: document.id,
        currentVersionId: versionId,
      });

      return updated;
    });
  }

  async requestVerification(actor: AuthenticatedPrincipal, documentId: string, dto: VerifyDocumentDto) {
    return this.setVerificationStatus(
      actor,
      documentId,
      DocumentVerificationStatus.PENDING,
      AuditAction.UPDATE,
      'document.verification.requested',
      dto,
    );
  }

  async verifyDocument(actor: AuthenticatedPrincipal, documentId: string, dto: VerifyDocumentDto) {
    return this.setVerificationStatus(
      actor,
      documentId,
      DocumentVerificationStatus.VERIFIED,
      AuditAction.APPROVE,
      'document.verified',
      dto,
    );
  }

  async rejectDocument(actor: AuthenticatedPrincipal, documentId: string, dto: VerifyDocumentDto) {
    return this.setVerificationStatus(
      actor,
      documentId,
      DocumentVerificationStatus.REJECTED,
      AuditAction.REJECT,
      'document.rejected',
      dto,
    );
  }

  async markDocumentExpired(actor: AuthenticatedPrincipal, documentId: string, dto: VerifyDocumentDto) {
    return this.setVerificationStatus(
      actor,
      documentId,
      DocumentVerificationStatus.EXPIRED,
      AuditAction.UPDATE,
      'document.expired',
      dto,
    );
  }

  async getSummary(actor: AuthenticatedPrincipal, query: DocumentComplianceQueryDto) {
    const tenantId = this.requireTenant(actor);
    const asOf = this.toDate(query.asOf) ?? new Date();
    const expiresWithinDays = query.expiresWithinDays ?? 60;
    const expiringBefore = this.addDays(asOf, expiresWithinDays);
    const where: Prisma.DocumentWhereInput = {
      tenantId,
      employeeId: query.employeeId,
      deletedAt: null,
    };

    const [
      totalDocuments,
      missingCurrentVersion,
      expiredDocuments,
      expiringSoon,
      statusGroups,
      visibilityGroups,
      typeGroups,
      employeesWithoutDocuments,
    ] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.count({ where: { ...where, currentVersionId: null } }),
      this.prisma.document.count({ where: { ...where, expiresAt: { lt: asOf } } }),
      this.prisma.document.count({
        where: {
          ...where,
          expiresAt: {
            gte: asOf,
            lte: expiringBefore,
          },
        },
      }),
      this.prisma.document.groupBy({
        by: ['verificationStatus'],
        where,
        _count: { _all: true },
      }),
      this.prisma.document.groupBy({
        by: ['visibility'],
        where,
        _count: { _all: true },
      }),
      this.prisma.document.groupBy({
        by: ['documentTypeId'],
        where,
        _count: { _all: true },
      }),
      query.employeeId
        ? Promise.resolve(0)
        : this.prisma.employee.count({
            where: {
              tenantId,
              deletedAt: null,
              documents: {
                none: {
                  deletedAt: null,
                },
              },
            },
          }),
    ]);

    return {
      totalDocuments,
      missingCurrentVersion,
      expiredDocuments,
      expiringSoon,
      employeesWithoutDocuments,
      byVerificationStatus: Object.fromEntries(
        statusGroups.map((item) => [item.verificationStatus, item._count._all]),
      ),
      byVisibility: Object.fromEntries(
        visibilityGroups.map((item) => [item.visibility, item._count._all]),
      ),
      byDocumentType: typeGroups.map((item) => ({
        documentTypeId: item.documentTypeId,
        count: item._count._all,
      })),
    };
  }

  async getCompliance(actor: AuthenticatedPrincipal, query: DocumentComplianceQueryDto) {
    const tenantId = this.requireTenant(actor);
    const asOf = this.toDate(query.asOf) ?? new Date();
    const expiresWithinDays = query.expiresWithinDays ?? 60;
    const expiringBefore = this.addDays(asOf, expiresWithinDays);
    const where: Prisma.DocumentWhereInput = {
      tenantId,
      employeeId: query.employeeId,
      deletedAt: null,
    };

    const [summary, issues] = await Promise.all([
      this.getSummary(actor, query),
      this.prisma.document.findMany({
        where: {
          ...where,
          OR: [
            { currentVersionId: null },
            { verificationStatus: { in: [DocumentVerificationStatus.PENDING, DocumentVerificationStatus.REJECTED] } },
            { expiresAt: { lt: asOf } },
            { expiresAt: { gte: asOf, lte: expiringBefore } },
          ],
        },
        orderBy: [{ expiresAt: 'asc' }, { updatedAt: 'desc' }],
        take: 50,
        include: this.documentInclude,
      }),
    ]);

    return {
      ...summary,
      asOf: asOf.toISOString(),
      expiresWithinDays,
      issues: issues.map((document) => ({
        document,
        issueCodes: this.issueCodes(document, asOf, expiringBefore),
      })),
    };
  }

  async listExpiringDocuments(actor: AuthenticatedPrincipal, query: DocumentComplianceQueryDto) {
    const tenantId = this.requireTenant(actor);
    const asOf = this.toDate(query.asOf) ?? new Date();
    const expiringBefore = this.addDays(asOf, query.expiresWithinDays ?? 60);

    return this.prisma.document.findMany({
      where: {
        tenantId,
        employeeId: query.employeeId,
        deletedAt: null,
        expiresAt: {
          lte: expiringBefore,
        },
      },
      orderBy: [{ expiresAt: 'asc' }, { updatedAt: 'desc' }],
      include: this.documentInclude,
      take: 100,
    });
  }

  private async setVerificationStatus(
    actor: AuthenticatedPrincipal,
    documentId: string,
    status: DocumentVerificationStatus,
    auditAction: AuditAction,
    outboxEvent: string,
    dto: VerifyDocumentDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDocumentOrThrow(tx, tenantId, documentId);

      if (status === DocumentVerificationStatus.VERIFIED) {
        if (!existing.currentVersionId) {
          throw new BadRequestException('Document must have a current version before verification.');
        }

        if (existing.expiresAt && existing.expiresAt < new Date()) {
          throw new BadRequestException('Expired documents cannot be verified.');
        }
      }

      const updated = await tx.document.update({
        where: { id: existing.id },
        data: {
          verificationStatus: status,
          metadata: this.mergeJsonObject(existing.metadata, {
            lastVerificationActionAt: new Date().toISOString(),
            lastVerificationActorId: actor.id,
            lastVerificationNote: dto.note,
            ...dto.metadata,
          }),
        },
        include: this.documentInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        auditAction,
        'Document',
        updated.id,
        this.documentState(existing),
        this.documentState(updated),
      );

      await this.createDocumentTimeline(tx, actor, tenantId, updated, `Document ${status.toLowerCase()}`);
      await this.enqueueOutbox(tx, tenantId, outboxEvent, 'Document', updated.id, {
        documentId: updated.id,
        status: updated.verificationStatus,
        note: dto.note,
      });

      return updated;
    });
  }

  private async createVersionRecord(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    documentId: string,
    dto: CreateDocumentVersionDto,
    versionNo: number,
  ) {
    await this.validateUserReference(tx, tenantId, actor.id);
    const storageReference = this.storage.prepareVersionReference(dto);

    return tx.documentVersion.create({
      data: {
        documentId,
        versionNo,
        fileName: storageReference.fileName,
        fileUrl: storageReference.fileUrl,
        mimeType: storageReference.mimeType,
        sizeBytes: storageReference.sizeBytes,
        checksum: storageReference.checksum,
        uploadedById: actor.id,
        metadata: this.toJson(storageReference.metadata),
      },
    });
  }

  private async updateCurrentVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
    versionId: string,
    resetVerification: boolean,
  ) {
    const document = await this.findDocumentOrThrow(tx, tenantId, documentId);
    const verificationStatus =
      resetVerification && document.documentType?.requiresVerification
        ? DocumentVerificationStatus.PENDING
        : undefined;

    return tx.document.update({
      where: { id: document.id },
      data: {
        currentVersionId: versionId,
        verificationStatus,
      },
      include: this.documentInclude,
    });
  }

  private async resolveDocumentTypeForUpdate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    existing: DocumentWithRelations,
    dto: UpdateDocumentDto,
  ) {
    if (dto.documentTypeId === undefined && dto.documentTypeCode === undefined) {
      return existing.documentType;
    }

    const documentTypeId = dto.documentTypeId ?? undefined;
    const documentTypeCode = dto.documentTypeCode ?? undefined;

    if (!documentTypeId && !documentTypeCode) {
      return null;
    }

    return this.resolveDocumentType(tx, tenantId, documentTypeId, documentTypeCode);
  }

  private async resolveDocumentType(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    documentTypeId?: string,
    documentTypeCode?: string | null,
  ) {
    if (documentTypeId && documentTypeCode) {
      throw new BadRequestException('Use either documentTypeId or documentTypeCode, not both.');
    }

    if (!documentTypeId && !documentTypeCode) {
      return null;
    }

    const where: Prisma.DocumentTypeWhereInput = documentTypeId
      ? { id: documentTypeId }
      : { code: documentTypeCode?.trim().toUpperCase() };

    const documentType = await client.documentType.findFirst({
      where: {
        ...where,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!documentType) {
      throw new BadRequestException('Document type reference is invalid.');
    }

    return documentType;
  }

  private async validateEmployeeReference(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    employeeId?: string | null,
  ) {
    if (!employeeId) {
      return null;
    }

    const employee = await client.employee.findFirst({
      where: {
        id: employeeId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!employee) {
      throw new BadRequestException('Employee reference is invalid for this tenant.');
    }

    return employee.id;
  }

  private async validateUserReference(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    userId: string,
  ) {
    const user = await client.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('User reference is invalid for this tenant.');
    }
  }

  private assertExpirySatisfied(
    documentType: Pick<DocumentType, 'requiresExpiry' | 'name'> | null,
    expiresAt?: Date | null,
  ) {
    if (documentType?.requiresExpiry && !expiresAt) {
      throw new BadRequestException(`${documentType.name} requires an expiry date.`);
    }
  }

  private initialVerificationStatus(documentType: DocumentType | null) {
    if (documentType?.requiresVerification) {
      return DocumentVerificationStatus.PENDING;
    }

    return DocumentVerificationStatus.NOT_REQUIRED;
  }

  private async nextVersionNo(tx: Prisma.TransactionClient, documentId: string) {
    const aggregate = await tx.documentVersion.aggregate({
      where: { documentId },
      _max: { versionNo: true },
    });

    return (aggregate._max.versionNo ?? 0) + 1;
  }

  private async findDocumentOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    documentId: string,
  ): Promise<DocumentWithRelations> {
    const document = await client.document.findFirst({
      where: {
        id: documentId,
        tenantId,
        deletedAt: null,
      },
      include: this.documentInclude,
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    return document;
  }

  private async findVersionOrThrow(
    tx: Prisma.TransactionClient,
    documentId: string,
    versionId: string,
  ) {
    const version = await tx.documentVersion.findFirst({
      where: {
        id: versionId,
        documentId,
      },
    });

    if (!version) {
      throw new NotFoundException('Document version not found.');
    }

    return version;
  }

  private async findDocumentTypeForReadOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    documentTypeId: string,
  ) {
    const documentType = await client.documentType.findFirst({
      where: {
        id: documentTypeId,
        OR: [{ tenantId }, { tenantId: null }],
      },
      include: {
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });

    if (!documentType) {
      throw new NotFoundException('Document type not found.');
    }

    return documentType;
  }

  private async findTenantDocumentTypeOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    documentTypeId: string,
  ) {
    const documentType = await client.documentType.findFirst({
      where: {
        id: documentTypeId,
        tenantId,
      },
    });

    if (!documentType) {
      throw new NotFoundException('Tenant-owned document type not found.');
    }

    return documentType;
  }

  private async createDocumentTimeline(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    document: Pick<Document, 'id' | 'employeeId' | 'title'>,
    title: string,
  ) {
    if (!document.employeeId) {
      return;
    }

    await tx.timelineEvent.create({
      data: {
        tenantId,
        employeeId: document.employeeId,
        actorUserId: actor.id,
        type: TimelineEventType.DOCUMENT_UPLOADED,
        title,
        description: document.title,
        entityType: 'Document',
        entityId: document.id,
        data: {
          documentId: document.id,
          title: document.title,
        },
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
        module: 'documents',
        entityType,
        entityId,
        before: before ?? undefined,
        after,
      },
    });
  }

  private async enqueueOutbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        payload,
      },
    });
  }

  private documentTypeState(documentType: DocumentType): Prisma.InputJsonObject {
    return {
      id: documentType.id,
      tenantId: documentType.tenantId,
      code: documentType.code,
      name: documentType.name,
      requiresExpiry: documentType.requiresExpiry,
      requiresVerification: documentType.requiresVerification,
    };
  }

  private documentState(document: DocumentStateSource): Prisma.InputJsonObject {
    return {
      id: document.id,
      employeeId: document.employeeId,
      documentTypeId: document.documentTypeId,
      title: document.title,
      visibility: document.visibility,
      verificationStatus: document.verificationStatus,
      currentVersionId: document.currentVersionId,
      expiresAt: document.expiresAt?.toISOString() ?? null,
      deletedAt: document.deletedAt?.toISOString() ?? null,
    };
  }

  private issueCodes(document: DocumentWithRelations, asOf: Date, expiringBefore: Date) {
    const issues: string[] = [];

    if (!document.currentVersionId) {
      issues.push('MISSING_CURRENT_VERSION');
    }

    if (document.verificationStatus === DocumentVerificationStatus.PENDING) {
      issues.push('VERIFICATION_PENDING');
    }

    if (document.verificationStatus === DocumentVerificationStatus.REJECTED) {
      issues.push('VERIFICATION_REJECTED');
    }

    if (document.expiresAt && document.expiresAt < asOf) {
      issues.push('EXPIRED');
    } else if (document.expiresAt && document.expiresAt <= expiringBefore) {
      issues.push('EXPIRING_SOON');
    }

    return issues;
  }

  private mergeJsonObject(value: Prisma.JsonValue | null, patch: Record<string, unknown>) {
    const base =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return this.toJson({
      ...base,
      ...patch,
    });
  }

  private paginate<TItem>(items: TItem[], limit: number) {
    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? (data.at(-1) as { id?: string } | undefined)?.id : null,
      },
    };
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private toDate(value?: string): Date | undefined {
    return value ? new Date(value) : undefined;
  }

  private toNullableDate(value?: string | null): Date | null {
    return value ? new Date(value) : null;
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private requireTenant(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private get documentInclude() {
    return {
      employee: {
        include: {
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
        },
      },
      documentType: true,
      createdBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      currentVersion: {
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      versions: {
        orderBy: [{ versionNo: 'desc' }],
        take: 10,
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      _count: {
        select: {
          versions: true,
        },
      },
    } satisfies Prisma.DocumentInclude;
  }
}

type DocumentWithRelations = Document & {
  documentType: DocumentType | null;
};

type DocumentStateSource = Pick<
  Document,
  | 'id'
  | 'employeeId'
  | 'documentTypeId'
  | 'title'
  | 'visibility'
  | 'verificationStatus'
  | 'currentVersionId'
  | 'expiresAt'
  | 'deletedAt'
>;
