# DynamoDB Repository

[![npm version](https://badge.fury.io/js/@eresearchqut%2Fddb-repository.svg)](https://badge.fury.io/js/@eresearchqut%2Fddb-repository)
[![Coverage Status](https://coveralls.io/repos/github/eresearchqut/ddb-repository/badge.svg?branch=main)](https://coveralls.io/github/eresearchqut/ddb-repository?branch=main)

A TypeScript library providing a generic repository pattern implementation for AWS DynamoDB, simplifying CRUD operations and common database interactions.

## Features

- 🚀 Generic repository pattern for type-safe DynamoDB operations
- 📦 Simple and intuitive API
- 🔍 Support for common CRUD operations (Create, Read, Update, Delete)
- 🎯 Batch operations support
- 🧪 Fully tested with Jest and Testcontainers
- 💪 Written in TypeScript with full type safety
- ⚡ Built on top of AWS SDK v3

## Installation
```sh
npm install ddb-repository
```
## Prerequisites

- Node.js
- AWS credentials configured (for production use)
- DynamoDB table with appropriate schema

## Usage

### Basic Example
```typescript
import { DynamoDbRepository } from 'ddb-repository';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// Define your entity type
interface User {
id: string;
name: string;
email: string;
createdAt: string;
}

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: 'us-east-1' });

// Create repository instance
const userRepository = new DynamoDbRepository<User>(
client,
'users-table',
'id' // partition key
);

// Create a new user
await userRepository.create({
id: '123',
name: 'John Doe',
email: 'john@example.com',
createdAt: new Date().toISOString()
});

// Find a user by ID
const user = await userRepository.findById('123');

// Update a user
await userRepository.update('123', {
email: 'newemail@example.com'
});

// Delete a user
await userRepository.delete('123');
```

## API Reference

### Constructor
```
typescript
new DynamoDbRepository<T>(client: DynamoDBClient, tableName: string, partitionKey: string, sortKey?: string)
```
### Methods

- `create(item: T): Promise<T>` - Create a new item
- `findById(id: string): Promise<T | null>` - Find item by partition key
- `update(id: string, updates: Partial<T>): Promise<T>` - Update an existing item
- `delete(id: string): Promise<void>` - Delete an item
- `findAll(): Promise<T[]>` - Retrieve all items (use with caution on large tables)
- `batchCreate(items: T[]): Promise<void>` - Create multiple items in batch
- `query(options: QueryOptions): Promise<T[]>` - Query items with custom conditions

## Development

### Setup
```sh
# Install dependencies
npm install

# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Build the project
npm run build
```
### Testing

The project uses Jest with Testcontainers for integration testing against a real DynamoDB instance:
```sh
npm test
```

### Run tests with coverage

Generate coverage report

```sh
npm run test:coverage
```

Coverage reports are generated in the coverage/ directory:
* coverage/lcov-report/index.html - Interactive HTML report
* coverage/lcov.info - LCOV format for CI/CD integration

View HTML coverage report, open coverage/lcov-report/index.html

## Configuration

### AWS Credentials

Ensure your AWS credentials are configured via:
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- AWS credentials file (`~/.aws/credentials`)
- IAM role (when running on AWS infrastructure)

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
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/your-table-name"
    }
  ]
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.


### Commit message convention
Semantic release uses conventional commits. Your commit messages should follow this format:

* feat: new feature → triggers minor version bump (1.x.0)
* fix: bug fix → triggers patch version bump (1.0.x)
* perf: performance improvement → triggers patch version bump
* docs: documentation change → no release
* chore: maintenance task → no release
* BREAKING CHANGE: in footer → triggers major version bump (x.0.0)

Example:

> feat: add batch write support
>
> Added support for batch write operations to improve performance

Or with breaking change:

> feat: change repository API
> 
> BREAKING CHANGE: The query method now returns a Promise instead of an Observable


## License

MIT

## Support

For issues and questions, please open an issue on the GitHub repository.

