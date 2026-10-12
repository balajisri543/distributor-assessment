# Architecture

React provides catalogue browsing, quantity entry, order lists and detail, the approval queue, loyalty figures and ERP delivery visibility. Express validates requests and identifies the acting user through a header. MongoDB stores six application collections. A local replica-set launcher supports transactions without requiring Docker. The browser talks to the same server that serves its built files.

R1 is enforced by transactional, conditional product updates: placement increases reserved quantity; cancellation and rejection release it; dispatch reduces both reserved and physical stock. R2 stores price snapshots and a fixed discount on orders. R3 calculates outstanding orders and serializes credit checks through a distributor revision update. R4 creates one uniquely indexed award on confirmation. R5 reverses that award and derives points and tier from recent, unreversed awards. R6 has no edit endpoint. R7 disables zero availability in the UI and independently validates stock in the API. R8 appends actor and timestamp events within the same transaction; Mongoose middleware rejects event updates and deletes. An outbox worker delivers ERP notifications independently.

# Key decisions

MongoDB was chosen because the user explicitly requested MERN after the compulsory relational requirement was explained. SQLite would better satisfy the assessment, but was declined. This is a compliance gap, not relational equivalence.

Money uses integer paise instead of floating-point rupees. Discounts round to the nearest paise, and awarded points floor the discounted paise total divided by 10,000. Stored snapshots preserve previous prices and discounts.

Tier is derived rather than cached on the distributor. A cached tier could become incorrect when an award expires after 90 days. Reversal marks the original award instead of creating a recent negative entry, avoiding subtraction of already expired points.

Initial Placed and its credit-routing transition occur within one transaction. A separate manual routing step was rejected because routing is automatic. Historical delivered orders establish seed tiers without affecting opening stock; their events are imported history, not new ERP notifications.

An outbox was selected instead of calling ERP during order placement. ERP failure therefore cannot roll back valid local work. Delivery is at least once; the receiver must deduplicate eventId. The worker is deliberately simple and supports one application process.

# Not implemented

Q6: a relational database with database-enforced foreign keys is not implemented. Migration to SQLite or PostgreSQL with matching schema and integration tests is the first priority, estimated 3–5 hours. MongoDB collection references are documented in schema.dbml, but do not meet Q6.

Q14: database-level append-only permissions remain unimplemented. Application middleware protects normal model operations, but privileged direct writes can bypass it. Restricting database roles and verifying their permissions would take 30–60 minutes.

The actual ERP endpoint and payload specification were not supplied. Connecting a provided endpoint and checking its contract is estimated at 1–2 hours. The current outbound workflow uses an explicit local mock. Repository remote configuration and final submission push require the candidate's destination, estimated 10–15 minutes.

# Known defects

The ERP worker has no distributed lease, so only one application process should run. A crash after remote acceptance can resend an event. HTTP 4xx delivery failures stop and require manual investigation. Authentication is intentionally absent, making user switching unsuitable for production.

The browser refreshes after actions or explicit Refresh rather than receiving live updates. Direct database changes can bypass application validation and logical references. The bundled launcher downloads MongoDB on first run, requiring internet and sufficient disk space. No production readiness or proctored timing claim is made.

# AI tools

OpenAI Codex drafted source, tests and assessment documents, then used local tools to install and verify the project. The initial AI-generated seed passed multiple documents to Mongoose create inside a transaction without ordered: true. The integration test setup failed with that exact error. Adding ordered: true to the two seed batches corrected it, after which all twelve integration tests passed. A separate browser walkthrough verified the visible workflows and produced actual pitch screenshots.

The single most useful prompt, verbatim, was: "complete this task with easy coding to understand use MERN stack". The user subsequently selected MongoDB explicitly and authorized project creation in D:\project.
