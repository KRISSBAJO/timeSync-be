import { PositionStatus } from '@prisma/client';

export type PositionCapacity = {
  budgetedHeadcount: number;
  occupied: number;
  vacant: number;
  overBudget: number;
  utilizationRate: number;
};

export type PositionTreeNode = {
  id: string;
  code: string;
  title: string;
  status: PositionStatus;
  organizationNodeId: string | null;
  costCenterId: string | null;
  gradeId: string | null;
  levelId: string | null;
  reportsToPositionId: string | null;
  isCritical: boolean;
  isExecutive: boolean;
  capacity: PositionCapacity;
  children: PositionTreeNode[];
};
