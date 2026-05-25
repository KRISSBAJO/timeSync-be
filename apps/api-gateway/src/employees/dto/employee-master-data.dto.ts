import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentVerificationStatus,
  EmployeeBackgroundCheckStatus,
  EmployeeReferenceStatus,
  EmployeeReferenceType,
  EmployeeStatutoryIdentifierStatus,
  EmployeeStatutoryIdentifierType,
  Gender,
  MaritalStatus,
  PayoutAccountStatus,
  WorkEligibilityStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateEmployeeDemographicProfileDto {
  @ApiPropertyOptional({ example: 'she/her' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pronouns?: string;

  @ApiPropertyOptional({ example: 'Woman' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  genderIdentity?: string;

  @ApiPropertyOptional({ example: 'Prefer not to say' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sexAssignedAtBirth?: string;

  @ApiPropertyOptional({ example: 'Prefer not to say' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sexualOrientation?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  preferredLanguageCode?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  primaryLanguageCode?: string;

  @ApiPropertyOptional({ example: 'Black or African descent' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  race?: string;

  @ApiPropertyOptional({ example: 'Not disclosed' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ethnicity?: string;

  @ApiPropertyOptional({ example: 'Yoruba' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ethnicityDetail?: string;

  @ApiPropertyOptional({ example: 'Not disclosed' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  religion?: string;

  @ApiPropertyOptional({ example: 'Christianity' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  religionDetail?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  demographicCountryId?: string;

  @ApiPropertyOptional({ example: 'Standing desk approved.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  disabilityAccommodation?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  accommodationRequired?: boolean;

  @ApiPropertyOptional({ example: 'Protected veteran' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  veteranCategory?: string;

  @ApiPropertyOptional({ example: 'Primary caregiver' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  caregiverStatus?: string;

  @ApiPropertyOptional({ example: 'Self-service profile update' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  consentSource?: string;

  @ApiPropertyOptional({ example: 'Employee confirmed voluntary profile data.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  consentNote?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  consentGiven?: boolean;

  @ApiPropertyOptional({ example: { source: 'self-service' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateSelfServiceAddressDto {
  @ApiPropertyOptional({ example: 'home' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;

  @ApiPropertyOptional({ example: '1200 Market Street' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  line1?: string;

  @ApiPropertyOptional({ example: 'Suite 400' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  line2?: string;

  @ApiPropertyOptional({ example: 'Chicago' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 'IL' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @ApiPropertyOptional({ example: '60601' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  countryId?: string;
}

export class UpdateSelfServiceEmergencyContactDto {
  @ApiPropertyOptional({ example: 'Morgan Lee' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  relationship?: string;

  @ApiPropertyOptional({ example: '+1 312 555 0199' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string;

  @ApiPropertyOptional({ example: 'morgan@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(240)
  email?: string;
}

export class UpdateEmployeeMasterDataDto {
  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Lovelace' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  middleName?: string;

  @ApiPropertyOptional({ example: 'Byron' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredName?: string;

  @ApiPropertyOptional({ example: '1990-01-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: MaritalStatus })
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  nationalityId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/person.png' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  photoUrl?: string;

  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'None disclosed' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  disabilityStatus?: string;

  @ApiPropertyOptional({ example: 'Not applicable' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  veteranStatus?: string;

  @ApiPropertyOptional({ example: 'Senior HR operations leader.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bio?: string;

  @ApiPropertyOptional({ type: UpdateEmployeeDemographicProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeeDemographicProfileDto)
  demographics?: UpdateEmployeeDemographicProfileDto;
}

export class UpdateEmployeeSelfServiceMasterDataDto {
  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/person.png' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  photoUrl?: string;

  @ApiPropertyOptional({ example: 'I lead workforce operations.' })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  bio?: string;

  @ApiPropertyOptional({ example: 'employee.personal@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(240)
  personalEmail?: string;

  @ApiPropertyOptional({ example: '+1 312 555 0100' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string;

  @ApiPropertyOptional({ type: UpdateSelfServiceAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSelfServiceAddressDto)
  address?: UpdateSelfServiceAddressDto;

  @ApiPropertyOptional({ type: UpdateSelfServiceEmergencyContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSelfServiceEmergencyContactDto)
  emergencyContact?: UpdateSelfServiceEmergencyContactDto;

  @ApiPropertyOptional({ type: UpdateEmployeeDemographicProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeeDemographicProfileDto)
  demographics?: UpdateEmployeeDemographicProfileDto;
}

export class UpsertEmployeeDependentDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional({ example: 'Morgan Lee' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  relationship?: string;

  @ApiPropertyOptional({ example: '2014-04-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '+1 312 555 0199' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string;

  @ApiPropertyOptional({ example: 'morgan@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(240)
  email?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  taxDependent?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  benefitEligible?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isStudent?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDisabled?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ example: { source: 'employee-profile' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertEmployeeReferenceDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional({ enum: EmployeeReferenceType, default: EmployeeReferenceType.PROFESSIONAL })
  @IsOptional()
  @IsEnum(EmployeeReferenceType)
  type?: EmployeeReferenceType;

  @ApiPropertyOptional({ example: 'Grace Hopper' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ example: 'Former manager' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  relationship?: string;

  @ApiPropertyOptional({ example: 'Acme Labs' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  company?: string;

  @ApiPropertyOptional({ example: 'Director of Operations' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'grace@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(240)
  email?: string;

  @ApiPropertyOptional({ example: '+1 312 555 0111' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(80)
  yearsKnown?: number;

  @ApiPropertyOptional({ enum: EmployeeReferenceStatus })
  @IsOptional()
  @IsEnum(EmployeeReferenceStatus)
  status?: EmployeeReferenceStatus;

  @ApiPropertyOptional({ example: 'Reference confirmed employment history.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: { source: 'onboarding' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertEmployeeReferenceDocumentDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  referenceId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  documentId?: string;

  @ApiPropertyOptional({ example: 'reference-letter.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  fileName?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/reference-letter.pdf' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  fileUrl?: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @ApiPropertyOptional({ example: 1048576 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 'sha256:abc123' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  checksum?: string;

  @ApiPropertyOptional({ enum: DocumentVerificationStatus })
  @IsOptional()
  @IsEnum(DocumentVerificationStatus)
  verificationStatus?: DocumentVerificationStatus;

  @ApiPropertyOptional({ example: { source: 'reference-check' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertEmployeeBackgroundCheckDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional({ example: 'Checkr' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  provider?: string;

  @ApiPropertyOptional({ example: 'Employment plus identity' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  packageName?: string;

  @ApiPropertyOptional({ enum: EmployeeBackgroundCheckStatus })
  @IsOptional()
  @IsEnum(EmployeeBackgroundCheckStatus)
  status?: EmployeeBackgroundCheckStatus;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  requestedAt?: string;

  @ApiPropertyOptional({ example: '2026-06-05T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ example: '2027-06-05T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'Clear for hire.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resultSummary?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/background-report.pdf' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  reportUrl?: string;

  @ApiPropertyOptional({ example: { complianceReview: 'complete' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertEmployeePayoutAccountDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional({ example: 'Ada Byron' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  accountHolderName?: string;

  @ApiPropertyOptional({ example: 'Acme Bank' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  bankName?: string;

  @ApiPropertyOptional({ example: 'Checking' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountType?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currencyCode?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  countryId?: string;

  @ApiPropertyOptional({ example: '1234567890', description: 'Received once, stored only as masked/fingerprinted values.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  accountNumber?: string;

  @ApiPropertyOptional({ example: '021000021', description: 'Received once, stored only as masked/fingerprinted values.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  routingNumber?: string;

  @ApiPropertyOptional({ example: 'GB29NWBK60161331926819', description: 'Received once, stored only as masked/fingerprinted values.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  iban?: string;

  @ApiPropertyOptional({ example: 'BOFAUS3N' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  swiftCode?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  allocationPercent?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ enum: PayoutAccountStatus })
  @IsOptional()
  @IsEnum(PayoutAccountStatus)
  status?: PayoutAccountStatus;

  @ApiPropertyOptional({ example: { payrollProvider: 'primary' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertEmployeeStatutoryIdentifierDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional({ enum: EmployeeStatutoryIdentifierType })
  @IsOptional()
  @IsEnum(EmployeeStatutoryIdentifierType)
  type?: EmployeeStatutoryIdentifierType;

  @ApiPropertyOptional({ example: 'Federal tax ID' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  countryId?: string;

  @ApiPropertyOptional({ example: '123-45-6789', description: 'Received once, stored only as masked/fingerprinted values.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  identifier?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2030-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ enum: EmployeeStatutoryIdentifierStatus })
  @IsOptional()
  @IsEnum(EmployeeStatutoryIdentifierStatus)
  status?: EmployeeStatutoryIdentifierStatus;

  @ApiPropertyOptional({ example: 'Reviewed for finance onboarding.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: { source: 'tax-form' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertEmployeeWorkEligibilityDto {
  @ApiPropertyOptional({ enum: WorkEligibilityStatus })
  @IsOptional()
  @IsEnum(WorkEligibilityStatus)
  status?: WorkEligibilityStatus;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  workCountryId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  taxCountryId?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  workPermitRequired?: boolean;

  @ApiPropertyOptional({ example: 'H-1B' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  permitType?: string;

  @ApiPropertyOptional({ example: 'A123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  permitNumber?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2028-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'Work authorization reviewed.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: { verificationSource: 'document-review' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEmployeeExtendedProfileDto {
  @ApiPropertyOptional({ type: [UpsertEmployeeDependentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UpsertEmployeeDependentDto)
  dependents?: UpsertEmployeeDependentDto[];

  @ApiPropertyOptional({ type: [UpsertEmployeeReferenceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => UpsertEmployeeReferenceDto)
  references?: UpsertEmployeeReferenceDto[];

  @ApiPropertyOptional({ type: [UpsertEmployeeReferenceDocumentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UpsertEmployeeReferenceDocumentDto)
  referenceDocuments?: UpsertEmployeeReferenceDocumentDto[];

  @ApiPropertyOptional({ type: [UpsertEmployeeBackgroundCheckDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => UpsertEmployeeBackgroundCheckDto)
  backgroundChecks?: UpsertEmployeeBackgroundCheckDto[];

  @ApiPropertyOptional({ type: [UpsertEmployeePayoutAccountDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => UpsertEmployeePayoutAccountDto)
  payoutAccounts?: UpsertEmployeePayoutAccountDto[];

  @ApiPropertyOptional({ type: [UpsertEmployeeStatutoryIdentifierDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => UpsertEmployeeStatutoryIdentifierDto)
  statutoryIdentifiers?: UpsertEmployeeStatutoryIdentifierDto[];

  @ApiPropertyOptional({ type: UpsertEmployeeWorkEligibilityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertEmployeeWorkEligibilityDto)
  workEligibility?: UpsertEmployeeWorkEligibilityDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  removeDependentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  removeReferenceIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  removeReferenceDocumentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  removeBackgroundCheckIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  removePayoutAccountIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsUUID('4', { each: true })
  removeStatutoryIdentifierIds?: string[];
}
