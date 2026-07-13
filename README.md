# DynamoDB Repository

[![npm version](https://badge.fury.io/js/@eresearchqut%2Fddb-repository.svg)](https://badge.fury.io/js/@eresearchqut%2Fddb-repository)
[![Coverage Status](https://coveralls.io/repos/github/eresearchqut/ddb-repository/badge.svg?branch=main)](https://coveralls.io/github/eresearchqut/ddb-repository?branch=main)

A TypeScript library providing a generic repository pattern implementation for AWS DynamoDB, simplifying CRUD operations and common database interactions.

## Features

- 🚀 Generic repository pattern for type-safe DynamoDB operations
- 🔍 Rich query support with filter expressions and projections
- 🎯 Batch get with automatic retry for unprocessed keys
- 📄 Paginated queries with limit and sort order control
- 🗂️ [JSON Pointer Repository](#jsonpointerrepository) for storing structured JSON documents
- 🧪 Fully tested with Jest and Testcontainers
- 💪 Written in TypeScript with full type safety
- ⚡ Built on top of AWS SDK v3

## Installation

```sh
npm install @eresearchqut/ddb-repository
```

## Prerequisites

- Node.js LTS
- AWS credentials configured (for production use)
- DynamoDB table with the appropriate key schema

## Usage

### Basic Example

```typescript
import { DynamoDbRepository, FilterOperator } from '@eresearchqut/ddb-repository';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

interface UserKey {
  id: string;
}

interface User {
  id: string;
  name: string;
  email?: string;
  age?: number;
}

const client = new DynamoDBClient({ region: 'us-east-1' });

const userRepository = new DynamoDbRepository<UserKey, User>({
  client,
  tableName: 'users',
  hashKey: 'id',
});

// Write an item
await userRepository.putItem({ id: '123' }, { id: '123', name: 'Alice', email: 'alice@example.com' });

// Read an item
const user = await userRepository.getItem({ id: '123' });

// Update specific fields (SET name, REMOVE email)
await userRepository.updateItem({ id: '123' }, { name: 'Alicia' }, ['email']);

// Delete an item
await userRepository.deleteItem({ id: '123' });
```

### Querying Items

`getItems` performs a DynamoDB `Query` and returns all matching items. It paginates automatically and stops early once `limit` items are accumulated.

```typescript
// All items for a partition key
const items = await userRepository.getItems({ id: 'user-123' });

// With filter expressions
const activeAdults = await userRepository.getItems({
  id: 'user-123',
  filterExpressions: [
    { attribute: 'age', operator: FilterOperator.GREATER_THAN_OR_EQUALS, value: 18 },
    { attribute: 'status', operator: FilterOperator.EQUALS, value: 'active' },
  ],
});

// With projection (only return selected attributes)
const names = await userRepository.getItems({
  id: 'user-123',
  projectedAttributes: ['id', 'name'],
});

// With limit and sort order
const recent = await userRepository.getItems({
  id: 'user-123',
  limit: 10,
  sortOrder: 'DESC',
});

// Query a Global Secondary Index
const byStatus = await userRepository.getItems({
  status: 'active',
  index: 'status-index',
});
```

### Filter Operators

| Operator | DynamoDB Expression | Notes |
|---|---|---|
| `EQUALS` | `#attr = :val` | |
| `NOT_EQUALS` | `#attr <> :val` | |
| `GREATER_THAN` | `#attr > :val` | |
| `GREATER_THAN_OR_EQUALS` | `#attr >= :val` | |
| `LESS_THAN` | `#attr < :val` | |
| `LESS_THAN_OR_EQUALS` | `#attr <= :val` | |
| `IN` | `#attr IN (:val0, :val1, ...)` | Pass an `Array` as value |
| `BETWEEN` | `#attr BETWEEN :val0 AND :val1` | Pass a 2-tuple as value |
| `BEGINS_WITH` | `begins_with(#attr, :val)` | String prefix match |
| `CONTAINS` | `contains(#attr, :val)` | Substring or set membership |

All operators support `negate: true` to wrap the expression in `NOT (...)`.

### Batch Get

```typescript
const keys = [{ id: '1' }, { id: '2' }, { id: '3' }];
const items = await userRepository.batchGetItems(keys);
```

Automatically deduplicates keys, pages requests in chunks of 100, and retries any `UnprocessedKeys` with exponential back-off.

### Composite Key Tables

```typescript
interface OrderKey {
  customerId: string;
  orderId: string;
}

interface Order {
  customerId: string;
  orderId: string;
  total: number;
}

const orderRepository = new DynamoDbRepository<OrderKey, Order>({
  client,
  tableName: 'orders',
  hashKey: 'customerId',
  rangeKey: 'orderId',
});

await orderRepository.putItem(
  { customerId: 'c1', orderId: 'o1' },
  { customerId: 'c1', orderId: 'o1', total: 99.99 },
);
```

### Consumed Capacity Middleware

```typescript
import { consumedCapacityMiddleware } from '@eresearchqut/ddb-repository';

client.middlewareStack.add(
  consumedCapacityMiddleware({
    onConsumedCapacity: async (detail) => {
      console.log('Consumed capacity:', detail.ConsumedCapacity);
    },
  }),
);
```

## API Reference

### `DynamoDbRepository<K, T>`

#### Constructor options

| Option | Type | Required | Description |
|---|---|---|---|
| `client` | `DynamoDBClient` | ✅ | AWS SDK v3 DynamoDB client |
| `tableName` | `string` | ✅ | DynamoDB table name |
| `hashKey` | `string` | ✅ | Partition key attribute name |
| `rangeKey` | `string` | | Sort key attribute name |
| `returnConsumedCapacity` | `ReturnConsumedCapacity` | | Defaults to `TOTAL` |

#### Methods

| Method | Signature | Description |
|---|---|---|
| `getItem` | `(key: K) => Promise<T \| undefined>` | Read a single item by key |
| `putItem` | `(key: K, record: T) => Promise<T>` | Write an item (create or replace) |
| `updateItem` | `(key: K, updates: Partial<T>, remove?: string[]) => Promise<T \| undefined>` | Partial update with optional attribute removal |
| `deleteItem` | `(key: K) => Promise<Partial<T> \| undefined>` | Delete an item |
| `getItems` | `(query: Query) => Promise<T[] \| undefined>` | Query items (auto-paginates) |
| `getItemsPage` | `(query: Query & { cursor?: string }) => Promise<PageResult<T>>` | Cursor-based paged query results |
| `scan` | `(options?: ScanQuery) => Promise<T[]>` | Scan items (auto-paginates) |
| `scanPage` | `(options?: ScanQuery & { cursor?: string }) => Promise<PageResult<T>>` | Cursor-based paged scan results |
| `batchGetItems` | `(keys: K[], projectedQuery?: ProjectedQuery) => Promise<Array<T \| undefined>>` | Fetch multiple items by key |

## JsonPointerRepository

Stores JSON documents as individual per-pointer DynamoDB items using [RFC 6901 JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) addressing.

See [JSON_POINTER_REPOSITORY.md](./JSON_POINTER_REPOSITORY.md) for full documentation.

### Quick Example

```typescript
import { JsonPointerRepository } from '@eresearchqut/ddb-repository';

const docRepo = new JsonPointerRepository({
  client,
  tableName: 'documents',  // requires hash key "id", range key "pointer"
});

await docRepo.putDocument('doc-1', {
  name: 'Alice',
  address: { city: 'Melbourne' },
  tags: ['admin', 'user'],
});

const doc = await docRepo.getDocument('doc-1');
// { name: 'Alice', address: { city: 'Melbourne' }, tags: ['admin', 'user'] }

const city = await docRepo.getAttribute('doc-1', '/address/city');
// 'Melbourne'

await docRepo.putAttribute('doc-1', '/address/postcode', '3000');
await docRepo.deleteAttribute('doc-1', '/tags/1');
await docRepo.deleteDocument('doc-1');
```

## Development

```sh
npm install        # install dependencies
npm run lint       # lint
npm run lint:fix   # lint with auto-fix
npm test           # run integration tests (requires Docker)
npm run test:coverage  # tests with coverage report
npm run build      # compile to dist/
```

## Configuration

### AWS Credentials

Configure via environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`), AWS credentials file (`~/.aws/credentials`), or IAM role.

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/your-table-name"
    }
  ]
}
```

## Contributing

Contributions are welcome! Please submit a Pull Request.

### Commit message convention

Semantic release uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` → minor version bump
- `fix:` / `perf:` → patch version bump
- `docs:` / `chore:` → no release
- `feat!:` or `BREAKING CHANGE:` footer → major version bump

## License

MIT

