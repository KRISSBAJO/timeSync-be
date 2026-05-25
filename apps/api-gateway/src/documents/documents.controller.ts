import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
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
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiCookieAuth('access_token')
@Controller('api/v1/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Put('uploads/local/:token')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Upload a local document object using an upload intent token.' })
  @ApiOkResponse({ description: 'Local document object uploaded.' })
  async uploadLocalObject(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('token') token: string,
    @Req() request: Request,
  ) {
    return this.documentsService.saveLocalUpload(user, token, request);
  }

  @Get('uploads/local/files/:token')
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'Stream an authenticated local document object.' })
  async streamLocalObject(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('token') token: string,
    @Res() response: Response,
  ) {
    const file = await this.documentsService.localFile(user, token);
    response.setHeader('content-type', 'application/octet-stream');
    response.setHeader('content-length', String(file.stats.size));
    file.stream.pipe(response);
  }

  @Post('types')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Create a tenant-owned document type.' })
  @ApiOkResponse({ description: 'Document type created.' })
  async createDocumentType(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateDocumentTypeDto,
  ) {
    return this.documentsService.createDocumentType(user, dto);
  }

  @Get('types')
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'List tenant and global document types.' })
  @ApiOkResponse({ description: 'Document types returned.' })
  async listDocumentTypes(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListDocumentTypesQueryDto,
  ) {
    return this.documentsService.listDocumentTypes(user, query);
  }

  @Get('types/:id')
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'Get a document type.' })
  @ApiOkResponse({ description: 'Document type returned.' })
  async getDocumentType(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentTypeId: string,
  ) {
    return this.documentsService.getDocumentType(user, documentTypeId);
  }

  @Patch('types/:id')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Update a tenant-owned document type.' })
  @ApiOkResponse({ description: 'Document type updated.' })
  async updateDocumentType(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentTypeId: string,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.documentsService.updateDocumentType(user, documentTypeId, dto);
  }

  @Delete('types/:id')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Delete an unused tenant-owned document type.' })
  @ApiOkResponse({ description: 'Document type deleted.' })
  async deleteDocumentType(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentTypeId: string,
  ) {
    return this.documentsService.deleteDocumentType(user, documentTypeId);
  }

  @Get('summary')
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'Return document compliance summary metrics.' })
  @ApiOkResponse({ description: 'Document summary returned.' })
  async summary(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DocumentComplianceQueryDto,
  ) {
    return this.documentsService.getSummary(user, query);
  }

  @Get('compliance')
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'Return document compliance issues and expiry risk.' })
  @ApiOkResponse({ description: 'Document compliance returned.' })
  async compliance(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DocumentComplianceQueryDto,
  ) {
    return this.documentsService.getCompliance(user, query);
  }

  @Get('expiring')
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'List documents that are expired or expiring soon.' })
  @ApiOkResponse({ description: 'Expiring documents returned.' })
  async expiring(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DocumentComplianceQueryDto,
  ) {
    return this.documentsService.listExpiringDocuments(user, query);
  }

  @Post()
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Create an employee or tenant document with optional initial version.' })
  @ApiOkResponse({ description: 'Document created.' })
  async createDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documentsService.createDocument(user, dto);
  }

  @Get()
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'List documents with compliance and ownership filters.' })
  @ApiOkResponse({ description: 'Documents returned.' })
  async listDocuments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documentsService.listDocuments(user, query);
  }

  @Get(':id')
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'Get a document with current version and recent version history.' })
  @ApiOkResponse({ description: 'Document returned.' })
  async getDocument(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') documentId: string) {
    return this.documentsService.getDocument(user, documentId);
  }

  @Patch(':id')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Update document metadata and compliance classification.' })
  @ApiOkResponse({ description: 'Document updated.' })
  async updateDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.updateDocument(user, documentId, dto);
  }

  @Delete(':id')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Soft-delete a document while preserving history.' })
  @ApiOkResponse({ description: 'Document deleted.' })
  async deleteDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
  ) {
    return this.documentsService.deleteDocument(user, documentId);
  }

  @Get(':id/versions')
  @RequirePermissions('documents.read')
  @ApiOperation({ summary: 'List all versions for a document.' })
  @ApiOkResponse({ description: 'Document versions returned.' })
  async listVersions(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
  ) {
    return this.documentsService.listVersions(user, documentId);
  }

  @Post(':id/versions')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Create a new immutable document version.' })
  @ApiOkResponse({ description: 'Document version created.' })
  async addVersion(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
    @Body() dto: CreateDocumentVersionDto,
  ) {
    return this.documentsService.addVersion(user, documentId, dto);
  }

  @Post(':id/versions/upload-intent')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Create a local or S3-compatible upload intent for a document version.' })
  @ApiOkResponse({ description: 'Document version upload intent created.' })
  async createVersionUploadIntent(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
    @Body() dto: CreateDocumentVersionUploadIntentDto,
  ) {
    return this.documentsService.createVersionUploadIntent(user, documentId, dto);
  }

  @Post(':id/versions/:versionId/current')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Set a document version as the current version.' })
  @ApiOkResponse({ description: 'Current version updated.' })
  async setCurrentVersion(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.documentsService.setCurrentVersion(user, documentId, versionId);
  }

  @Post(':id/request-verification')
  @RequirePermissions('documents.write')
  @ApiOperation({ summary: 'Move a document into pending verification.' })
  @ApiOkResponse({ description: 'Document verification requested.' })
  async requestVerification(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
    @Body() dto: VerifyDocumentDto,
  ) {
    return this.documentsService.requestVerification(user, documentId, dto);
  }

  @Post(':id/verify')
  @RequirePermissions('documents.verify')
  @ApiOperation({ summary: 'Verify a document current version.' })
  @ApiOkResponse({ description: 'Document verified.' })
  async verifyDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
    @Body() dto: VerifyDocumentDto,
  ) {
    return this.documentsService.verifyDocument(user, documentId, dto);
  }

  @Post(':id/reject')
  @RequirePermissions('documents.verify')
  @ApiOperation({ summary: 'Reject a document verification.' })
  @ApiOkResponse({ description: 'Document rejected.' })
  async rejectDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
    @Body() dto: VerifyDocumentDto,
  ) {
    return this.documentsService.rejectDocument(user, documentId, dto);
  }

  @Post(':id/expire')
  @RequirePermissions('documents.verify')
  @ApiOperation({ summary: 'Mark a document as expired.' })
  @ApiOkResponse({ description: 'Document marked expired.' })
  async markDocumentExpired(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') documentId: string,
    @Body() dto: VerifyDocumentDto,
  ) {
    return this.documentsService.markDocumentExpired(user, documentId, dto);
  }
}
