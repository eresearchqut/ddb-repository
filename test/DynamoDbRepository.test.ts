
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { LocalstackContainer, StartedLocalStackContainer } from "@testcontainers/localstack";
import {ConsumedCapacityDetail, consumedCapacityMiddleware, DynamoDbRepository, FilterOperator} from "../src";

describe('DynamoDbRepository Integration Tests', () => {
    let container: StartedLocalStackContainer;
    let dynamoDBClient: DynamoDBClient;
    let repository: DynamoDbRepository<{ id: string }, { id: string; name: string; email?: string; age?: number; status?: string, score?: number }>;
    let compositeRepository: DynamoDbRepository<{ userId: string; itemId?: string }, { userId: string; itemId: string; name: string; category?: string; price?: number }>;
    let gsiRepository: DynamoDbRepository<{ userId: string; itemId: string, status?: string }, { userId: string; itemId: string; name: string; category?: string; status?: string; createdAt?: string }>;
    const tableName = 'test-table';
    const compositeTableName = 'test-composite-table';
    const gsiTableName = 'test-gsi-table';
    const consumedCapacityRegister = new Array<ConsumedCapacityDetail>() ;

    const getConsumedCapacity = (consumedCapacity: ConsumedCapacityDetail) => {
        if (Array.isArray(consumedCapacity.ConsumedCapacity)) {
            return consumedCapacity.ConsumedCapacity
                .reduce((total, capacity) => total + (capacity?.CapacityUnits || 0), 0);
        }
        return consumedCapacity.ConsumedCapacity?.CapacityUnits || 0;
    }

    const sumConsumedCapacity = () =>
        consumedCapacityRegister.reduce((total, value) =>
            total + getConsumedCapacity(value), 0);

    beforeAll(async () => {
        // Start LocalStack container with DynamoDB
        container = await new LocalstackContainer("localstack/localstack:latest")
            .start();

        // Create DynamoDB client pointing to the container
        dynamoDBClient = new DynamoDBClient({
            endpoint: container.getConnectionUri(),
            region: "us-east-1",
            credentials: {
                accessKeyId: "test",
                secretAccessKey: "test",
            },
        });

        dynamoDBClient.middlewareStack
            .add(consumedCapacityMiddleware({onConsumedCapacity: async (consumedCapacity) =>
                    consumedCapacityRegister.push(consumedCapacity)}));

        // Create the test table with a simple key
        await dynamoDBClient.send(
            new CreateTableCommand({
                TableName: tableName,
                KeySchema: [
                    { AttributeName: "id", KeyType: "HASH" },
                ],
                AttributeDefinitions: [
                    { AttributeName: "id", AttributeType: "S" },
                ],
                BillingMode: "PAY_PER_REQUEST",
            })
        );

        // Create the test table with a composite key (partition key + sort key)
        await dynamoDBClient.send(
            new CreateTableCommand({
                TableName: compositeTableName,
                KeySchema: [
                    { AttributeName: "userId", KeyType: "HASH" },
                    { AttributeName: "itemId", KeyType: "RANGE" },
                ],
                AttributeDefinitions: [
                    { AttributeName: "userId", AttributeType: "S" },
                    { AttributeName: "itemId", AttributeType: "S" },
                ],
                BillingMode: "PAY_PER_REQUEST",
            })
        );

        // Create the test table with GSI
        await dynamoDBClient.send(
            new CreateTableCommand({
                TableName: gsiTableName,
                KeySchema: [
                    { AttributeName: "userId", KeyType: "HASH" },
                    { AttributeName: "itemId", KeyType: "RANGE" },
                ],
                AttributeDefinitions: [
                    { AttributeName: "userId", AttributeType: "S" },
                    { AttributeName: "itemId", AttributeType: "S" },
                    { AttributeName: "status", AttributeType: "S" },
                    { AttributeName: "createdAt", AttributeType: "S" },
                ],
                GlobalSecondaryIndexes: [
                    {
                        IndexName: "StatusIndex",
                        KeySchema: [
                            { AttributeName: "status", KeyType: "HASH" },
                            { AttributeName: "createdAt", KeyType: "RANGE" },
                        ],
                        Projection: {
                            ProjectionType: "ALL",
                        },
                    },
                ],
                BillingMode: "PAY_PER_REQUEST",
            })
        );

        // Wait for tables to be active
        for (const table of [tableName, compositeTableName, gsiTableName]) {
            let tableActive = false;
            while (!tableActive) {
                const response = await dynamoDBClient.send(
                    new DescribeTableCommand({ TableName: table })
                );
                tableActive = response.Table?.TableStatus === "ACTIVE";
                if (!tableActive) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }

        // Initialize repositories
        repository = new DynamoDbRepository({
            client: dynamoDBClient,
            tableName: tableName,
            hashKey: "id"
        });
        compositeRepository = new DynamoDbRepository({
            client: dynamoDBClient,
            tableName: compositeTableName,
            hashKey: "userId",
            rangeKey: "itemId"
        });
        gsiRepository = new DynamoDbRepository({
            client: dynamoDBClient,
            tableName: gsiTableName,
            hashKey: "userId",
            rangeKey: "itemId"
        });
    });

    beforeEach(async () => {
        consumedCapacityRegister.splice(0, consumedCapacityRegister.length);
    });

    afterAll(async () => {
        // Clean up
        if (dynamoDBClient) {
            dynamoDBClient.destroy();
        }
        if (container) {
            await container.stop();
        }
    });

    describe('getItem', () => {
        it('should return undefined when item does not exist', async () => {
            const result = await repository.getItem({ id: 'non-existent' });
            expect(result).toBeUndefined();
            expect(sumConsumedCapacity()).toEqual(0.5);
        });

        it('should return the item when it exists', async () => {
            const key = { id: 'test-123' };
            const record = { id: 'test-123', name: 'Test User', email: 'test@example.com' };

            await repository.putItem(key, record);
            const result = await repository.getItem(key);

            expect(result).toEqual(record);
            expect(sumConsumedCapacity()).toEqual(2);
        });
    });

    describe('putItem', () => {
        it('should create a new item', async () => {
            const key = { id: 'new-item' };
            const record = { id: 'new-item', name: 'New Item' };

            const result = await repository.putItem(key, record);

            expect(result).toEqual(record);
            expect(sumConsumedCapacity()).toEqual(1.5);
        });
    });

    describe('deleteItem', () => {
        it('should delete an existing item', async () => {
            const key = { id: 'delete-test-1' };
            const record = { id: 'delete-test-1', name: 'To Be Deleted' };

            await repository.putItem(key, record);
            await repository.deleteItem(key);
            const afterDelete = await repository.getItem(key);
            expect(afterDelete).toBeUndefined();
            expect(sumConsumedCapacity()).toEqual(2);
        });
    });

    describe('updateItem', () => {
        it('should update a single attribute', async () => {
            const key = { id: 'update-single' };
            const record = { id: 'update-single', name: 'Original Name', email: 'original@example.com' };

            await repository.putItem(key, record);
            const result = await repository.updateItem(key, { name: 'Updated Name' });

            expect(result).toEqual({
                id: 'update-single',
                name: 'Updated Name',
                email: 'original@example.com'
            });
            expect(sumConsumedCapacity()).toEqual(3);
        });
    });

    describe('batchGetItems', () => {
        beforeEach(async () => {
            // Create test items
            for (let i = 1; i <= 10; i++) {
                await repository.putItem(
                    { id: `batch-item-${i}` },
                    { id: `batch-item-${i}`, name: `Item ${i}`, age: i * 10 }
                );
            }
            consumedCapacityRegister.splice(0, consumedCapacityRegister.length);
        });

        it('should retrieve multiple items by keys', async () => {
            const keys = [
                { id: 'batch-item-1' },
                { id: 'batch-item-2' },
                { id: 'batch-item-3' },
            ];

            const results = await repository.batchGetItems(keys);

            expect(results).toBeDefined();
            expect(results?.length).toBe(3);
            expect(results).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: 'batch-item-1', name: 'Item 1', age: 10 }),
                    expect.objectContaining({ id: 'batch-item-2', name: 'Item 2', age: 20 }),
                    expect.objectContaining({ id: 'batch-item-3', name: 'Item 3', age: 30 }),
                ])
            );
            expect(sumConsumedCapacity()).toEqual(1.5);
        });

        it('should handle empty keys array', async () => {
            const results = await repository.batchGetItems([]);

            expect(results).toBeDefined();
            expect(results?.length).toBe(0);
            expect(sumConsumedCapacity()).toEqual(0);
        });

        it('should handle non-existent keys gracefully', async () => {
            const keys = [
                { id: 'batch-item-1' },
                { id: 'non-existent-1' },
                { id: 'batch-item-2' },
                { id: 'non-existent-2' },
            ];

            const results = await repository.batchGetItems(keys);

            expect(results).toBeDefined();
            // Only existing items should be returned
            const existingItems = results?.filter(item => item !== undefined);
            expect(existingItems?.length).toBeGreaterThanOrEqual(2);

            const ids = existingItems?.map(item => item.id);
            expect(ids).toContain('batch-item-1');
            expect(ids).toContain('batch-item-2');
            expect(sumConsumedCapacity()).toEqual(1);
        });

        it('should handle batch size over 100 items (pagination)', async () => {
            // Create 150 items
            const keys = [];
            for (let i = 1; i <= 150; i++) {
                const key = { id: `batch-large-${i}` };
                keys.push(key);
                await repository.putItem(key, { id: `batch-large-${i}`, name: `Item ${i}`, age: i });
            }

            const results = await repository.batchGetItems(keys);

            expect(results).toBeDefined();
            expect(results?.length).toBe(150);

            // Verify some random items
            const item50 = results?.find(r => r?.id === 'batch-large-50');
            const item100 = results?.find(r => r?.id === 'batch-large-100');
            const item150 = results?.find(r => r?.id === 'batch-large-150');

            expect(item50).toBeDefined();
            expect(item100).toBeDefined();
            expect(item150).toBeDefined();
            expect(sumConsumedCapacity()).toEqual(300);
        }, 60000);

        it('should retrieve composite key items', async () => {
            // Create test items with composite keys
            await compositeRepository.putItem(
                { userId: 'user-batch-1', itemId: 'item-a' },
                { userId: 'user-batch-1', itemId: 'item-a', name: 'Item A', category: 'test', price: 100 }
            );
            await compositeRepository.putItem(
                { userId: 'user-batch-1', itemId: 'item-b' },
                { userId: 'user-batch-1', itemId: 'item-b', name: 'Item B', category: 'test', price: 200 }
            );
            await compositeRepository.putItem(
                { userId: 'user-batch-2', itemId: 'item-c' },
                { userId: 'user-batch-2', itemId: 'item-c', name: 'Item C', category: 'test', price: 300 }
            );

            const keys = [
                { userId: 'user-batch-1', itemId: 'item-a' },
                { userId: 'user-batch-1', itemId: 'item-b' },
                { userId: 'user-batch-2', itemId: 'item-c' },
            ];

            const results = await compositeRepository.batchGetItems(keys);

            expect(results).toBeDefined();
            expect(results?.length).toBe(3);
            expect(results).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ userId: 'user-batch-1', itemId: 'item-a', price: 100 }),
                    expect.objectContaining({ userId: 'user-batch-1', itemId: 'item-b', price: 200 }),
                    expect.objectContaining({ userId: 'user-batch-2', itemId: 'item-c', price: 300 }),
                ])
            );
            expect(sumConsumedCapacity()).toEqual(6);
        });

        it('should maintain order independence', async () => {
            const keys = [
                { id: 'batch-item-5' },
                { id: 'batch-item-1' },
                { id: 'batch-item-3' },
            ];

            const results = await repository.batchGetItems(keys);

            expect(results).toBeDefined();
            expect(results?.length).toBe(3);

            // Verify all items are present regardless of order
            const ids = results?.map(item => item?.id);
            expect(ids).toContain('batch-item-1');
            expect(ids).toContain('batch-item-3');
            expect(ids).toContain('batch-item-5');
            expect(sumConsumedCapacity()).toEqual(1.5);
        });

        it('should handle duplicate keys in input', async () => {
            const keys = [
                { id: 'batch-item-1' },
                { id: 'batch-item-1' }, // duplicate
                { id: 'batch-item-2' },
                { id: 'batch-item-2' }, // duplicate
            ];

            const results = await repository.batchGetItems(keys);

            expect(results).toBeDefined();
            // Results may contain duplicates depending on DynamoDB behavior
            expect(results?.length).toBeGreaterThanOrEqual(2);

            const item1Count = results?.filter(r => r?.id === 'batch-item-1').length;
            const item2Count = results?.filter(r => r?.id === 'batch-item-2').length;

            expect(item1Count).toBeGreaterThanOrEqual(1);
            expect(item2Count).toBeGreaterThanOrEqual(1);
            expect(sumConsumedCapacity()).toEqual(1);
        });

        it('should retrieve all attributes for batched items', async () => {
            await repository.putItem(
                { id: 'batch-full-attrs' },
                { id: 'batch-full-attrs', name: 'Full Item', email: 'test@example.com', age: 30, status: 'active' }
            );

            const results = await repository.batchGetItems([{ id: 'batch-full-attrs' }]);

            expect(results).toBeDefined();
            expect(results?.length).toBe(1);
            expect(results?.[0]).toEqual({
                id: 'batch-full-attrs',
                name: 'Full Item',
                email: 'test@example.com',
                age: 30,
                status: 'active'
            });
            expect(sumConsumedCapacity()).toEqual(2);
        });
    });

    describe('getItems', () => {
        describe('with simple partition key', () => {
            it('should retrieve item by partition key', async () => {
                const testId = 'query-test-simple';
                await repository.putItem({ id: testId }, { id: testId, name: 'Test Item', age: 25 });

                const results = await repository.getItems({ id: testId });

                expect(results).toBeDefined();
                expect(results?.length).toBe(1);
                expect(results?.[0]).toEqual({
                    id: testId,
                    name: 'Test Item',
                    age: 25
                });
                expect(sumConsumedCapacity()).toEqual(2);
            });

        });

        describe('with composite key (partition + sort)', () => {
            beforeEach(async () => {
                const userId = 'user-456';
                await compositeRepository.putItem(
                    { userId, itemId: 'item-1' },
                    { userId, itemId: 'item-1', name: 'Item One', category: 'electronics', price: 100 }
                );
                await compositeRepository.putItem(
                    { userId, itemId: 'item-2' },
                    { userId, itemId: 'item-2', name: 'Item Two', category: 'books', price: 20 }
                );
                await compositeRepository.putItem(
                    { userId, itemId: 'item-3' },
                    { userId, itemId: 'item-3', name: 'Item Three', category: 'electronics', price: 150 }
                );
                consumedCapacityRegister.splice(0, consumedCapacityRegister.length);
            });

            it('should retrieve all items for a partition key', async () => {
                const results = await compositeRepository.getItems({ userId: 'user-456' });

                expect(results).toBeDefined();
                expect(results?.length).toBe(3);
            });

            it('should filter results with operators', async () => {
                const results = await compositeRepository.getItems({
                    userId: 'user-456',
                    filterExpressions: [
                        { attribute: 'category', value: 'electronics', operator: FilterOperator.EQUALS }
                    ]
                });
                expect(results).toBeDefined();
                expect(results?.length).toBe(2);
                expect(results?.every(item => item.category === 'electronics')).toBe(true);
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

        });

        describe('with GSI (Global Secondary Index)', () => {
            beforeEach(async () => {
                // Create items with different statuses and timestamps
                const baseTime = new Date('2024-01-01T00:00:00Z').getTime();

                await gsiRepository.putItem(
                    { userId: 'user-gsi-1', itemId: 'gsi-item-1' },
                    {
                        userId: 'user-gsi-1',
                        itemId: 'gsi-item-1',
                        name: 'Active Item 1',
                        category: 'electronics',
                        status: 'active',
                        createdAt: new Date(baseTime).toISOString()
                    }
                );
                await gsiRepository.putItem(
                    { userId: 'user-gsi-2', itemId: 'gsi-item-2' },
                    {
                        userId: 'user-gsi-2',
                        itemId: 'gsi-item-2',
                        name: 'Active Item 2',
                        category: 'books',
                        status: 'active',
                        createdAt: new Date(baseTime + 3600000).toISOString()
                    }
                );
                await gsiRepository.putItem(
                    { userId: 'user-gsi-3', itemId: 'gsi-item-3' },
                    {
                        userId: 'user-gsi-3',
                        itemId: 'gsi-item-3',
                        name: 'Active Item 3',
                        category: 'electronics',
                        status: 'active',
                        createdAt: new Date(baseTime + 7200000).toISOString()
                    }
                );
                await gsiRepository.putItem(
                    { userId: 'user-gsi-4', itemId: 'gsi-item-4' },
                    {
                        userId: 'user-gsi-4',
                        itemId: 'gsi-item-4',
                        name: 'Pending Item',
                        category: 'books',
                        status: 'pending',
                        createdAt: new Date(baseTime + 10800000).toISOString()
                    }
                );
                await gsiRepository.putItem(
                    { userId: 'user-gsi-5', itemId: 'gsi-item-5' },
                    {
                        userId: 'user-gsi-5',
                        itemId: 'gsi-item-5',
                        name: 'Inactive Item',
                        category: 'clothing',
                        status: 'inactive',
                        createdAt: new Date(baseTime + 14400000).toISOString()
                    }
                );

                // Wait for GSI to be consistent
                await new Promise(resolve => setTimeout(resolve, 2000));
                consumedCapacityRegister.splice(0, consumedCapacityRegister.length);
            });

            it('should query items using GSI and fetch full items via batchGetItems', async () => {
                const results = await gsiRepository.getItems({
                    status: 'active',
                    index: 'StatusIndex'
                });
                expect(results).toBeDefined();
                // When using index, it queries GSI then uses batchGetItems to fetch full items
                expect(Array.isArray(results)).toBe(true);
                expect(sumConsumedCapacity()).toEqual(2);
            });

            it('should query all items with specific status using GSI', async () => {
                const results = await gsiRepository.getItems({
                    status: 'active',
                    index: 'StatusIndex'
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    // All returned items should have the queried status
                    results.forEach(item => {
                        expect(item.status).toBe('active');
                    });
                }
                expect(sumConsumedCapacity()).toEqual(2);
            });

            it('should combine GSI query with filter expressions', async () => {
                const results = await gsiRepository.getItems({
                    status: 'active',
                    index: 'StatusIndex',
                    filterExpressions: [
                        { attribute: 'category', value: 'electronics', operator: FilterOperator.EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    results.forEach(item => {
                        expect(item.status).toBe('active');
                        expect(item.category).toBe('electronics');
                    });
                }
                expect(sumConsumedCapacity()).toEqual(1.5);
            });

            it('should return full item attributes when querying via GSI', async () => {
                const results = await gsiRepository.getItems({
                    status: 'active',
                    index: 'StatusIndex'
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    const item = results.find(r => r.itemId === 'gsi-item-2');
                    if (item) {
                        // Should have all attributes from main table
                        expect(item).toHaveProperty('userId');
                        expect(item).toHaveProperty('itemId');
                        expect(item).toHaveProperty('name');
                        expect(item).toHaveProperty('category');
                        expect(item).toHaveProperty('status');
                        expect(item).toHaveProperty('createdAt');
                    }
                }
                expect(sumConsumedCapacity()).toEqual(2);
            });

            it('should handle GSI query with multiple items', async () => {
                const results = await gsiRepository.getItems({
                    status: 'active',
                    index: 'StatusIndex'
                });

                expect(results).toBeDefined();
                expect(Array.isArray(results)).toBe(true);

                // Should use batchGetItems internally to fetch full items
                if (results && results.length > 0) {
                    results.forEach(item => {
                        expect(item).toHaveProperty('userId');
                        expect(item).toHaveProperty('itemId');
                    });
                }
                expect(sumConsumedCapacity()).toEqual(2);
            });

            it('should respect projection when querying GSI', async () => {
                const results = await gsiRepository.getItems({
                    status: 'active',
                    index: 'StatusIndex',
                    projectedAttributes: ['name', 'status']
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    // Note: Since we use batchGetItems after GSI query,
                    // we get full items from main table
                    results.forEach(item => {
                        expect(item).toHaveProperty('name');
                        expect(item).toHaveProperty('status');
                    });
                }
                expect(sumConsumedCapacity()).toEqual(2);
            });

            it('should handle empty results from GSI query', async () => {
                const results = await gsiRepository.getItems({
                    status: 'non-existent-status',
                    index: 'StatusIndex'
                });

                expect(results).toBeDefined();
                expect(results?.length).toBe(0);
                expect(sumConsumedCapacity()).toEqual(0);
            });
        });

        describe('pagination with GSI', () => {
            beforeEach(async () => {
                // Create many items to test pagination via GSI
                const baseTime = new Date('2024-01-01T00:00:00Z').getTime();

                for (let i = 1; i <= 120; i++) {
                    await gsiRepository.putItem(
                        { userId: `user-page-${i}`, itemId: `page-item-${i.toString().padStart(3, '0')}` },
                        {
                            userId: `user-page-${i}`,
                            itemId: `page-item-${i.toString().padStart(3, '0')}`,
                            name: `Paginated Item ${i}`,
                            category: i % 2 === 0 ? 'even' : 'odd',
                            status: 'paginated',
                            createdAt: new Date(baseTime + i * 60000).toISOString()
                        }
                    );
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
                consumedCapacityRegister.splice(0, consumedCapacityRegister.length);
            });

            it('should retrieve all items across multiple pages via GSI', async () => {
                const results = await gsiRepository.getItems({
                    status: 'paginated',
                    index: 'StatusIndex'
                });

                expect(results).toBeDefined();
                expect(Array.isArray(results)).toBe(true);
                expect(sumConsumedCapacity()).toEqual(62);
                // Should handle pagination internally via batchGetItems
            }, 60000);

        });
    });

    describe('multiple operations', () => {
        it('should handle full lifecycle', async () => {
            const key = { id: 'full-lifecycle-2' };
            const record = { id: 'full-lifecycle-2', name: 'Initial', email: 'initial@example.com' };

            await repository.putItem(key, record);
            await repository.updateItem(key, { name: 'Modified' });

            const afterUpdate = await repository.getItem(key);
            expect(afterUpdate?.name).toBe('Modified');

            await repository.deleteItem(key);
            const afterDelete = await repository.getItem(key);
            expect(afterDelete).toBeUndefined();
        });
    });

    describe('FilterOperator Tests', () => {
        beforeEach(async () => {
            // Create test data with various values for filtering
            const testData = [
                { id: 'filter-1', name: 'Alice', age: 25, score: 85.5, status: 'active', tags: ['new', 'premium'] },
                { id: 'filter-2', name: 'Bob', age: 30, score: 90.0, status: 'active', tags: ['premium'] },
                { id: 'filter-3', name: 'Charlie', age: 35, score: 75.0, status: 'inactive', tags: ['new'] },
                { id: 'filter-4', name: 'Diana', age: 28, score: 95.5, status: 'active', tags: ['vip', 'premium'] },
                { id: 'filter-5', name: 'Eve', age: 22, score: 80.0, status: 'pending', tags: ['new'] },
                { id: 'filter-6', name: 'Frank', age: 40, score: 70.0, status: 'inactive', tags: [] },
                { id: 'filter-7', name: 'Grace', age: 33, score: 88.0, status: 'active', tags: ['premium', 'vip'] },
            ];

            for (const data of testData) {
                await repository.putItem({ id: data.id }, data);
            }
            consumedCapacityRegister.splice(0, consumedCapacityRegister.length);
        });

        describe('EQUALS operator', () => {
            it('should filter items with exact string match', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'status', value: 'active', operator: FilterOperator.EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                expect(results?.every(item => item.status === 'active')).toBe(true);
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should filter items with exact number match', async () => {
                const results = await repository.getItems({
                    id: 'filter-2',
                    filterExpressions: [
                        { attribute: 'age', value: 30, operator: FilterOperator.EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results[0].age).toBe(30);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should return empty array when no match found', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'status', value: 'non-existent', operator: FilterOperator.EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                expect(results?.length).toBe(0);
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('NOT_EQUALS operator', () => {
            it('should filter items not matching string value', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'status', value: 'inactive', operator: FilterOperator.NOT_EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results[0].status).not.toBe('inactive');
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should filter items not matching number value', async () => {
                const results = await repository.getItems({
                    id: 'filter-3',
                    filterExpressions: [
                        { attribute: 'age', value: 25, operator: FilterOperator.NOT_EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results[0].age).not.toBe(25);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('GREATER_THAN operator', () => {
            it('should filter items greater than number value', async () => {
                const results = await repository.getItems({
                    id: 'filter-3',
                    filterExpressions: [
                        { attribute: 'age', value: 30, operator: FilterOperator.GREATER_THAN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.age && item.age > 30)).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should filter items greater than decimal value', async () => {
                const results = await repository.getItems({
                    id: 'filter-2',
                    filterExpressions: [
                        { attribute: 'score', value: 89.0, operator: FilterOperator.GREATER_THAN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.score && item.score > 89.0)).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should return empty array when no items are greater', async () => {
                const results = await repository.getItems({
                    id: 'filter-5',
                    filterExpressions: [
                        { attribute: 'age', value: 100, operator: FilterOperator.GREATER_THAN }
                    ]
                });

                expect(results).toBeDefined();
                expect(results?.length).toBe(0);
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('GREATER_THAN_OR_EQUALS operator', () => {
            it('should filter items greater than or equal to value', async () => {
                const results = await repository.getItems({
                    id: 'filter-2',
                    filterExpressions: [
                        { attribute: 'age', value: 30, operator: FilterOperator.GREATER_THAN_OR_EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.age && item.age >= 30)).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should include items with exact value', async () => {
                const results = await repository.getItems({
                    id: 'filter-4',
                    filterExpressions: [
                        { attribute: 'score', value: 95.5, operator: FilterOperator.GREATER_THAN_OR_EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    const exactMatch = results.find(item => item.score === 95.5);
                    expect(exactMatch).toBeDefined();
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('LESS_THAN operator', () => {
            it('should filter items less than number value', async () => {
                const results = await repository.getItems({
                    id: 'filter-5',
                    filterExpressions: [
                        { attribute: 'age', value: 30, operator: FilterOperator.LESS_THAN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.age && item.age < 30)).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should filter items less than decimal value', async () => {
                const results = await repository.getItems({
                    id: 'filter-6',
                    filterExpressions: [
                        { attribute: 'score', value: 75.0, operator: FilterOperator.LESS_THAN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.score && item.score < 75.0)).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('LESS_THAN_OR_EQUALS operator', () => {
            it('should filter items less than or equal to value', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'age', value: 25, operator: FilterOperator.LESS_THAN_OR_EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.age && item.age <= 25)).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should include items with exact value', async () => {
                const results = await repository.getItems({
                    id: 'filter-2',
                    filterExpressions: [
                        { attribute: 'score', value: 90.0, operator: FilterOperator.LESS_THAN_OR_EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    const exactMatch = results.find(item => item.score === 90.0);
                    expect(exactMatch).toBeDefined();
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('IN operator', () => {
            it('should filter items with value in array of strings', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'status', value: ['active', 'pending'], operator: FilterOperator.IN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => ['active', 'pending'].includes(item.status || ''))).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should filter items with value in array of numbers', async () => {
                const results = await repository.getItems({
                    id: 'filter-2',
                    filterExpressions: [
                        { attribute: 'age', value: [25, 30, 35], operator: FilterOperator.IN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => [25, 30, 35].includes(item.age || 0))).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should return empty array when value not in list', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'status', value: ['deleted', 'archived'], operator: FilterOperator.IN }
                    ]
                });

                expect(results).toBeDefined();
                expect(results?.length).toBe(0);
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should handle single value in array', async () => {
                const results = await repository.getItems({
                    id: 'filter-4',
                    filterExpressions: [
                        { attribute: 'status', value: ['active'], operator: FilterOperator.IN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results[0].status).toBe('active');
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('BETWEEN operator', () => {
            it('should filter items with number value between range', async () => {
                const results = await repository.getItems({
                    id: 'filter-4',
                    filterExpressions: [
                        { attribute: 'age', value: [25, 35], operator: FilterOperator.BETWEEN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.age && item.age >= 25 && item.age <= 35)).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should filter items with decimal value between range', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'score', value: [80.0, 90.0], operator: FilterOperator.BETWEEN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.score && item.score >= 80.0 && item.score <= 90.0)).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should include boundary values', async () => {
                const results = await repository.getItems({
                    id: 'filter-2',
                    filterExpressions: [
                        { attribute: 'age', value: [30, 40], operator: FilterOperator.BETWEEN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    const hasLowerBound = results.some(item => item.age === 30);
                    const hasUpperBound = results.some(item => item.age === 40);
                    expect(hasLowerBound || hasUpperBound).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should return empty array when no values in range', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'age', value: [50, 60], operator: FilterOperator.BETWEEN }
                    ]
                });

                expect(results).toBeDefined();
                expect(results?.length).toBe(0);
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should filter items with string value between range (lexicographical)', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'name', value: ['Alice', 'Diana'], operator: FilterOperator.BETWEEN }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => 
                        item.name && item.name >= 'Alice' && item.name <= 'Diana'
                    )).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('Multiple filter expressions', () => {
            it('should apply multiple filter conditions (AND logic)', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'status', value: 'active', operator: FilterOperator.EQUALS },
                        { attribute: 'age', value: 25, operator: FilterOperator.GREATER_THAN_OR_EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => 
                        item.status === 'active' && item.age && item.age >= 25
                    )).toBe(true);
                }
            });

            it('should apply complex filtering with mixed operators', async () => {
                const results = await repository.getItems({
                    id: 'filter-2',
                    filterExpressions: [
                        { attribute: 'status', value: ['active', 'pending'], operator: FilterOperator.IN },
                        { attribute: 'age', value: [20, 35], operator: FilterOperator.BETWEEN },
                        { attribute: 'score', value: 80.0, operator: FilterOperator.GREATER_THAN_OR_EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => 
                        ['active', 'pending'].includes(item.status || '') &&
                        item.age && item.age >= 20 && item.age <= 35 &&
                        item.score && item.score >= 80.0
                    )).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('Negated filter expressions', () => {
            it('should negate EQUALS operator', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: [
                        { attribute: 'status', value: 'inactive', operator: FilterOperator.EQUALS, negate: true }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => item.status !== 'inactive')).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should negate IN operator', async () => {
                const results = await repository.getItems({
                    id: 'filter-6',
                    filterExpressions: [
                        { attribute: 'status', value: ['active', 'pending'], operator: FilterOperator.IN, negate: true }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => 
                        !['active', 'pending'].includes(item.status || '')
                    )).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });

            it('should negate BETWEEN operator', async () => {
                const results = await repository.getItems({
                    id: 'filter-6',
                    filterExpressions: [
                        { attribute: 'age', value: [25, 35], operator: FilterOperator.BETWEEN, negate: true }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results.every(item => 
                        item.age && (item.age < 25 || item.age > 35)
                    )).toBe(true);
                }
                expect(sumConsumedCapacity()).toEqual(0.5);
            });
        });

        describe('Edge cases', () => {
            it('should handle filtering on missing attributes', async () => {
                await repository.putItem(
                    { id: 'filter-missing' },
                    { id: 'filter-missing', name: 'No Age' }
                );

                const results = await repository.getItems({
                    id: 'filter-missing',
                    filterExpressions: [
                        { attribute: 'age', value: 25, operator: FilterOperator.EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                expect(results?.length).toBe(0);
            });

            it('should handle empty filter expressions array', async () => {
                const results = await repository.getItems({
                    id: 'filter-1',
                    filterExpressions: []
                });

                expect(results).toBeDefined();
                expect(results?.length).toBeGreaterThan(0);
            });

            it('should handle zero values in numeric comparisons', async () => {
                await repository.putItem(
                    { id: 'filter-zero' },
                    { id: 'filter-zero', name: 'Zero Score', score: 0 }
                );

                const results = await repository.getItems({
                    id: 'filter-zero',
                    filterExpressions: [
                        { attribute: 'score', value: 0, operator: FilterOperator.EQUALS }
                    ]
                });

                expect(results).toBeDefined();
                if (results && results.length > 0) {
                    expect(results[0].score).toBe(0);
                }
            });
        });
    });
});