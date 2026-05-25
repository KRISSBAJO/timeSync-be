import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import {
  RecruitmentEmploymentType,
  RecruitmentFeedbackRecommendation,
  RecruitmentRequisitionStatus,
  RecruitmentWorkMode,
} from '@prisma/client';

import {
  CreateApplicationDto,
  CreateCandidateDto,
  CreateOfferDto,
  CreateRecruitmentApprovalRuleDto,
  CreateRequisitionDto,
  MoveApplicationDto,
  ScheduleInterviewDto,
  SubmitInterviewFeedbackDto,
} from './dto/recruitment.dto';

async function validateDto<T extends object>(dto: new () => T, payload: Record<string, unknown>): Promise<ValidationError[]> {
  return validate(plainToInstance(dto, payload));
}

function serialized(errors: ValidationError[]): string {
  return JSON.stringify(errors);
}

describe('Recruitment DTO validation', () => {
  it('accepts requisition and workflow adoption controls', async () => {
    await expect(validateDto(CreateRequisitionDto, {
      code: 'REQ-CARE-001',
      title: 'Care Specialist',
      departmentName: 'Care Coordination',
      locationName: 'Chicago, IL',
      headcount: 2,
      status: RecruitmentRequisitionStatus.DRAFT,
      employmentType: RecruitmentEmploymentType.FULL_TIME,
      workMode: RecruitmentWorkMode.HYBRID,
      priority: 82,
      targetStartDate: '2026-06-15T00:00:00.000Z',
      salaryMinCents: 5200000,
      salaryMaxCents: 6800000,
      description: 'Support care operations.',
      requirements: 'Healthcare operations experience.',
    })).resolves.toHaveLength(0);

    await expect(validateDto(CreateRecruitmentApprovalRuleDto, {
      code: 'STANDARD_REQUISITION_APPROVAL',
      name: 'Standard requisition workflow',
      workflowCode: 'RECRUITMENT_REQUISITION_APPROVAL',
      triggerKey: 'recruitment.requisition.submitted',
      priority: 200,
      minHeadcount: 1,
      maxHeadcount: 10,
    })).resolves.toHaveLength(0);
  });

  it('accepts candidate, application, interview, feedback, and offer payloads', async () => {
    await expect(validateDto(CreateCandidateDto, {
      firstName: 'Avery',
      lastName: 'Stone',
      email: 'avery.stone@example.com',
      source: 'Referral',
      currentTitle: 'Patient Coordinator',
      tags: ['referral', 'healthcare'],
    })).resolves.toHaveLength(0);

    await expect(validateDto(CreateApplicationDto, {
      candidateId: 'candidate-id',
      requisitionId: 'requisition-id',
      source: 'Referral',
    })).resolves.toHaveLength(0);

    await expect(validateDto(MoveApplicationDto, {
      stageId: 'stage-id',
      score: 88,
      decisionReason: 'Strong care coordination background.',
    })).resolves.toHaveLength(0);

    await expect(validateDto(ScheduleInterviewDto, {
      applicationId: 'application-id',
      scheduledStartAt: '2026-05-27T16:00:00.000Z',
      scheduledEndAt: '2026-05-27T17:00:00.000Z',
      timezone: 'America/Chicago',
      meetingUrl: 'https://meet.example.test/interview',
      interviewerIds: ['employee-id'],
    })).resolves.toHaveLength(0);

    await expect(validateDto(SubmitInterviewFeedbackDto, {
      interviewId: 'interview-id',
      rating: 4,
      recommendation: RecruitmentFeedbackRecommendation.YES,
      strengths: 'Structured examples and good follow-up.',
    })).resolves.toHaveLength(0);

    await expect(validateDto(CreateOfferDto, {
      applicationId: 'application-id',
      basePayCents: 6600000,
      currencyCode: 'USD',
      startDate: '2026-06-22T00:00:00.000Z',
      expiresAt: '2026-06-05T23:59:59.000Z',
      decisionNote: 'Competitive offer.',
    })).resolves.toHaveLength(0);
  });

  it('rejects weak recruitment payloads outside supported bounds', async () => {
    const requisitionErrors = await validateDto(CreateRequisitionDto, {
      code: 'bad code',
      title: 'C',
      headcount: 0,
      priority: 500,
      employmentType: 'FOREVER',
    });
    expect(serialized(requisitionErrors)).toContain('code');
    expect(serialized(requisitionErrors)).toContain('title');
    expect(serialized(requisitionErrors)).toContain('headcount');
    expect(serialized(requisitionErrors)).toContain('priority');
    expect(serialized(requisitionErrors)).toContain('employmentType');

    const feedbackErrors = await validateDto(SubmitInterviewFeedbackDto, {
      interviewId: 'interview-id',
      rating: 9,
      recommendation: 'MAYBE',
    });
    expect(serialized(feedbackErrors)).toContain('rating');
    expect(serialized(feedbackErrors)).toContain('recommendation');
  });
});
