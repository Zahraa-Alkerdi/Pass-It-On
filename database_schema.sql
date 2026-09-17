-- Idempotent Supabase SQL Migration matching prisma/schema.prisma

-- 1. Create Enums (guarded against existing types)
DO $$ BEGIN
    CREATE TYPE request_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE mentorship_status AS ENUM ('ACTIVE', 'COMPLETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE project_status AS ENUM ('SUBMITTED', 'MENTOR_APPROVED', 'ADMIN_APPROVED', 'REJECTED', 'CHANGES_REQUESTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Admin Table
CREATE TABLE IF NOT EXISTS "Admin" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" TEXT UNIQUE NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. User Table & Columns
CREATE TABLE IF NOT EXISTS "User" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" TEXT UNIQUE NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "bio" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mentorshipsOwed" INT DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- If User table had legacy password_hash column, migrate and sync to passwordHash
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'password_hash'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'passwordHash'
    ) THEN
        ALTER TABLE "User" RENAME COLUMN "password_hash" TO "passwordHash";
    END IF;
END $$;

-- 4. Skill Table
CREATE TABLE IF NOT EXISTS "Skill" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT UNIQUE NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. UserSkill Table
CREATE TABLE IF NOT EXISTS "UserSkill" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "skillId" UUID NOT NULL REFERENCES "Skill"("id") ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE("userId", "skillId")
);

-- 6. MentorshipRequest Table
CREATE TABLE IF NOT EXISTS "MentorshipRequest" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "menteeId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "mentorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "skillId" UUID NOT NULL REFERENCES "Skill"("id") ON DELETE CASCADE,
    "status" request_status DEFAULT 'PENDING',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE("menteeId", "mentorId", "skillId")
);

-- 7. Mentorship Table
CREATE TABLE IF NOT EXISTS "Mentorship" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "menteeId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
    "mentorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
    "skillId" UUID NOT NULL REFERENCES "Skill"("id") ON DELETE RESTRICT,
    "status" mentorship_status DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE("menteeId", "mentorId", "skillId")
);

-- 8. ProjectSubmission Table
CREATE TABLE IF NOT EXISTS "ProjectSubmission" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "mentorshipId" UUID NOT NULL REFERENCES "Mentorship"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "liveDemoUrl" TEXT,
    "additionalLinks" TEXT,
    "status" project_status DEFAULT 'SUBMITTED',
    "mentorFeedback" TEXT,
    "adminFeedback" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 9. Certification Table
CREATE TABLE IF NOT EXISTS "Certification" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
    "skillId" UUID NOT NULL REFERENCES "Skill"("id") ON DELETE RESTRICT,
    "mentorshipId" UUID UNIQUE NOT NULL REFERENCES "Mentorship"("id") ON DELETE RESTRICT,
    "issueDate" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    "certificateId" UUID UNIQUE DEFAULT gen_random_uuid(),
    UNIQUE("userId", "skillId")
);
