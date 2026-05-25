CREATE TYPE "HrArticleStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "HrArticleVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'PLATFORM_ONLY');
CREATE TYPE "HrArticleAuthorType" AS ENUM ('APP', 'PLATFORM_USER', 'TENANT_USER', 'PERSON');
CREATE TYPE "HrArticleReactionType" AS ENUM ('LIKE', 'HELPFUL', 'INSIGHTFUL');
CREATE TYPE "HrArticleCommentStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN', 'SPAM');

CREATE TABLE "HrArticleCategory" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrArticleCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrArticle" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "excerpt" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "heroImageUrl" TEXT,
  "readingMinutes" INTEGER NOT NULL DEFAULT 5,
  "status" "HrArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "visibility" "HrArticleVisibility" NOT NULL DEFAULT 'PUBLIC',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "authorType" "HrArticleAuthorType" NOT NULL DEFAULT 'APP',
  "authoredByApp" BOOLEAN NOT NULL DEFAULT true,
  "authorUserId" TEXT,
  "authorPersonId" TEXT,
  "authorName" TEXT NOT NULL,
  "authorTitle" TEXT,
  "authorAvatarUrl" TEXT,
  "readCount" INTEGER NOT NULL DEFAULT 0,
  "likeCount" INTEGER NOT NULL DEFAULT 0,
  "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "shareCount" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "HrArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrArticleRead" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "userId" TEXT,
  "visitorHash" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "referrer" TEXT,
  "durationSec" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrArticleRead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrArticleReaction" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "userId" TEXT,
  "visitorHash" TEXT,
  "type" "HrArticleReactionType" NOT NULL DEFAULT 'LIKE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrArticleReaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrArticleComment" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "parentId" TEXT,
  "userId" TEXT,
  "personId" TEXT,
  "displayName" TEXT NOT NULL,
  "email" TEXT,
  "body" TEXT NOT NULL,
  "status" "HrArticleCommentStatus" NOT NULL DEFAULT 'APPROVED',
  "approvedAt" TIMESTAMP(3),
  "moderatedById" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "HrArticleComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrArticleCategory_slug_key" ON "HrArticleCategory"("slug");
CREATE INDEX "HrArticleCategory_isActive_sortOrder_idx" ON "HrArticleCategory"("isActive", "sortOrder");

CREATE UNIQUE INDEX "HrArticle_slug_key" ON "HrArticle"("slug");
CREATE INDEX "HrArticle_status_publishedAt_idx" ON "HrArticle"("status", "publishedAt");
CREATE INDEX "HrArticle_categoryId_status_idx" ON "HrArticle"("categoryId", "status");
CREATE INDEX "HrArticle_featured_status_publishedAt_idx" ON "HrArticle"("featured", "status", "publishedAt");
CREATE INDEX "HrArticle_authorUserId_idx" ON "HrArticle"("authorUserId");
CREATE INDEX "HrArticle_authorPersonId_idx" ON "HrArticle"("authorPersonId");
CREATE INDEX "HrArticle_tags_gin_idx" ON "HrArticle" USING GIN ("tags");

CREATE INDEX "HrArticleRead_articleId_createdAt_idx" ON "HrArticleRead"("articleId", "createdAt");
CREATE INDEX "HrArticleRead_userId_createdAt_idx" ON "HrArticleRead"("userId", "createdAt");
CREATE INDEX "HrArticleRead_visitorHash_idx" ON "HrArticleRead"("visitorHash");

CREATE UNIQUE INDEX "HrArticleReaction_articleId_userId_type_key" ON "HrArticleReaction"("articleId", "userId", "type");
CREATE UNIQUE INDEX "HrArticleReaction_articleId_visitorHash_type_key" ON "HrArticleReaction"("articleId", "visitorHash", "type");
CREATE INDEX "HrArticleReaction_articleId_type_idx" ON "HrArticleReaction"("articleId", "type");
CREATE INDEX "HrArticleReaction_userId_idx" ON "HrArticleReaction"("userId");

CREATE INDEX "HrArticleComment_articleId_status_createdAt_idx" ON "HrArticleComment"("articleId", "status", "createdAt");
CREATE INDEX "HrArticleComment_parentId_idx" ON "HrArticleComment"("parentId");
CREATE INDEX "HrArticleComment_userId_idx" ON "HrArticleComment"("userId");
CREATE INDEX "HrArticleComment_personId_idx" ON "HrArticleComment"("personId");

ALTER TABLE "HrArticle" ADD CONSTRAINT "HrArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HrArticleCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrArticle" ADD CONSTRAINT "HrArticle_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrArticle" ADD CONSTRAINT "HrArticle_authorPersonId_fkey" FOREIGN KEY ("authorPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrArticle" ADD CONSTRAINT "HrArticle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrArticle" ADD CONSTRAINT "HrArticle_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HrArticleRead" ADD CONSTRAINT "HrArticleRead_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "HrArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrArticleRead" ADD CONSTRAINT "HrArticleRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HrArticleReaction" ADD CONSTRAINT "HrArticleReaction_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "HrArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrArticleReaction" ADD CONSTRAINT "HrArticleReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HrArticleComment" ADD CONSTRAINT "HrArticleComment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "HrArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrArticleComment" ADD CONSTRAINT "HrArticleComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "HrArticleComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrArticleComment" ADD CONSTRAINT "HrArticleComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrArticleComment" ADD CONSTRAINT "HrArticleComment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrArticleComment" ADD CONSTRAINT "HrArticleComment_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
