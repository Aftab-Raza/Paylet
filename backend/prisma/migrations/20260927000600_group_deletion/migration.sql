ALTER TABLE "split_groups" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "split_invitations" DROP CONSTRAINT "split_invitations_status_check";
ALTER TABLE "split_invitations" ADD CONSTRAINT "split_invitations_status_check"
CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'));
