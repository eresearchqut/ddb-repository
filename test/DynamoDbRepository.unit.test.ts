import { vi, describe, it, expect, afterEach } from 'vitest';
import { BatchGetItemCommand, BatchWriteItemCommand, DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoDbRepository } from '../src';

describe('DynamoDbRepository Unit Tests', () => {
    const client = new DynamoDBClient({ region: 'us-east-1' });
    const repository = new DynamoDbRepository<{ id: string }, { id: string; name: string }>({
        client,
        tableName: 'unit-test-table',
        hashKey: 'id',
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('batchGetItems with UnprocessedKeys', () => {
        it('retries until all UnprocessedKeys are resolved, handling missing Responses on retry', async () => {
            const item1 = marshall({ id: 'a', name: 'Alice' });
            const item2 = marshall({ id: 'b', name: 'Bob' });

            let callCount = 0;
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                callCount++;
                if (command instanceof BatchGetItemCommand) {
                    if (callCount === 1) {
                        // First call: item1 retrieved, item2 unprocessed; Responses omits 'b' to
                        // exercise the `?? []` fallback when a table key is absent in Responses.
                        return {
                            Responses: {},
                            UnprocessedKeys: { 'unit-test-table': { Keys: [{ id: { S: 'a' } }, { id: { S: 'b' } }] } },
                        };
                    }
                    return {
                        Responses: { 'unit-test-table': [item1, item2] },
                        UnprocessedKeys: {},
                    };
                }
                throw new Error('Unexpected command type');
            });

            const result = await repository.batchGetItems([{ id: 'a' }, { id: 'b' }]);

            expect(callCount).toBe(2);
            expect(result.map(r => r.id).sort()).toEqual(['a', 'b']);
        });

        it('should handle empty UnprocessedKeys response', async () => {
            const item1 = marshall({ id: 'a', name: 'Alice' });

            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof BatchGetItemCommand) {
                    return {
                        Responses: { 'unit-test-table': [item1] },
                        UnprocessedKeys: {},
                    };
                }
                throw new Error('Unexpected command type');
            });

            const result = await repository.batchGetItems([{ id: 'a' }]);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('a');
        });

        it('should handle missing Responses table key gracefully', async () => {
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof BatchGetItemCommand) {
                    return {
                        Responses: { /* table key missing */ },
                        UnprocessedKeys: {},
                    };
                }
                throw new Error('Unexpected command type');
            });

            const result = await repository.batchGetItems([{ id: 'a' }]);

            expect(result).toHaveLength(0);
        });
    });

    describe('batchWriteItems with UnprocessedItems', () => {
        it('retries until all UnprocessedItems are written', async () => {
            const item = marshall({ id: 'c', name: 'Carol' });

            let callCount = 0;
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                callCount++;
                if (command instanceof BatchWriteItemCommand) {
                    if (callCount === 1) {
                        return {
                            UnprocessedItems: {
                                'unit-test-table': [{ PutRequest: { Item: item } }],
                            },
                        };
                    }
                    return { UnprocessedItems: {} };
                }
                throw new Error('Unexpected command type');
            });

            await expect(
                repository.batchWriteItems(
                    [{ key: { id: 'c' }, item: { id: 'c', name: 'Carol' } }],
                    [],
                )
            ).resolves.not.toThrow();
            expect(callCount).toBe(2);
        });

        it('should handle empty UnprocessedItems response', async () => {
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof BatchWriteItemCommand) {
                    return { UnprocessedItems: {} };
                }
                throw new Error('Unexpected command type');
            });

            await expect(
                repository.batchWriteItems(
                    [{ key: { id: 'c' }, item: { id: 'c', name: 'Carol' } }],
                    [],
                )
            ).resolves.not.toThrow();
        });

        it('should handle multiple retries of UnprocessedItems', async () => {
            const item = marshall({ id: 'd', name: 'Diana' });

            let callCount = 0;
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                callCount++;
                if (command instanceof BatchWriteItemCommand) {
                    if (callCount <= 2) {
                        return {
                            UnprocessedItems: {
                                'unit-test-table': [{ PutRequest: { Item: item } }],
                            },
                        };
                    }
                    return { UnprocessedItems: {} };
                }
                throw new Error('Unexpected command type');
            });

            await expect(
                repository.batchWriteItems(
                    [{ key: { id: 'd' }, item: { id: 'd', name: 'Diana' } }],
                    [],
                )
            ).resolves.not.toThrow();
            expect(callCount).toBeGreaterThan(2);
        });
    });

    describe('error handling', () => {
        it('should propagate DynamoDB errors from batchGetItems', async () => {
            const testError = new Error('ValidationException: Provided list of items must not be empty');

            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof BatchGetItemCommand) {
                    throw testError;
                }
                throw new Error('Unexpected command type');
            });

            await expect(repository.batchGetItems([{ id: 'a' }])).rejects.toThrow('ValidationException');
        });

        it('should propagate DynamoDB errors from batchWriteItems', async () => {
            const testError = new Error('ResourceNotFoundException: Requested resource not found');

            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof BatchWriteItemCommand) {
                    throw testError;
                }
                throw new Error('Unexpected command type');
            });

            await expect(
                repository.batchWriteItems(
                    [{ key: { id: 'e' }, item: { id: 'e', name: 'Eve' } }],
                    [],
                )
            ).rejects.toThrow('ResourceNotFoundException');
        });

        it('should propagate DynamoDB errors from getItem', async () => {
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof GetItemCommand) {
                    throw new Error('ProvisionedThroughputExceededException');
                }
                throw new Error('Unexpected command type');
            });

            await expect(repository.getItem({ id: 'a' })).rejects.toThrow('ProvisionedThroughputExceededException');
        });

        it('should propagate DynamoDB errors from putItem', async () => {
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof PutItemCommand) {
                    throw new Error('ConditionalCheckFailedException');
                }
                throw new Error('Unexpected command type');
            });

            await expect(
                repository.putItem({ id: 'a' }, { id: 'a', name: 'Alice' })
            ).rejects.toThrow('ConditionalCheckFailedException');
        });

        it('should propagate DynamoDB errors from deleteItem', async () => {
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof DeleteItemCommand) {
                    throw new Error('ResourceNotFoundException');
                }
                throw new Error('Unexpected command type');
            });

            await expect(repository.deleteItem({ id: 'a' })).rejects.toThrow('ResourceNotFoundException');
        });

        it('should propagate DynamoDB errors from updateItem', async () => {
            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof UpdateItemCommand) {
                    throw new Error('ValidationException');
                }
                throw new Error('Unexpected command type');
            });

            await expect(
                repository.updateItem({ id: 'a' }, { name: 'Updated' })
            ).rejects.toThrow('ValidationException');
        });
    });

    describe('batchGetItems deduplication and pagination', () => {
        it('deduplicates repeated keys into a single request', async () => {
            const item = marshall({ id: 'a', name: 'Alice' });
            const requestedKeyCounts: number[] = [];

            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof BatchGetItemCommand) {
                    const keys = command.input.RequestItems?.['unit-test-table']?.Keys ?? [];
                    requestedKeyCounts.push(keys.length);
                    return { Responses: { 'unit-test-table': [item] }, UnprocessedKeys: {} };
                }
                throw new Error('Unexpected command type');
            });

            await repository.batchGetItems([{ id: 'a' }, { id: 'a' }, { id: 'a' }]);

            expect(requestedKeyCounts).toEqual([1]);
        });

        it('splits more than 100 unique keys across multiple batch requests', async () => {
            const requestedKeyCounts: number[] = [];

            vi.spyOn(client, 'send').mockImplementation(async (command) => {
                if (command instanceof BatchGetItemCommand) {
                    const keys = command.input.RequestItems?.['unit-test-table']?.Keys ?? [];
                    requestedKeyCounts.push(keys.length);
                    return { Responses: { 'unit-test-table': [] }, UnprocessedKeys: {} };
                }
                throw new Error('Unexpected command type');
            });

            const keys = Array.from({ length: 150 }, (_, i) => ({ id: `id-${i}` }));
            await repository.batchGetItems(keys);

            expect(requestedKeyCounts.length).toBe(2);
            expect(requestedKeyCounts.reduce((a, b) => a + b, 0)).toBe(150);
            expect(Math.max(...requestedKeyCounts)).toBe(100);
        });
    });
});
