# Drawing-level supplier assignments

Status: Planned; application implementation has not started.
Documentation issue: https://github.com/Apillis-MFG/QC-Assistant/issues/26

## Summary

Implement optional cloud collaboration where buyers assign individual drawings to verified supplier accounts. Each drawing has one supplier, one permission mode, and an independent submission/review status.

Keep the existing local workflow available without accounts. Reuse current React components, Auth context, Supabase client, and export logic; add no npm dependencies.

Confirmed decisions:

- Different suppliers can receive different drawings within one project.
- Access belongs to the invited person, not their supplier organization.
- Authentication uses email links.
- Submission requires all requested measurements; NG results are allowed.
- Submitted and accepted inspection content is locked for both sides.
- Buyers pause active assignments before changing requirements.

## User experience and permissions

### Account flow

- Add **Sign in / Create account** entry points to Projects, using one email-link screen.
- Sign in does not create unknown accounts; Create account does after email verification.
- Buyers without a company complete existing company onboarding.
- Invited suppliers need no company setup or password.
- Preserve the intended drawing or Share action through authentication and onboarding. Resume it once; avoid duplicate uploads.
- Invalid, expired, revoked, or wrong-email invitations show a clear recovery action without granting access.

### Buyer assignment flow

- Add **Assign supplier** to each drawing row. Allow selecting several drawings for the same email and mode; create independent assignments.
- If local, first upload the project to Supabase. Preserve its local copy and make clear that future collaboration uses the cloud copy.
- Choose **Balloon + measure** or **Measurements only**, defaulting to Measurements only.
- Require at least one characteristic before assigning Measurements only.
- Show email, permission mode, invitation status, work status, and buyer actions per drawing.
- Suppliers see only their assigned drawings, grouped by project. Expose project name/code only; hide buyer notes, other suppliers, and other drawings.

| Capability | Buyer | Balloon + measure | Measurements only |
|---|---|---|---|
| View assigned drawing and export | Yes | Yes | Yes |
| Add/edit/remove balloons and definitions | When editable | During active work | No |
| Enter/clear measurements | When editable | During active work | During active work |
| Change PDF, drawing metadata, sample count | When editable | No | No |
| Assign suppliers, pause, review, revoke | Yes | No | No |

Characteristic definitions include geometry, nominal, tolerance, type, unit, method, and notes. Supplier exports cover authorized drawings only.

### Review flow

- Unassigned drawings remain buyer-editable.
- Verified acceptance starts **In progress**.
- **Pause** makes the supplier read-only and gives the buyer editing control. **Resume** returns control to the supplier.
- **Submit for review** flushes pending saves, then validates at least one characteristic and every requested sample cell.
- Empty/whitespace values and invalid numeric measurements block submission; note/visual measurements must use supported values. NG measurements do not block it.
- **Submitted** locks inspection content for both sides.
- Buyer **Accepts** or **Requests changes** with a required comment. Request changes returns to In progress.
- **Accepted** remains locked until the buyer explicitly reopens it with a reason.
- Inspection OK/NG/OPEN and overall PASS/FAIL remain separate from review status.
- Record actor, timestamp, and comment for each workflow transition.

## Backend and application changes

### Access model

- Add `drawing_assignments`: drawing ID, normalized invited email, accepted user ID, permission mode, invitation expiry/status, and work status. Enforce one current assignment per drawing.
- Add append-only assignment events for review history.
- Extend `pending_invites` for drawing assignments; replace project-wide supplier authorization.
- Buyers manage assignments through membership in the owning company; suppliers qualify only through their accepted user ID.
- Remove unrestricted membership self-insertion. Company creation remains a controlled atomic operation; company membership administration is owner/admin-only.
- Restrict suppliers' database, PDF storage, balloon allocation, project listing, and realtime access to assigned drawings. Guessing another drawing ID or storage path must not grant access.
- Permit project discovery through assigned drawings without exposing private project fields. Return a restricted project summary rather than the full project row.

Database policies must enforce these restrictions independently of UI controls. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

### Invitations and authentication

- Replace the new-user-only invitation grant trigger with explicit verified acceptance.
- Use the server invitation function to send email links for both new and existing accounts.
- Store invitation authority in database records; link parameters identify an invitation but do not authorize access.
- Acceptance verifies authenticated email, expiry, invitation status, and drawing assignment, then binds the account atomically.
- Invitations expire after seven days. Resending refreshes the pending invitation; repeated acceptance is idempotent.
- Revoking cancels pending links and removes future supplier access, while retaining inspection data and review history.
- V1 supports changing recipients before acceptance. Reassigning completed/active work to another supplier is deferred; use a separate drawing copy.
- Handle email delivery failures visibly and allow retry.

Email-link authentication follows the existing Supabase integration. [Passwordless authentication guidance](https://supabase.com/docs/guides/auth/auth-email-passwordless)

### Saving and locking

- Replace supplier whole-project autosave with capability-specific operations: characteristic changes and measurement-cell changes.
- Measurements-only never writes projects, PDFs, drawing metadata, or characteristics.
- Balloon + measure saves definitions and measurements without rewriting buyer settings.
- Persist only locally changed cells/fields; remote updates must not trigger writes.
- Stamp measurement authors and timestamps server-side.
- Serialize assignment transitions and inspection writes against the same assignment record. A late save must not bypass submission, pause, or revocation.
- Return authoritative permissions/status on drawing load; refresh on transitions, reconnect, and permission errors.
- Realtime updates must not overwrite unsaved local input. Keep failed edits visible and show actionable sync errors.
- Check every cloud-upload result, including measurements and PDF path updates. Failed/partial uploads cannot report success or become assignable; retain the local source and provide retry.

Keep orchestration in `src/App.jsx` and cloud operations in `src/lib/supabaseStore.js`, with feature-local UI updates.

## Verification and rollout

Implement as four linked GitHub issues: security/access model, account/invitations, assignment permissions/saving, and submission/review. Follow the existing Project loop before implementation and document verification before moving each issue to In Review.

Required checks:

- Buyer and two supplier accounts: each supplier sees only assigned drawings.
- Direct API/storage/RPC attempts cannot access other drawings, join buyer companies, or bypass mode and workflow restrictions.
- New and existing accounts accept invitations; wrong email, expired links, resend, duplicate acceptance, and revocation behave correctly.
- Measurements-only saves successfully without modifying requirements.
- Balloon + measure creates, edits, and removes balloons while preserving stable cloud numbers.
- Pause/resume, submit, accept, request changes, and reopen enforce locks for both sides.
- Submit races with autosave, buyer pause, and revoke leave consistent database state.
- Missing/invalid measurements block submission; completed NG reports submit and export accurately.
- Failed uploads and email delivery show recovery paths without data loss or false success.
- Local creation, capture, ballooning, measurement entry, and both exports work without Supabase.
- Run database permission tests, targeted browser scenarios using existing Playwright, and `pnpm build`.

Use additive migrations and test on staging first. Existing project-wide supplier grants must be retired explicitly: preserve data, remove broad access, and have buyers create drawing-specific invitations. Do not silently convert organization access into personal access.

Configure production email delivery, allowed redirect URLs, and the invitation function's app URL before rollout. Enable assignment UI only after the backend migrations/functions are deployed and verified. Defer supplier teams, concurrent buyer/supplier editing, multiple private supplier reports for one drawing, and drawing version management.
