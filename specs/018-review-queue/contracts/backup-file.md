# Contract: Backup file, format version 1 (v1.8 changes)

**Spec**: [FR-160](../spec.md#fr-160) · **Entities**: [data-model.md](../data-model.md) ·
**Everything else**: [001 backup-file.md](../../001-finance-tracker-v1/contracts/backup-file.md)

v1.8 adds fields to records the backup already holds, and keeps format version 1
([R-39](../research.md#r-39)). The file, saving, loading and exactness stay as 001 defines them.

<a id="file"></a>
## What the file now holds

001's [File](../../001-finance-tracker-v1/contracts/backup-file.md#file) stays; its keys hold these
added fields, with the representations of [data-model.md](../data-model.md):

| Key | Added in v1.8 |
|---|---|
| `transactions` | `vendor` and `destinationVendor`, when the transaction has them ([FR-145](../spec.md#fr-145)) |
| `pendingBatch` | On each parsed row, `keptInReview`, `seen` and `groupSeen`; on its assignment, `usual`, `pairedTransactionId` and `usualCategoryId` ([FR-155](../spec.md#fr-155)) |
| `settings` | `setAsideUnderCents`, when set ([FR-152](../spec.md#fr-152)) |

Loading checks these fields as [invariants 4, 7 and 8](../data-model.md#invariants) state.
[Exactness](../../001-finance-tracker-v1/contracts/backup-file.md#exactness-sc-014) holds for them
too: a v1.8 file round-trips with every added field.

<a id="compatibility"></a>
## Compatibility

Replaces 001's
[Compatibility](../../001-finance-tracker-v1/contracts/backup-file.md#compatibility).

- This version of the app reads only `formatVersion` 1.
- A later change to the stored data must either keep version 1 readable, by migrating it on load,
  or increase `formatVersion` and add that migration. Version 1 files are never refused for being
  old.
- v1.2 added the optional key `suggested` to a pending row's category assignment
  ([FR-093](../../001-finance-tracker-v1/spec.md#fr-093)). A file without it is complete, and
  earlier versions of the app drop it on loading, so the format stays version 1. The same holds for
  the optional `aiFeatures` key that v1.2 added to the settings
  ([FR-095](../../001-finance-tracker-v1/spec.md#fr-095)); a file without it restores AI features
  off.
- v1.3 added the optional key `conversation` to `data`
  ([FR-104](../../001-finance-tracker-v1/spec.md#fr-104)). A file without it is complete and
  restores an empty conversation, and v1.2 drops it on loading, so the format stays version 1
  ([R-26](../../001-finance-tracker-v1/research.md#r-26)).
- v1.6 added the optional key `model` to the settings
  ([FR-130](../../001-finance-tracker-v1/spec.md#fr-130)). A file without it is complete and
  restores the default model, and v1.5 drops it on loading, so the format stays version 1
  ([R-32](../../001-finance-tracker-v1/research.md#r-32)). A model the app no longer lists is kept
  as it is, and the app uses the default.
- From v1.6, `aiFeatures` restores the switch only, since AI features also need a stored key. A
  file with AI features on, also one saved by v1.5, restores them off on a computer that has no
  key, until the user enters one ([FR-095](../../001-finance-tracker-v1/spec.md#fr-095),
  [R-31](../../001-finance-tracker-v1/research.md#r-31)).
- v1.8 added the optional fields [above](#file) ([FR-160](../spec.md#fr-160)). A file without
  them is complete: it restores transactions without vendors, a pending batch without suggested
  transfers, usual choices, rows chosen for review or seen items, and no skip amount. v1.7 drops
  them on loading, so the format stays version 1 ([R-39](../research.md#r-39)). A v1.8 file
  restored in v1.7 loses only what they hold; a row still holding a suggested transfer is then an
  ordinary transfer, which on confirmation adds a transaction instead of changing the paired one.
