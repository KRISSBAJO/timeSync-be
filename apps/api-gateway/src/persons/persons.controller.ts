import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
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
import { PersonsService } from './persons.service';

@ApiTags('persons')
@ApiCookieAuth('access_token')
@Controller('api/v1/persons')
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get('skills/catalog')
  @RequirePermissions('persons.read')
  @ApiOperation({ summary: 'List tenant/global skills for person profiles.' })
  @ApiOkResponse({ description: 'Skills returned.' })
  async skillCatalog(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('search') search?: string,
  ) {
    return this.personsService.listSkillCatalog(user, search);
  }

  @Post()
  @RequirePermissions('persons.write')
  @ApiOperation({ summary: 'Create a person identity record.' })
  @ApiOkResponse({ description: 'Person created.' })
  async createPerson(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreatePersonDto) {
    return this.personsService.createPerson(user, dto);
  }

  @Get()
  @RequirePermissions('persons.read')
  @ApiOperation({ summary: 'List person identity records.' })
  @ApiOkResponse({ description: 'Persons returned.' })
  async listPersons(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListPersonsQueryDto,
  ) {
    return this.personsService.listPersons(user, query);
  }

  @Get(':id')
  @RequirePermissions('persons.read')
  @ApiOperation({ summary: 'Get a person profile without sensitive identity documents.' })
  @ApiOkResponse({ description: 'Person returned.' })
  async getPerson(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') personId: string) {
    return this.personsService.getPerson(user, personId);
  }

  @Patch(':id')
  @RequirePermissions('persons.write')
  @ApiOperation({ summary: 'Update a person identity record.' })
  @ApiOkResponse({ description: 'Person updated.' })
  async updatePerson(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: UpdatePersonDto,
  ) {
    return this.personsService.updatePerson(user, personId, dto);
  }

  @Delete(':id')
  @RequirePermissions('persons.write')
  @ApiOperation({ summary: 'Soft-delete a person identity record.' })
  @ApiOkResponse({ description: 'Person deleted.' })
  async deletePerson(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') personId: string) {
    return this.personsService.deletePerson(user, personId);
  }

  @Get(':id/contacts')
  @RequirePermissions('persons.read')
  async contacts(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') personId: string) {
    return this.personsService.listContacts(user, personId);
  }

  @Post(':id/contacts')
  @RequirePermissions('persons.write')
  async createContact(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreatePersonContactDto,
  ) {
    return this.personsService.createContact(user, personId, dto);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermissions('persons.write')
  async updateContact(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdatePersonContactDto,
  ) {
    return this.personsService.updateContact(user, personId, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('persons.write')
  async deleteContact(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.personsService.deleteContact(user, personId, contactId);
  }

  @Get(':id/addresses')
  @RequirePermissions('persons.read')
  async addresses(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') personId: string) {
    return this.personsService.listAddresses(user, personId);
  }

  @Post(':id/addresses')
  @RequirePermissions('persons.write')
  async createAddress(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreatePersonAddressDto,
  ) {
    return this.personsService.createAddress(user, personId, dto);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions('persons.write')
  async updateAddress(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdatePersonAddressDto,
  ) {
    return this.personsService.updateAddress(user, personId, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions('persons.write')
  async deleteAddress(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.personsService.deleteAddress(user, personId, addressId);
  }

  @Get(':id/identity-documents')
  @RequirePermissions('persons.sensitive.read')
  async identityDocuments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
  ) {
    return this.personsService.listIdentityDocuments(user, personId);
  }

  @Post(':id/identity-documents')
  @RequirePermissions('persons.write', 'persons.sensitive.read')
  async createIdentityDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreatePersonIdentityDocumentDto,
  ) {
    return this.personsService.createIdentityDocument(user, personId, dto);
  }

  @Patch(':id/identity-documents/:identityId')
  @RequirePermissions('persons.write', 'persons.sensitive.read')
  async updateIdentityDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('identityId') identityId: string,
    @Body() dto: UpdatePersonIdentityDocumentDto,
  ) {
    return this.personsService.updateIdentityDocument(user, personId, identityId, dto);
  }

  @Delete(':id/identity-documents/:identityId')
  @RequirePermissions('persons.write', 'persons.sensitive.read')
  async deleteIdentityDocument(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('identityId') identityId: string,
  ) {
    return this.personsService.deleteIdentityDocument(user, personId, identityId);
  }

  @Get(':id/emergency-contacts')
  @RequirePermissions('persons.read')
  async emergencyContacts(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
  ) {
    return this.personsService.listEmergencyContacts(user, personId);
  }

  @Post(':id/emergency-contacts')
  @RequirePermissions('persons.write')
  async createEmergencyContact(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreateEmergencyContactDto,
  ) {
    return this.personsService.createEmergencyContact(user, personId, dto);
  }

  @Patch(':id/emergency-contacts/:emergencyContactId')
  @RequirePermissions('persons.write')
  async updateEmergencyContact(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('emergencyContactId') emergencyContactId: string,
    @Body() dto: UpdateEmergencyContactDto,
  ) {
    return this.personsService.updateEmergencyContact(user, personId, emergencyContactId, dto);
  }

  @Delete(':id/emergency-contacts/:emergencyContactId')
  @RequirePermissions('persons.write')
  async deleteEmergencyContact(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('emergencyContactId') emergencyContactId: string,
  ) {
    return this.personsService.deleteEmergencyContact(user, personId, emergencyContactId);
  }

  @Post(':id/education')
  @RequirePermissions('persons.write')
  async addEducation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreatePersonEducationDto,
  ) {
    return this.personsService.addEducation(user, personId, dto);
  }

  @Patch(':id/education/:educationId')
  @RequirePermissions('persons.write')
  async updateEducation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('educationId') educationId: string,
    @Body() dto: UpdatePersonEducationDto,
  ) {
    return this.personsService.updateEducation(user, personId, educationId, dto);
  }

  @Delete(':id/education/:educationId')
  @RequirePermissions('persons.write')
  async deleteEducation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('educationId') educationId: string,
  ) {
    return this.personsService.deleteEducation(user, personId, educationId);
  }

  @Post(':id/experiences')
  @RequirePermissions('persons.write')
  async addExperience(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreatePersonExperienceDto,
  ) {
    return this.personsService.addExperience(user, personId, dto);
  }

  @Patch(':id/experiences/:experienceId')
  @RequirePermissions('persons.write')
  async updateExperience(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('experienceId') experienceId: string,
    @Body() dto: UpdatePersonExperienceDto,
  ) {
    return this.personsService.updateExperience(user, personId, experienceId, dto);
  }

  @Delete(':id/experiences/:experienceId')
  @RequirePermissions('persons.write')
  async deleteExperience(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('experienceId') experienceId: string,
  ) {
    return this.personsService.deleteExperience(user, personId, experienceId);
  }

  @Post(':id/skills')
  @RequirePermissions('persons.write')
  async addSkill(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreatePersonSkillDto,
  ) {
    return this.personsService.addSkill(user, personId, dto);
  }

  @Patch(':id/skills/:personSkillId')
  @RequirePermissions('persons.write')
  async updateSkill(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('personSkillId') personSkillId: string,
    @Body() dto: UpdatePersonSkillDto,
  ) {
    return this.personsService.updateSkill(user, personId, personSkillId, dto);
  }

  @Delete(':id/skills/:personSkillId')
  @RequirePermissions('persons.write')
  async deleteSkill(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('personSkillId') personSkillId: string,
  ) {
    return this.personsService.deleteSkill(user, personId, personSkillId);
  }

  @Post(':id/languages')
  @RequirePermissions('persons.write')
  async addLanguage(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreatePersonLanguageDto,
  ) {
    return this.personsService.addLanguage(user, personId, dto);
  }

  @Patch(':id/languages/:languageId')
  @RequirePermissions('persons.write')
  async updateLanguage(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('languageId') languageId: string,
    @Body() dto: UpdatePersonLanguageDto,
  ) {
    return this.personsService.updateLanguage(user, personId, languageId, dto);
  }

  @Delete(':id/languages/:languageId')
  @RequirePermissions('persons.write')
  async deleteLanguage(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('languageId') languageId: string,
  ) {
    return this.personsService.deleteLanguage(user, personId, languageId);
  }

  @Post(':id/certifications')
  @RequirePermissions('persons.write')
  async addCertification(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Body() dto: CreatePersonCertificationDto,
  ) {
    return this.personsService.addCertification(user, personId, dto);
  }

  @Patch(':id/certifications/:certificationId')
  @RequirePermissions('persons.write')
  async updateCertification(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('certificationId') certificationId: string,
    @Body() dto: UpdatePersonCertificationDto,
  ) {
    return this.personsService.updateCertification(user, personId, certificationId, dto);
  }

  @Delete(':id/certifications/:certificationId')
  @RequirePermissions('persons.write')
  async deleteCertification(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') personId: string,
    @Param('certificationId') certificationId: string,
  ) {
    return this.personsService.deleteCertification(user, personId, certificationId);
  }
}
