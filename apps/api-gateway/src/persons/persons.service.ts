import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, type Prisma } from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { CreatePersonAddressDto } from './dto/create-person-address.dto';
import { CreatePersonCertificationDto } from './dto/create-person-certification.dto';
import { CreatePersonContactDto } from './dto/create-person-contact.dto';
import { CreatePersonEducationDto } from './dto/create-person-education.dto';
import { CreatePersonExperienceDto } from './dto/create-person-experience.dto';
import { CreatePersonIdentityDocumentDto } from './dto/create-person-identity-document.dto';
import { CreatePersonLanguageDto } from './dto/create-person-language.dto';
import { CreatePersonSkillDto } from './dto/create-person-skill.dto';
import { CreatePersonDto } from './dto/create-person.dto';
import { ListPersonsQueryDto } from './dto/list-persons-query.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import { UpdatePersonAddressDto } from './dto/update-person-address.dto';
import { UpdatePersonCertificationDto } from './dto/update-person-certification.dto';
import { UpdatePersonContactDto } from './dto/update-person-contact.dto';
import { UpdatePersonEducationDto } from './dto/update-person-education.dto';
import { UpdatePersonExperienceDto } from './dto/update-person-experience.dto';
import { UpdatePersonIdentityDocumentDto } from './dto/update-person-identity-document.dto';
import { UpdatePersonLanguageDto } from './dto/update-person-language.dto';
import { UpdatePersonSkillDto } from './dto/update-person-skill.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPerson(actor: AuthenticatedPrincipal, dto: CreatePersonDto) {
    const tenantId = this.requireTenant(actor);
    await this.validatePersonReferences(tenantId, dto);

    const person = await this.prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          tenantId,
          userId: dto.userId,
          firstName: dto.firstName.trim(),
          middleName: dto.middleName?.trim(),
          lastName: dto.lastName.trim(),
          preferredName: dto.preferredName?.trim(),
          dateOfBirth: this.toDate(dto.dateOfBirth),
          gender: dto.gender,
          maritalStatus: dto.maritalStatus,
          nationalityId: dto.nationalityId,
          photoUrl: dto.photoUrl,
          signatureUrl: dto.signatureUrl,
          bloodGroup: dto.bloodGroup,
          disabilityStatus: dto.disabilityStatus,
          veteranStatus: dto.veteranStatus,
          bio: dto.bio,
          metadata: this.toJson(dto.metadata),
        },
        include: this.personInclude,
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: actor.id,
          action: AuditAction.CREATE,
          module: 'persons',
          entityType: 'Person',
          entityId: created.id,
          after: this.personAuditShape(created),
        },
      });

      await tx.outboxMessage.create({
        data: {
          tenantId,
          eventType: 'person.created',
          aggregateType: 'Person',
          aggregateId: created.id,
          payload: {
            personId: created.id,
            tenantId,
          },
        },
      });

      return created;
    });

    return person;
  }

  async listPersons(actor: AuthenticatedPrincipal, query: ListPersonsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const persons = await this.prisma.person.findMany({
      where: {
        tenantId,
        deletedAt: query.includeDeleted ? undefined : null,
        OR: query.search
          ? [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { middleName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { preferredName: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      include: this.personInclude,
    });

    const hasNextPage = persons.length > limit;
    const data = hasNextPage ? persons.slice(0, limit) : persons;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? data.at(-1)?.id : null,
      },
    };
  }

  async getPerson(actor: AuthenticatedPrincipal, personId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findPersonOrThrow(tenantId, personId);
  }

  async updatePerson(actor: AuthenticatedPrincipal, personId: string, dto: UpdatePersonDto) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.findPersonOrThrow(tenantId, personId);
    await this.validatePersonReferences(tenantId, dto);

    const updated = await this.prisma.person.update({
      where: { id: existing.id },
      data: {
        userId: dto.userId,
        firstName: dto.firstName?.trim(),
        middleName: dto.middleName?.trim(),
        lastName: dto.lastName?.trim(),
        preferredName: dto.preferredName?.trim(),
        dateOfBirth: this.toDate(dto.dateOfBirth),
        gender: dto.gender,
        maritalStatus: dto.maritalStatus,
        nationalityId: dto.nationalityId,
        photoUrl: dto.photoUrl,
        signatureUrl: dto.signatureUrl,
        bloodGroup: dto.bloodGroup,
        disabilityStatus: dto.disabilityStatus,
        veteranStatus: dto.veteranStatus,
        bio: dto.bio,
        metadata: this.toJson(dto.metadata),
      },
      include: this.personInclude,
    });

    await this.writeAudit(actor, tenantId, AuditAction.UPDATE, 'Person', updated.id, {
      firstName: existing.firstName,
      lastName: existing.lastName,
      preferredName: existing.preferredName,
    }, this.personAuditShape(updated));

    return updated;
  }

  async deletePerson(actor: AuthenticatedPrincipal, personId: string) {
    const tenantId = this.requireTenant(actor);
    const person = await this.findPersonOrThrow(tenantId, personId);
    const employeeCount = await this.prisma.employee.count({
      where: {
        tenantId,
        personId: person.id,
        deletedAt: null,
      },
    });

    if (employeeCount > 0) {
      throw new BadRequestException('Cannot delete a person that is linked to an employee record.');
    }

    const deleted = await this.prisma.person.update({
      where: { id: person.id },
      data: { deletedAt: new Date() },
    });

    await this.writeAudit(actor, tenantId, AuditAction.DELETE, 'Person', person.id, this.personAuditShape(person), {
      deletedAt: deleted.deletedAt,
    });

    return { deleted: true };
  }

  async listContacts(actor: AuthenticatedPrincipal, personId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    return this.prisma.personContact.findMany({
      where: { personId },
      orderBy: [{ isPrimary: 'desc' }, { type: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createContact(actor: AuthenticatedPrincipal, personId: string, dto: CreatePersonContactDto) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);

    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.personContact.updateMany({
          where: { personId, type: dto.type.trim().toUpperCase() },
          data: { isPrimary: false },
        });
      }

      return tx.personContact.create({
        data: {
          personId,
          type: dto.type.trim().toUpperCase(),
          value: dto.value.trim(),
          label: dto.label,
          isPrimary: dto.isPrimary ?? false,
          verifiedAt: this.toDate(dto.verifiedAt),
        },
      });
    });

    await this.writeAudit(actor, tenantId, AuditAction.CREATE, 'PersonContact', contact.id, null, {
      personId,
      type: contact.type,
    });

    return contact;
  }

  async updateContact(
    actor: AuthenticatedPrincipal,
    personId: string,
    contactId: string,
    dto: UpdatePersonContactDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    const existingContact = await this.prisma.personContact.findFirst({
      where: {
        id: contactId,
        personId,
        person: {
          tenantId,
          deletedAt: null,
        },
      },
      select: { type: true },
    });

    if (!existingContact) {
      throw new NotFoundException('Person profile item not found.');
    }

    const contact = await this.prisma.$transaction(async (tx) => {
      const targetType = dto.type?.trim().toUpperCase() ?? existingContact.type;

      if (dto.isPrimary) {
        await tx.personContact.updateMany({
          where: { personId, id: { not: contactId }, type: targetType },
          data: { isPrimary: false },
        });
      }

      return tx.personContact.update({
        where: { id: contactId },
        data: {
          type: dto.type?.trim().toUpperCase(),
          value: dto.value?.trim(),
          label: dto.label,
          isPrimary: dto.isPrimary,
          verifiedAt: this.toDate(dto.verifiedAt),
        },
      });
    });

    await this.writeAudit(actor, tenantId, AuditAction.UPDATE, 'PersonContact', contact.id, null, {
      personId,
      type: contact.type,
    });

    return contact;
  }

  async deleteContact(actor: AuthenticatedPrincipal, personId: string, contactId: string) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personContact', contactId, personId);
    await this.prisma.personContact.delete({ where: { id: contactId } });
    await this.writeAudit(actor, tenantId, AuditAction.DELETE, 'PersonContact', contactId, null, {
      deleted: true,
    });
    return { deleted: true };
  }

  async listAddresses(actor: AuthenticatedPrincipal, personId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    return this.prisma.personAddress.findMany({
      where: { personId },
      include: { country: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createAddress(actor: AuthenticatedPrincipal, personId: string, dto: CreatePersonAddressDto) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    await this.validateCountry(dto.countryId);

    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.personAddress.updateMany({ where: { personId }, data: { isPrimary: false } });
      }

      return tx.personAddress.create({
        data: {
          personId,
          type: dto.type,
          line1: dto.line1,
          line2: dto.line2,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          countryId: dto.countryId,
          isPrimary: dto.isPrimary ?? false,
        },
        include: { country: true },
      });
    });

    await this.writeAudit(actor, tenantId, AuditAction.CREATE, 'PersonAddress', address.id, null, {
      personId,
    });

    return address;
  }

  async updateAddress(
    actor: AuthenticatedPrincipal,
    personId: string,
    addressId: string,
    dto: UpdatePersonAddressDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    await this.ensureChildExists(tenantId, 'personAddress', addressId, personId);
    await this.validateCountry(dto.countryId);

    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.personAddress.updateMany({
          where: { personId, id: { not: addressId } },
          data: { isPrimary: false },
        });
      }

      return tx.personAddress.update({
        where: { id: addressId },
        data: {
          type: dto.type,
          line1: dto.line1,
          line2: dto.line2,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          countryId: dto.countryId,
          isPrimary: dto.isPrimary,
        },
        include: { country: true },
      });
    });

    await this.writeAudit(actor, tenantId, AuditAction.UPDATE, 'PersonAddress', address.id, null, {
      personId,
    });

    return address;
  }

  async deleteAddress(actor: AuthenticatedPrincipal, personId: string, addressId: string) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personAddress', addressId, personId);
    await this.prisma.personAddress.delete({ where: { id: addressId } });
    await this.writeAudit(actor, tenantId, AuditAction.DELETE, 'PersonAddress', addressId, null, {
      deleted: true,
    });
    return { deleted: true };
  }

  async listIdentityDocuments(actor: AuthenticatedPrincipal, personId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    return this.prisma.personIdentityDocument.findMany({
      where: { personId },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createIdentityDocument(
    actor: AuthenticatedPrincipal,
    personId: string,
    dto: CreatePersonIdentityDocumentDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);

    const identity = await this.prisma.personIdentityDocument.create({
      data: {
        personId,
        type: dto.type,
        documentNumber: dto.documentNumber.trim(),
        issuingCountry: dto.issuingCountry,
        issuedAt: this.toDate(dto.issuedAt),
        expiresAt: this.toDate(dto.expiresAt),
        fileUrl: dto.fileUrl,
        metadata: this.toJson(dto.metadata),
      },
    });

    await this.writeAudit(actor, tenantId, AuditAction.CREATE, 'PersonIdentityDocument', identity.id, null, {
      personId,
      type: identity.type,
    });

    return identity;
  }

  async updateIdentityDocument(
    actor: AuthenticatedPrincipal,
    personId: string,
    identityId: string,
    dto: UpdatePersonIdentityDocumentDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personIdentityDocument', identityId, personId);

    const identity = await this.prisma.personIdentityDocument.update({
      where: { id: identityId },
      data: {
        type: dto.type,
        documentNumber: dto.documentNumber?.trim(),
        issuingCountry: dto.issuingCountry,
        issuedAt: this.toDate(dto.issuedAt),
        expiresAt: this.toDate(dto.expiresAt),
        fileUrl: dto.fileUrl,
        metadata: this.toJson(dto.metadata),
      },
    });

    await this.writeAudit(actor, tenantId, AuditAction.UPDATE, 'PersonIdentityDocument', identity.id, null, {
      type: identity.type,
    });

    return identity;
  }

  async deleteIdentityDocument(actor: AuthenticatedPrincipal, personId: string, identityId: string) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personIdentityDocument', identityId, personId);
    await this.prisma.personIdentityDocument.delete({ where: { id: identityId } });
    await this.writeAudit(actor, tenantId, AuditAction.DELETE, 'PersonIdentityDocument', identityId, null, {
      deleted: true,
    });
    return { deleted: true };
  }

  async listEmergencyContacts(actor: AuthenticatedPrincipal, personId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    return this.prisma.emergencyContact.findMany({
      where: { personId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createEmergencyContact(
    actor: AuthenticatedPrincipal,
    personId: string,
    dto: CreateEmergencyContactDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);

    const emergencyContact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.emergencyContact.updateMany({ where: { personId }, data: { isPrimary: false } });
      }

      return tx.emergencyContact.create({
        data: {
          personId,
          name: dto.name.trim(),
          relationship: dto.relationship,
          phone: dto.phone,
          email: dto.email,
          address: this.toJson(dto.address),
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });

    await this.writeAudit(actor, tenantId, AuditAction.CREATE, 'EmergencyContact', emergencyContact.id, null, {
      personId,
      name: emergencyContact.name,
    });

    return emergencyContact;
  }

  async updateEmergencyContact(
    actor: AuthenticatedPrincipal,
    personId: string,
    emergencyContactId: string,
    dto: UpdateEmergencyContactDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    await this.ensureChildExists(tenantId, 'emergencyContact', emergencyContactId, personId);

    const emergencyContact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.emergencyContact.updateMany({
          where: { personId, id: { not: emergencyContactId } },
          data: { isPrimary: false },
        });
      }

      return tx.emergencyContact.update({
        where: { id: emergencyContactId },
        data: {
          name: dto.name?.trim(),
          relationship: dto.relationship,
          phone: dto.phone,
          email: dto.email,
          address: this.toJson(dto.address),
          isPrimary: dto.isPrimary,
        },
      });
    });

    await this.writeAudit(actor, tenantId, AuditAction.UPDATE, 'EmergencyContact', emergencyContact.id, null, {
      personId,
      name: emergencyContact.name,
    });

    return emergencyContact;
  }

  async deleteEmergencyContact(
    actor: AuthenticatedPrincipal,
    personId: string,
    emergencyContactId: string,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'emergencyContact', emergencyContactId, personId);
    await this.prisma.emergencyContact.delete({ where: { id: emergencyContactId } });
    await this.writeAudit(actor, tenantId, AuditAction.DELETE, 'EmergencyContact', emergencyContactId, null, {
      deleted: true,
    });
    return { deleted: true };
  }

  async addEducation(actor: AuthenticatedPrincipal, personId: string, dto: CreatePersonEducationDto) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);

    return this.prisma.personEducation.create({
      data: {
        personId,
        institution: dto.institution.trim(),
        degree: dto.degree,
        fieldOfStudy: dto.fieldOfStudy,
        startDate: this.toDate(dto.startDate),
        endDate: this.toDate(dto.endDate),
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async updateEducation(
    actor: AuthenticatedPrincipal,
    personId: string,
    educationId: string,
    dto: UpdatePersonEducationDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personEducation', educationId, personId);
    return this.prisma.personEducation.update({
      where: { id: educationId },
      data: {
        institution: dto.institution?.trim(),
        degree: dto.degree,
        fieldOfStudy: dto.fieldOfStudy,
        startDate: this.toDate(dto.startDate),
        endDate: this.toDate(dto.endDate),
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async deleteEducation(actor: AuthenticatedPrincipal, personId: string, educationId: string) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personEducation', educationId, personId);
    await this.prisma.personEducation.delete({ where: { id: educationId } });
    return { deleted: true };
  }

  async addExperience(actor: AuthenticatedPrincipal, personId: string, dto: CreatePersonExperienceDto) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);

    return this.prisma.personExperience.create({
      data: {
        personId,
        company: dto.company.trim(),
        title: dto.title,
        startDate: this.toDate(dto.startDate),
        endDate: this.toDate(dto.endDate),
        description: dto.description,
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async updateExperience(
    actor: AuthenticatedPrincipal,
    personId: string,
    experienceId: string,
    dto: UpdatePersonExperienceDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personExperience', experienceId, personId);
    return this.prisma.personExperience.update({
      where: { id: experienceId },
      data: {
        company: dto.company?.trim(),
        title: dto.title,
        startDate: this.toDate(dto.startDate),
        endDate: this.toDate(dto.endDate),
        description: dto.description,
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async deleteExperience(actor: AuthenticatedPrincipal, personId: string, experienceId: string) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personExperience', experienceId, personId);
    await this.prisma.personExperience.delete({ where: { id: experienceId } });
    return { deleted: true };
  }

  async listSkillCatalog(actor: AuthenticatedPrincipal, search?: string) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.skill.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: [{ name: 'asc' }],
      take: 100,
    });
  }

  async addSkill(actor: AuthenticatedPrincipal, personId: string, dto: CreatePersonSkillDto) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);
    const skillId = await this.resolveSkill(tenantId, dto);

    return this.prisma.personSkill.upsert({
      where: {
        personId_skillId: {
          personId,
          skillId,
        },
      },
      create: {
        personId,
        skillId,
        proficiency: dto.proficiency,
        years: dto.years,
      },
      update: {
        proficiency: dto.proficiency,
        years: dto.years,
      },
      include: { skill: true },
    });
  }

  async updateSkill(
    actor: AuthenticatedPrincipal,
    personId: string,
    personSkillId: string,
    dto: UpdatePersonSkillDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personSkill', personSkillId, personId);
    return this.prisma.personSkill.update({
      where: { id: personSkillId },
      data: {
        proficiency: dto.proficiency,
        years: dto.years,
      },
      include: { skill: true },
    });
  }

  async deleteSkill(actor: AuthenticatedPrincipal, personId: string, personSkillId: string) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personSkill', personSkillId, personId);
    await this.prisma.personSkill.delete({ where: { id: personSkillId } });
    return { deleted: true };
  }

  async addLanguage(actor: AuthenticatedPrincipal, personId: string, dto: CreatePersonLanguageDto) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);

    return this.prisma.personLanguage.upsert({
      where: {
        personId_languageCode: {
          personId,
          languageCode: dto.languageCode.trim().toLowerCase(),
        },
      },
      create: {
        personId,
        languageCode: dto.languageCode.trim().toLowerCase(),
        proficiency: dto.proficiency,
      },
      update: {
        proficiency: dto.proficiency,
      },
    });
  }

  async updateLanguage(
    actor: AuthenticatedPrincipal,
    personId: string,
    languageId: string,
    dto: UpdatePersonLanguageDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personLanguage', languageId, personId);
    return this.prisma.personLanguage.update({
      where: { id: languageId },
      data: { proficiency: dto.proficiency },
    });
  }

  async deleteLanguage(actor: AuthenticatedPrincipal, personId: string, languageId: string) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personLanguage', languageId, personId);
    await this.prisma.personLanguage.delete({ where: { id: languageId } });
    return { deleted: true };
  }

  async addCertification(
    actor: AuthenticatedPrincipal,
    personId: string,
    dto: CreatePersonCertificationDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findPersonOrThrow(tenantId, personId);

    return this.prisma.personCertification.create({
      data: {
        personId,
        name: dto.name.trim(),
        issuer: dto.issuer,
        issuedAt: this.toDate(dto.issuedAt),
        expiresAt: this.toDate(dto.expiresAt),
        credentialId: dto.credentialId,
        fileUrl: dto.fileUrl,
      },
    });
  }

  async updateCertification(
    actor: AuthenticatedPrincipal,
    personId: string,
    certificationId: string,
    dto: UpdatePersonCertificationDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personCertification', certificationId, personId);
    return this.prisma.personCertification.update({
      where: { id: certificationId },
      data: {
        name: dto.name?.trim(),
        issuer: dto.issuer,
        issuedAt: this.toDate(dto.issuedAt),
        expiresAt: this.toDate(dto.expiresAt),
        credentialId: dto.credentialId,
        fileUrl: dto.fileUrl,
      },
    });
  }

  async deleteCertification(actor: AuthenticatedPrincipal, personId: string, certificationId: string) {
    const tenantId = this.requireTenant(actor);
    await this.ensureChildExists(tenantId, 'personCertification', certificationId, personId);
    await this.prisma.personCertification.delete({ where: { id: certificationId } });
    return { deleted: true };
  }

  private async validatePersonReferences(tenantId: string, dto: Partial<CreatePersonDto>) {
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: dto.userId,
          tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!user) {
        throw new BadRequestException('User reference is invalid for this tenant.');
      }
    }

    if (dto.nationalityId) {
      await this.validateCountry(dto.nationalityId);
    }
  }

  private async validateCountry(countryId?: string) {
    if (!countryId) {
      return;
    }

    const country = await this.prisma.country.findUnique({
      where: { id: countryId },
      select: { id: true },
    });

    if (!country) {
      throw new BadRequestException('Country reference is invalid.');
    }
  }

  private async resolveSkill(tenantId: string, dto: CreatePersonSkillDto): Promise<string> {
    if (dto.skillId) {
      const skill = await this.prisma.skill.findFirst({
        where: {
          id: dto.skillId,
          OR: [{ tenantId: null }, { tenantId }],
        },
      });

      if (!skill) {
        throw new BadRequestException('Skill reference is invalid.');
      }

      return skill.id;
    }

    if (!dto.skillName) {
      throw new BadRequestException('Either skillId or skillName is required.');
    }

    const skill = await this.prisma.skill.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: dto.skillName.trim(),
        },
      },
      create: {
        tenantId,
        name: dto.skillName.trim(),
        category: dto.category,
      },
      update: {
        category: dto.category,
      },
    });

    return skill.id;
  }

  private async findPersonOrThrow(tenantId: string, personId: string) {
    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        tenantId,
        deletedAt: null,
      },
      include: this.personInclude,
    });

    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    return person;
  }

  private async ensureChildExists(
    tenantId: string,
    model: ChildModel,
    id: string,
    personId?: string,
  ) {
    const exists = await this.childExists(tenantId, model, id, personId);

    if (!exists) {
      throw new NotFoundException('Person profile item not found.');
    }
  }

  private childExists(
    tenantId: string,
    model: ChildModel,
    id: string,
    personId?: string,
  ): Promise<boolean> {
    const where = {
      id,
      personId,
      person: {
        tenantId,
        deletedAt: null,
      },
    };

    switch (model) {
      case 'personContact':
        return this.prisma.personContact.count({ where }).then(Boolean);
      case 'personAddress':
        return this.prisma.personAddress.count({ where }).then(Boolean);
      case 'personIdentityDocument':
        return this.prisma.personIdentityDocument.count({ where }).then(Boolean);
      case 'emergencyContact':
        return this.prisma.emergencyContact.count({ where }).then(Boolean);
      case 'personEducation':
        return this.prisma.personEducation.count({ where }).then(Boolean);
      case 'personExperience':
        return this.prisma.personExperience.count({ where }).then(Boolean);
      case 'personSkill':
        return this.prisma.personSkill.count({ where }).then(Boolean);
      case 'personLanguage':
        return this.prisma.personLanguage.count({ where }).then(Boolean);
      case 'personCertification':
        return this.prisma.personCertification.count({ where }).then(Boolean);
    }
  }

  private personAuditShape(person: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    nationalityId: string | null;
  }): Prisma.InputJsonValue {
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      preferredName: person.preferredName,
      nationalityId: person.nationalityId,
    };
  }

  private async writeAudit(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'persons',
        entityType,
        entityId,
        before: before ?? undefined,
        after,
      },
    });
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

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private get personInclude() {
    return {
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
      education: {
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      },
      experiences: {
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
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
      employees: {
        select: {
          id: true,
          employeeNumber: true,
          status: true,
          employmentType: true,
        },
      },
    } satisfies Prisma.PersonInclude;
  }
}

type ChildModel =
  | 'personContact'
  | 'personAddress'
  | 'personIdentityDocument'
  | 'emergencyContact'
  | 'personEducation'
  | 'personExperience'
  | 'personSkill'
  | 'personLanguage'
  | 'personCertification';
