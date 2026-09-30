# Company → Project decision (2026-09-29)

The owner replaced the earlier Customer registry plan for Issue #18. This decision supersedes Customer requirements in older SA contracts, work items, and feature documents wherever they conflict.

- Multiple Companies are supported. **Dhas — D.H.A. Siamwalla Ltd.** is the default for existing Projects, with the address, phone, location, and description supplied by the owner. Unknown opening hours, website, and email are not invented.
- Every Project belongs to one selected Company through `Project.companyId`. New Projects must select an existing Company; the server validates the ID. There is no Customer model, Customer API, or Customer UI.
- Existing Projects are assigned to Dhas in a staged rollout. The backfill changes only `Project.companyId`; Project, WorkItem, and TimeEntry IDs, dates, timestamps, hours, and row counts remain unchanged.
- The Company/Project schema rollout needs a reviewed backup, isolated restore rehearsal, and verification before promoting `companyId` from nullable compatibility to required. Existing non-Dhas Company rows are preserved. The Dhas backfill creates or reuses Dhas and rejects conflicting Project links.
- Project progress and hours remain derived from shared WorkItems and TimeEntries. GitLab Projects map to PMS Projects and inherit the Company context.

Implementation and commands: [COMPANY_PROJECT_IMPLEMENTATION.md](./COMPANY_PROJECT_IMPLEMENTATION.md).
