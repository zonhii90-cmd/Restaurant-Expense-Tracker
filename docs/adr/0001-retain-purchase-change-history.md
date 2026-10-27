---
status: accepted
---

# Retain purchase corrections and voided records

To let management trace mistakes in restaurant purchasing records, staff raise errors and managers correct or void the purchases. Retain original and revised information, the actor, time and reason; preserve voided purchases for historical lookup while excluding them from effective purchase quantities and spending totals. This chooses traceability over deleting or silently overwriting erroneous records, at the cost of retaining history and making reports distinguish valid and voided purchases.

The owner accepted these business rules during the system documentation discussion. The implementation is in `supabase/purchase-corrections.sql`; manager-only controlled writes require this migration in the hosted project. New purchases continue to enter reports when saved without an additional approval step. The workflow and implementation are described in `docs/purchase-corrections-spec.md` and `docs/purchase-corrections-setup.md`.
