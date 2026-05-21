import { vi, describe, it, expect, afterEach } from 'vitest';
import { BatchGetItemCommand, BatchWriteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
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
    });
});
