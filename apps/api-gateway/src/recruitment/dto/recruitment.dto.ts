import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  RecruitmentApplicationStatus,
  RecruitmentCandidateStatus,
  RecruitmentControlStatus,
  RecruitmentEmploymentType,
  RecruitmentFeedbackRecommendation,
  RecruitmentInterviewStatus,
  RecruitmentOfferStatus,
  RecruitmentPostingStatus,
  RecruitmentRequisitionStatus,
  RecruitmentStageType,
  RecruitmentTalentProfileStatus,
  RecruitmentWorkMode,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListRecruitmentQueryDto {
  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 'care specialist' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requisitionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  candidateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  applicationId?: string;

  @ApiPropertyOptional({ example: 'OPEN' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CreateRecruitmentApprovalRuleDto {
  @ApiProperty({ example: 'STANDARD_REQUISITION_APPROVAL' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Standard requisition approval' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ enum: RecruitmentControlStatus })
  @IsOptional()
  @IsEnum(RecruitmentControlStatus)
  status?: RecruitmentControlStatus;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiPropertyOptional({ example: 'RECRUITMENT_REQUISITION_APPROVAL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workflowCode?: string;

  @ApiPropertyOptional({ example: 'recruitment.requisition.submitted' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  triggerKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ enum: RecruitmentEmploymentType })
  @IsOptional()
  @IsEnum(RecruitmentEmploymentType)
  employmentType?: RecruitmentEmploymentType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  minHeadcount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  maxHeadcount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000000)
  minSalaryCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000000)
  maxSalaryCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateRecruitmentApprovalRuleDto extends PartialType(CreateRecruitmentApprovalRuleDto) {}

export class CreateRequisitionDto {
  @ApiProperty({ example: 'REQ-CARE-001' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Care Specialist' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hiringManagerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recruiterId?: string;

  @ApiPropertyOptional({ example: 'Clinical Operations' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  departmentName?: string;

  @ApiPropertyOptional({ example: 'Austin, TX' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationName?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  headcount?: number;

  @ApiPropertyOptional({ enum: RecruitmentRequisitionStatus })
  @IsOptional()
  @IsEnum(RecruitmentRequisitionStatus)
  status?: RecruitmentRequisitionStatus;

  @ApiPropertyOptional({ enum: RecruitmentEmploymentType })
  @IsOptional()
  @IsEnum(RecruitmentEmploymentType)
  employmentType?: RecruitmentEmploymentType;

  @ApiPropertyOptional({ enum: RecruitmentWorkMode })
  @IsOptional()
  @IsEnum(RecruitmentWorkMode)
  workMode?: RecruitmentWorkMode;

  @ApiPropertyOptional({ example: 75 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  targetStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000000)
  salaryMinCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000000)
  salaryMaxCents?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  requirements?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateRequisitionDto extends PartialType(CreateRequisitionDto) {}

export class PublishRecruitmentPostingDto {
  @ApiPropertyOptional({ example: 'care-specialist-req-care-spec-2026' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional({ example: 'Care Specialist' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ example: 'Join the care team supporting patient intake and daily operations.' })
  @IsOptional()
  @IsString()
  @MaxLength(700)
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(7000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(7000)
  requirements?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  applyBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  internalOnly?: boolean;

  @ApiPropertyOptional({ enum: RecruitmentPostingStatus })
  @IsOptional()
  @IsEnum(RecruitmentPostingStatus)
  status?: RecruitmentPostingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  questionSet?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  consentText?: string;

  @ApiPropertyOptional({ example: 'Public careers site' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateRecruitmentPostingDto extends PartialType(PublishRecruitmentPostingDto) {}

export class PublicCareerQueryDto {
  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'care specialist' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  search?: string;

  @ApiPropertyOptional({ example: 'remote' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  workMode?: string;

  @ApiPropertyOptional({ example: 'full time' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  employmentType?: string;
}

export class PublicHiringMarketplaceQueryDto extends PublicCareerQueryDto {
  @ApiPropertyOptional({ example: 'acme-health' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenantSlug?: string;

  @ApiPropertyOptional({ example: 'Chicago' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @ApiPropertyOptional({ example: 'Care Coordination' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  department?: string;
}

export class PublicJobApplicationDto {
  @ApiProperty({ example: 'Maya' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Johnson' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'maya.johnson@example.com' })
  @IsEmail()
  @MaxLength(240)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  currentEmployer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  currentTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  resumeUrl?: string;

  @ApiPropertyOptional({ example: 'LinkedIn' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  availabilityNote?: string;

  @ApiProperty()
  @IsBoolean()
  consentAccepted!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class PublicTalentProfileDto {
  @ApiProperty({ example: 'Jordan' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Parker' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'jordan.parker@example.com' })
  @IsEmail()
  @MaxLength(240)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @ApiPropertyOptional({ example: 'Care Coordinator' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  desiredTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  currentTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  currentEmployer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional({ enum: RecruitmentWorkMode, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(RecruitmentWorkMode, { each: true })
  workModes?: RecruitmentWorkMode[];

  @ApiPropertyOptional({ enum: RecruitmentEmploymentType, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsEnum(RecruitmentEmploymentType, { each: true })
  employmentTypes?: RecruitmentEmploymentType[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  resumeUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  portfolioUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  availabilityNote?: string;

  @ApiPropertyOptional({ example: 'public hiring marketplace' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional({ example: 'acme-health' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredTenantSlug?: string;

  @ApiPropertyOptional({ enum: RecruitmentTalentProfileStatus })
  @IsOptional()
  @IsEnum(RecruitmentTalentProfileStatus)
  status?: RecruitmentTalentProfileStatus;

  @ApiProperty()
  @IsBoolean()
  consentAccepted!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DecideRecruitmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateCandidateDto {
  @ApiProperty({ example: 'Avery' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Stone' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'avery.stone@example.com' })
  @IsEmail()
  @MaxLength(240)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @ApiPropertyOptional({ example: 'Referral' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional({ enum: RecruitmentCandidateStatus })
  @IsOptional()
  @IsEnum(RecruitmentCandidateStatus)
  status?: RecruitmentCandidateStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  currentEmployer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  currentTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  resumeUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateCandidateDto extends PartialType(CreateCandidateDto) {}

export class CreateApplicationDto {
  @ApiProperty()
  @IsString()
  candidateId!: string;

  @ApiProperty()
  @IsString()
  requisitionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class MoveApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stageId?: string;

  @ApiPropertyOptional({ enum: RecruitmentStageType })
  @IsOptional()
  @IsEnum(RecruitmentStageType)
  stageType?: RecruitmentStageType;

  @ApiPropertyOptional({ enum: RecruitmentApplicationStatus })
  @IsOptional()
  @IsEnum(RecruitmentApplicationStatus)
  status?: RecruitmentApplicationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ScheduleInterviewDto {
  @ApiProperty()
  @IsString()
  applicationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stageId?: string;

  @ApiProperty()
  @IsDateString()
  scheduledStartAt!: string;

  @ApiProperty()
  @IsDateString()
  scheduledEndAt!: string;

  @ApiPropertyOptional({ example: 'America/Chicago' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  meetingUrl?: string;

  @ApiPropertyOptional({ enum: RecruitmentInterviewStatus })
  @IsOptional()
  @IsEnum(RecruitmentInterviewStatus)
  status?: RecruitmentInterviewStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  interviewerIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SubmitInterviewFeedbackDto {
  @ApiProperty()
  @IsString()
  interviewId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiProperty({ enum: RecruitmentFeedbackRecommendation })
  @IsEnum(RecruitmentFeedbackRecommendation)
  recommendation!: RecruitmentFeedbackRecommendation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  strengths?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  concerns?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateOfferDto {
  @ApiProperty()
  @IsString()
  applicationId!: string;

  @ApiPropertyOptional({ enum: RecruitmentOfferStatus })
  @IsOptional()
  @IsEnum(RecruitmentOfferStatus)
  status?: RecruitmentOfferStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000000)
  basePayCents?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateOfferDto extends PartialType(CreateOfferDto) {}
