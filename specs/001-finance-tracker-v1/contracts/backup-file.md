# Contract: Backup file, format version 1

**Spec**: [FR-070 – FR-072](../spec.md#fr-070), [SC-014](../spec.md#sc-014) ·
**Entities**: [data-model.md](../data-model.md)

The backup file is the one artifact of the app that outlives the browser. It is the user's only
way to move data to another machine, browser or future packaging of the app
([R-20](../research.md#r-20)). Its format is therefore a stable interface: a later version of the
app must still be able to read version 1.

## File

- One JSON document encoded as UTF-8.
- Suggested file name: `financial-copilot-backup-YYYY-MM-DD.json`, using the local date of saving.
- Top-level object:

| Key | Value |
|---|---|
| `app` | The string `"financial-copilot"` |
| `formatVersion` | The integer `1` |
| `exportedAt` | Timestamp of saving; informational only |
| `data` | Object holding the whole state, below |

- `data` holds every record of every store in [the storage layout](../data-model.md#storage-layout),
  with the field names and representations of [data-model.md](../data-model.md):

| Key | Value |
|---|---|
| `accounts` | Account list |
| `categories` | Category list |
| `transactions` | Transaction list |
| `budgets` | Budget list |
| `profiles` | Mapping profile list |
| `pendingBatch` | Pending batch, or `null` |
| `settings` | Settings object |

Amounts are integer cents and dates are `YYYY-MM-DD` strings, exactly as stored, so a value never
passes through a locale format on its way into or out of the file.

## Saving ([FR-070](../spec.md#fr-070))

Saving serialises the in-memory state and hands the file to the browser as a download. It writes
nothing to storage and changes nothing in the app.

## Loading ([FR-071](../spec.md#fr-071), [FR-072](../spec.md#fr-072))

1. The user picks a file.
2. **Validate**, stopping at the first failure:
   1. The file parses as JSON, and `app` is `"financial-copilot"`. Otherwise the message says the
      file is not a Financial Copilot backup.
   2. `formatVersion` is `1`. A higher number gets a message that the backup was made by a newer
      version of the app.
   3. Every key above is present with the right shape. Otherwise the message says the backup is
      incomplete or damaged and names what is wrong in plain words, for example "a transaction has
      no date".
   4. The data satisfies every [invariant](../data-model.md#invariants). Otherwise the same message
      names the broken rule, for example "a transaction refers to an account that is not in the
      backup".
3. **Confirm**: a warning that all current data will be replaced ([FR-071](../spec.md#fr-071)).
   Cancelling changes nothing.
4. **Replace**: one storage transaction clears every store and writes every record from the file.
   If that transaction fails, the stored data stays as it was ([FR-072](../spec.md#fr-072)). Then the
   in-memory state is reloaded from storage.

Validating before confirming means an invalid file is refused at once, without the user first
agreeing to lose their data ([User Story 7](../spec.md#user-story-7) scenario 3).

## Exactness ([SC-014](../spec.md#sc-014))

Loading a backup and saving again produces a `data` object deep-equal to the original. Only
`exportedAt` differs. The end-to-end test for SC-014 asserts this round trip
([quickstart.md](../quickstart.md#us7-backup-and-restore)).

## Compatibility

- This version of the app reads only `formatVersion` 1.
- A later change to the stored data must either keep version 1 readable, by migrating it on load,
  or increase `formatVersion` and add that migration. Version 1 files are never refused for being
  old.
- v1.2 added the optional key `suggested` to a pending row's category assignment
  ([data-model.md](../data-model.md#pending-row), [FR-093](../spec.md#fr-093)). A file without it
  is complete, and earlier versions of the app drop it on loading, so the format stays version 1.
  The same holds for the optional `skipSharingWarning` key that v1.2 added to the settings
  ([FR-095](../spec.md#fr-095)); a file without it restores the data-sharing warning.
