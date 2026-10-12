# Contract: Category suggestions through n8n

**Spec**: [FR-090 – FR-094](../spec.md#fr-090), [FR-061](../spec.md#fr-061) ·
**Decisions**: [R-23](../research.md#r-23)

This contract fixes the interface between the app and the n8n workflow that asks Claude for
category suggestions. The workflow is `n8n/financial-copilot-categories.json`. This contract and
the workflow change in the same commit.

## Address

`POST http://localhost:5678/webhook/financial-copilot-categories`, the production address of the
published workflow. The app's one copy of the address is `src/categoriser/endpoint.ts`, which the
production CSP also reads ([R-19](../research.md#r-19)).

## Request

`Content-Type: application/json`, with a body such as:

```json
{
  "rows": [
    {
      "rowNumber": 4,
      "side": "expense",
      "counterparty": "REWE Markt GmbH",
      "description": "Card payment girocard 01.10. 18:37 REWE Berlin"
    }
  ],
  "categories": { "expense": ["Eating out", "Groceries", "Housing"], "income": ["Salary"] },
  "examples": [{ "side": "expense", "description": "Lidl", "category": "Groceries" }]
}
```

| Field | Content |
|---|---|
| `rows` | The rows to suggest for, in review order. `rowNumber` as in the batch; `side` is `expense` or `income`; `counterparty` is `null` when the row has none; `description` may be empty |
| `categories` | Both keys, always: the names of each side's categories other than "Uncategorised" and "Unaccounted", in the app's list order |
| `examples` | The user's earlier decisions: `side`, `description` and `category`, a category name |

Which rows, how many, and which examples a request holds is [FR-090](../spec.md#fr-090) and
[FR-091](../spec.md#fr-091).

## Answer

Status `200`, with JSON such as:

```json
{
  "suggestions": [
    { "rowNumber": 4, "category": "Groceries" },
    { "rowNumber": 2, "category": null }
  ]
}
```

- `suggestions` holds an entry for some or all of the rows sent. A row may be left out, or given
  `null` when no category fits.
- `category` is a name from `categories` for the row's side, as sent.
- Other keys are ignored. How the app uses the answer is [FR-092](../spec.md#fr-092).

## CORS

The app runs on another origin than n8n. The workflow therefore allows the origins
`http://localhost:4173` and `http://localhost:5173`, and answers the browser's preflight for the
`content-type` header.

## Failures

The app waits at most 4 minutes ([FR-094](../spec.md#fr-094)). Each failure leaves the batch
unchanged and becomes a code of the [message catalogue](ui.md#message-catalogue):

| What happens | Code |
|---|---|
| The request cannot be sent or gets no response: n8n is not running, CORS refused it, or the connection was lost | `categoriser-unreachable` |
| Status 404: the workflow is not published, or listens on another path | `categoriser-unreachable` |
| Any other status outside 200–299 | `categoriser-failed` |
| No answer within 4 minutes | `categoriser-timeout` |
| A 2xx answer whose body is not JSON, or not of the shape above | `categoriser-answer-invalid` |
