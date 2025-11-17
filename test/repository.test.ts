
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { LocalstackContainer, StartedLocalStackContainer } from "@testcontainers/localstack";
import { DynamoDbRepository } from "../src";

describe('DynamoDbRepository Integration Tests', () => {
    let container: StartedLocalStackContainer;
    let dynamoDBClient: DynamoDBClient;
    let repository: DynamoDbRepository<{ id: string }, { id: string; name: string; email?: string; age?: number; status?: string }>;
    const tableName = 'test-table';

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

        // Create the test table
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

        // Wait for table to be active
        let tableActive = false;
        while (!tableActive) {
            const response = await dynamoDBClient.send(
                new DescribeTableCommand({ TableName: tableName })
            );
            tableActive = response.Table?.TableStatus === "ACTIVE";
            if (!tableActive) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Initialize repository
        repository = new DynamoDbRepository(dynamoDBClient, tableName);
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
        });

        it('should return the item when it exists', async () => {
            const key = { id: 'test-123' };
            const record = { id: 'test-123', name: 'Test User', email: 'test@example.com' };

            await repository.putItem(key, record);
            const result = await repository.getItem(key);

            expect(result).toEqual(record);
        });
    });

    describe('putItem', () => {
        it('should create a new item', async () => {
            const key = { id: 'new-item' };
            const record = { id: 'new-item', name: 'New Item' };

            const result = await repository.putItem(key, record);

            expect(result).toEqual(record);
        });

        it('should update an existing item', async () => {
            const key = { id: 'update-item' };
            const originalRecord = { id: 'update-item', name: 'Original Name' };
            const updatedRecord = { id: 'update-item', name: 'Updated Name', email: 'updated@example.com' };

            await repository.putItem(key, originalRecord);
            const result = await repository.putItem(key, updatedRecord);

            expect(result).toEqual(updatedRecord);

            const retrieved = await repository.getItem(key);
            expect(retrieved).toEqual(updatedRecord);
        });

        it('should handle undefined values correctly', async () => {
            const key = { id: 'undefined-test' };
            const record = { id: 'undefined-test', name: 'Test', email: undefined };

            const result = await repository.putItem(key, record);

            expect(result?.id).toBe('undefined-test');
            expect(result?.name).toBe('Test');
        });
    });

    describe('deleteItem', () => {
        it('should delete an existing item', async () => {
            const key = { id: 'delete-test-1' };
            const record = { id: 'delete-test-1', name: 'To Be Deleted' };

            // Create the item
            await repository.putItem(key, record);

            // Verify it exists
            const beforeDelete = await repository.getItem(key);
            expect(beforeDelete).toEqual(record);

            // Delete the item
            await repository.deleteItem(key);

            // Verify it's gone
            const afterDelete = await repository.getItem(key);
            expect(afterDelete).toBeUndefined();
        });

        it('should return undefined when deleting non-existent item', async () => {
            const key = { id: 'non-existent-delete' };

            const result = await repository.deleteItem(key);

            expect(result).toBeUndefined();
        });

        it('should not affect other items when deleting', async () => {
            const key1 = { id: 'delete-test-2' };
            const record1 = { id: 'delete-test-2', name: 'Item 1' };
            const key2 = { id: 'delete-test-3' };
            const record2 = { id: 'delete-test-3', name: 'Item 2' };

            // Create two items
            await repository.putItem(key1, record1);
            await repository.putItem(key2, record2);

            // Delete first item
            await repository.deleteItem(key1);

            // Verify first item is deleted
            const result1 = await repository.getItem(key1);
            expect(result1).toBeUndefined();

            // Verify second item still exists
            const result2 = await repository.getItem(key2);
            expect(result2).toEqual(record2);
        });

        it('should handle deleting the same item twice', async () => {
            const key = { id: 'delete-twice' };
            const record = { id: 'delete-twice', name: 'Delete Me Twice' };

            // Create the item
            await repository.putItem(key, record);

            // Delete it once
            await repository.deleteItem(key);

            // Delete it again
            const secondDelete = await repository.deleteItem(key);
            expect(secondDelete).toBeUndefined();

            // Verify it's gone
            const result = await repository.getItem(key);
            expect(result).toBeUndefined();
        });

        it('should delete item with all attributes', async () => {
            const key = { id: 'delete-complex' };
            const record = {
                id: 'delete-complex',
                name: 'Complex Item',
                email: 'complex@example.com'
            };

            // Create the item
            await repository.putItem(key, record);

            // Delete it
            await repository.deleteItem(key);

            // Verify complete deletion
            const result = await repository.getItem(key);
            expect(result).toBeUndefined();
        });
    });

    describe('updateItem', () => {
        it('should update a single attribute', async () => {
            const key = { id: 'update-single' };
            const record = { id: 'update-single', name: 'Original Name', email: 'original@example.com' };

            // Create the item
            await repository.putItem(key, record);

            // Update only the name
            const result = await repository.updateItem(key, { name: 'Updated Name' });

            expect(result).toEqual({
                id: 'update-single',
                name: 'Updated Name',
                email: 'original@example.com'
            });
        });

        it('should update multiple attributes', async () => {
            const key = { id: 'update-multiple' };
            const record = { id: 'update-multiple', name: 'Original', email: 'old@example.com', age: 25 };

            await repository.putItem(key, record);

            const result = await repository.updateItem(key, {
                name: 'New Name',
                email: 'new@example.com',
                age: 30
            });

            expect(result).toEqual({
                id: 'update-multiple',
                name: 'New Name',
                email: 'new@example.com',
                age: 30
            });
        });

        it('should add new attributes to existing item', async () => {
            const key = { id: 'add-attributes' };
            const record = { id: 'add-attributes', name: 'Test User' };

            await repository.putItem(key, record);

            const result = await repository.updateItem(key, {
                email: 'test@example.com',
                age: 25
            });

            expect(result).toEqual({
                id: 'add-attributes',
                name: 'Test User',
                email: 'test@example.com',
                age: 25
            });
        });

        it('should remove specified attributes', async () => {
            const key = { id: 'remove-attrs' };
            const record = { id: 'remove-attrs', name: 'User', email: 'user@example.com', age: 30, status: 'active' };

            await repository.putItem(key, record);

            const result = await repository.updateItem(key, { name: 'Updated User' }, ['email', 'age']);

            expect(result).toEqual({
                id: 'remove-attrs',
                name: 'Updated User',
                status: 'active'
            });
            expect(result?.email).toBeUndefined();
            expect(result?.age).toBeUndefined();
        });

        it('should only remove attributes without updating', async () => {
            const key = { id: 'only-remove' };
            const record = { id: 'only-remove', name: 'User', email: 'user@example.com', age: 30 };

            await repository.putItem(key, record);

            // Update with empty object but remove attributes
            const result = await repository.updateItem(key, {}, ['email']);

            expect(result).toEqual({
                id: 'only-remove',
                name: 'User',
                age: 30
            });
            expect(result?.email).toBeUndefined();
        });

        it('should handle undefined values in updates correctly', async () => {
            const key = { id: 'undefined-update' };
            const record = { id: 'undefined-update', name: 'User', email: 'user@example.com' };

            await repository.putItem(key, record);

            // Undefined values should be ignored
            const result = await repository.updateItem(key, { name: 'New Name', age: undefined });

            expect(result).toEqual({
                id: 'undefined-update',
                name: 'New Name',
                email: 'user@example.com'
            });
        });

        it('should update item with attributes containing hyphens', async () => {
            const key = { id: 'hyphen-test' };
            const record = { id: 'hyphen-test', name: 'Test', 'user-status': 'active' } as any;

            await repository.putItem(key, record);

            const result = await repository.updateItem(key, { 'user-status': 'inactive' } as any);

            expect(result).toMatchObject({
                id: 'hyphen-test',
                name: 'Test',
                'user-status': 'inactive'
            });
        });

        it('should handle updates to non-existent items gracefully', async () => {
            const key = { id: 'non-existent-update' };

            // This should create the item with just the updates
            const result = await repository.updateItem(key, { name: 'New Item' });

            expect(result).toMatchObject({
                id: 'non-existent-update',
                name: 'New Item'
            });
        });

        it('should update and remove in the same operation', async () => {
            const key = { id: 'update-and-remove' };
            const record = { id: 'update-and-remove', name: 'User', email: 'old@example.com', age: 25, status: 'active' };

            await repository.putItem(key, record);

            const result = await repository.updateItem(
                key,
                { name: 'Updated User', email: 'new@example.com' },
                ['age']
            );

            expect(result).toEqual({
                id: 'update-and-remove',
                name: 'Updated User',
                email: 'new@example.com',
                status: 'active'
            });
            expect(result?.age).toBeUndefined();
        });

        it('should handle numeric values correctly', async () => {
            const key = { id: 'numeric-update' };
            const record = { id: 'numeric-update', name: 'User', age: 25 };

            await repository.putItem(key, record);

            const result = await repository.updateItem(key, { age: 30 });

            expect(result?.age).toBe(30);
        });

        it('should handle multiple sequential updates', async () => {
            const key = { id: 'sequential-updates' };
            const record = { id: 'sequential-updates', name: 'Initial', age: 20 };

            await repository.putItem(key, record);

            // First update
            await repository.updateItem(key, { name: 'First Update' });

            // Second update
            await repository.updateItem(key, { age: 25 });

            // Third update
            const result = await repository.updateItem(key, { email: 'final@example.com' });

            expect(result).toEqual({
                id: 'sequential-updates',
                name: 'First Update',
                age: 25,
                email: 'final@example.com'
            });
        });

        it('should preserve key attributes during update', async () => {
            const key = { id: 'preserve-key' };
            const record = { id: 'preserve-key', name: 'User' };

            await repository.putItem(key, record);

            const result = await repository.updateItem(key, { name: 'Updated User' });

            expect(result?.id).toBe('preserve-key');
        });
    });

    describe('multiple operations', () => {
        it('should handle multiple items correctly', async () => {
            const items = [
                { id: 'item-1', name: 'Item One' },
                { id: 'item-2', name: 'Item Two' },
                { id: 'item-3', name: 'Item Three' },
            ];

            // Create all items
            for (const item of items) {
                await repository.putItem({ id: item.id }, item);
            }

            // Retrieve all items
            for (const item of items) {
                const result = await repository.getItem({ id: item.id });
                expect(result).toEqual(item);
            }
        });

        it('should handle create, update, and delete lifecycle', async () => {
            const key = { id: 'lifecycle-test' };
            const initialRecord = { id: 'lifecycle-test', name: 'Initial' };
            const updatedRecord = { id: 'lifecycle-test', name: 'Updated', email: 'test@example.com' };

            // Create
            const created = await repository.putItem(key, initialRecord);
            expect(created).toEqual(initialRecord);

            // Update
            const updated = await repository.putItem(key, updatedRecord);
            expect(updated).toEqual(updatedRecord);

            // Verify update persisted
            const retrieved = await repository.getItem(key);
            expect(retrieved).toEqual(updatedRecord);

            // Delete
            await repository.deleteItem(key);

            // Verify deletion
            const afterDelete = await repository.getItem(key);
            expect(afterDelete).toBeUndefined();
        });

        it('should handle full lifecycle with updateItem', async () => {
            const key = { id: 'full-lifecycle' };
            const record = { id: 'full-lifecycle', name: 'Initial', email: 'initial@example.com' };

            // Create
            await repository.putItem(key, record);

            // Update with updateItem
            await repository.updateItem(key, { name: 'Modified' });

            // Verify
            const afterUpdate = await repository.getItem(key);
            expect(afterUpdate).toEqual({
                id: 'full-lifecycle',
                name: 'Modified',
                email: 'initial@example.com'
            });

            // Update again with removal
            await repository.updateItem(key, { age: 25 }, ['email']);

            // Verify
            const afterSecondUpdate = await repository.getItem(key);
            expect(afterSecondUpdate).toEqual({
                id: 'full-lifecycle',
                name: 'Modified',
                age: 25
            });

            // Delete
            await repository.deleteItem(key);

            // Verify deletion
            const afterDelete = await repository.getItem(key);
            expect(afterDelete).toBeUndefined();
        });
    });
});