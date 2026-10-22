CREATE TABLE "User" ("id" UUID NOT NULL, "phone" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE TABLE "OtpChallenge" ("phone" TEXT NOT NULL, "hash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "sentAt" TIMESTAMP(3) NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("phone"));
CREATE TABLE "Loan" ("id" UUID NOT NULL, "ownerId" UUID NOT NULL, "friendName" VARCHAR(80) NOT NULL, "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0), "dueDate" DATE NOT NULL, "repaidAt" TIMESTAMP(3), "receiptPath" TEXT, "receiptMime" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Loan_pkey" PRIMARY KEY ("id"));
CREATE INDEX "Loan_ownerId_createdAt_idx" ON "Loan"("ownerId", "createdAt");
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
