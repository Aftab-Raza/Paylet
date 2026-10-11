# Offline people and private money entries

An owner can add one of their active People contacts to a group without a Paylet account. The group can include that offline member in bills and balances. Group settlement requests require both participants to have accounts; record the offline person's payment after they connect, or keep it outside Paylet until then.

To connect later, the contact owner sends a request to the person's exact Paylet username. The recipient sees the requesting owner and the groups they will join before accepting. Acceptance attaches their account to the existing member record, preserving its bill history. A duplicate membership in any affected group blocks linking until it is manually resolved; existing bill history is never silently merged or discarded.

Contact notes and loan/repayment history remain private. Connecting does not share previous or future money entries. The owner must select **Share this entry** on each active entry in Money history; **Stop sharing** revokes access. The recipient sees only the explicitly shared entry's amount, purpose, date, and direction, not the owner's full timeline or private notes.

## Deployment order

This feature requires migration `20261011000100_offline_members_contact_links`. Back up or branch the production Neon database, then run `prisma migrate deploy` against the **direct** Neon connection URL. Confirm the migration succeeds before deploying the Render backend, then deploy the Vercel frontend. Do not point a new backend at an unmigrated database. Local Docker Compose applies the migration automatically through its `migrate` service; it does not remove the `paylet_db` volume.
