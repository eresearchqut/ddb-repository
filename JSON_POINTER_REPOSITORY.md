# JSON Pointer Repository

## Overview

A specialisation of `DynamoDbRepository` that stores JSON documents as individual attribute-per-item rows, addressed by JSON Pointer (RFC 6901). Each DynamoDB item represents a single leaf value of a JSON document:

| Attribute | Role | Example |
|-----------|------|---------|
| `id` | Hash key — identifies the document | `"user-123"` |
| `pointer` | Range key — JSON Pointer path to the value | `"/address/city"` |
| `value` | The leaf value at that pointer | `"Melbourne"` |

A full document is reconstructed by fetching all items sharing the same `id` and reassembling the pointer/value pairs.

---

## DynamoDB Table Requirements

- **Hash key**: `id` (String)
- **Range key**: `pointer` (String)

---

## Class Design

```ts
class JsonPointerRepository<T> extends DynamoDbRepository<JsonPointerKey, JsonPointerItem>
```

```ts
interface JsonPointerKey {
    id: string;
    pointer: string;
}

interface JsonPointerItem extends JsonPointerKey {
    value: unknown;
}

interface JsonPointerRepositoryOptions extends DynamoDbRepositoryOptions {
    idKey?: string;       // default: "id"
    pointerKey?: string;  // default: "pointer"
    valueKey?: string;    // default: "value"
}
```

---

## Methods

### `putDocument(id: string, document: T): Promise<void>`
Flattens `document` into pointer/value pairs and writes each as a DynamoDB item. Replaces any existing items for that `id`.

### `getDocument(id: string): Promise<T | undefined>`
Reads all items for `id` and reconstructs the JSON document from pointer/value pairs.

### `getAttribute<V>(id: string, pointer: string): Promise<V | undefined>`
Reads the single item at `(id, pointer)` and returns its value.

### `putAttribute<V>(id: string, pointer: string, value: V): Promise<void>`
Writes a single pointer/value item. Creates or replaces.

### `deleteAttribute(id: string, pointer: string): Promise<void>`
Deletes the item at `(id, pointer)`.

### `deleteDocument(id: string): Promise<void>`
Deletes all items belonging to a document (all range key entries for a given `id`).

### ~~`queryDocumentsByAttribute<V>(pointer: string, value: V): Promise<T[]>`~~
Removed from scope.

---

## Flattening Rules

- Only **leaf nodes** (primitives: string, number, boolean, null) are stored as individual items.
- **Arrays** are flattened with index-based pointers: `/tags/0`, `/tags/1`.
- **Nested objects** are recursively flattened: `/address/city`, `/address/postcode`.
- The root pointer `/` is not stored; only fully-qualified leaf paths are.

**Example** — document:
```json
{ "name": "Alice", "address": { "city": "Melbourne" }, "tags": ["a", "b"] }
```
Stored as:
| id | pointer | value |
|----|---------|-------|
| `user-123` | `/name` | `"Alice"` |
| `user-123` | `/address/city` | `"Melbourne"` |
| `user-123` | `/tags/0` | `"a"` |
| `user-123` | `/tags/1` | `"b"` |

---

## Dependencies

- No new runtime dependencies — implement flattening/reconstruction internally using RFC 6901 pointer logic.
- Reuse `DynamoDbRepository` for all DynamoDB interactions.

---

## Decisions

- `putDocument` **will** delete stale pointers (fetch existing pointers first, delete any not present in the new document).
- `value` type is constrained to `string | number | boolean | null`.
- `queryDocumentsByAttribute` is **out of scope**.
