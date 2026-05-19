import {
    CreateTableCommand,
    DescribeTableCommand,
    DynamoDBClient,
    type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import { GenericContainer, StartedTestContainer } from "testcontainers";
import { JsonPointerRepository } from "../src";

type TestDocument = Record<string, unknown>;

describe("JsonPointerRepository Integration Tests", () => {
    let container: StartedTestContainer;
    let dynamoDBClient: DynamoDBClient;
    let repository: JsonPointerRepository<TestDocument>;

    const tableName = "json-pointer-test-table";

    beforeAll(async () => {
        container = await new GenericContainer("amazon/dynamodb-local")
            .withExposedPorts(8000)
            .start();

        const clientConfig: DynamoDBClientConfig = {
            endpoint: `http://${container.getHost()}:${container.getMappedPort(8000)}`,
            region: "us-east-1",
            credentials: async () => ({ accessKeyId: "test", secretAccessKey: "test" }),
        };
        dynamoDBClient = new (DynamoDBClient as unknown as new (config: DynamoDBClientConfig) => DynamoDBClient)(clientConfig);

        await dynamoDBClient.send(
            new CreateTableCommand({
                TableName: tableName,
                KeySchema: [
                    { AttributeName: "id", KeyType: "HASH" },
                    { AttributeName: "pointer", KeyType: "RANGE" },
                ],
                AttributeDefinitions: [
                    { AttributeName: "id", AttributeType: "S" },
                    { AttributeName: "pointer", AttributeType: "S" },
                ],
                BillingMode: "PAY_PER_REQUEST",
            }),
        );

        let active = false;
        while (!active) {
            const res = await dynamoDBClient.send(new DescribeTableCommand({ TableName: tableName }));
            active = res.Table?.TableStatus === "ACTIVE";
            if (!active) await new Promise(r => setTimeout(r, 100));
        }

        repository = new JsonPointerRepository<TestDocument>({
            client: dynamoDBClient,
            tableName,
        });
    });

    afterAll(async () => {
        dynamoDBClient?.destroy();
        await container?.stop();
    });

    // ─── putDocument / getDocument ───────────────────────────────────────────

    describe("putDocument / getDocument", () => {
        it("returns undefined for a document that has never been stored", async () => {
            const result = await repository.getDocument("does-not-exist");
            expect(result).toBeUndefined();
        });

        it("round-trips a flat document", async () => {
            const doc = { name: "Alice", age: 30, active: true };
            await repository.putDocument("flat-1", doc);
            expect(await repository.getDocument("flat-1")).toEqual(doc);
        });

        it("round-trips a document with a null value", async () => {
            const doc = { name: "Bob", nickname: null };
            await repository.putDocument("null-1", doc);
            expect(await repository.getDocument("null-1")).toEqual(doc);
        });

        it("round-trips a deeply nested document", async () => {
            const doc = {
                user: {
                    profile: {
                        name: "Carol",
                        address: { city: "Melbourne", postcode: "3000" },
                    },
                },
            };
            await repository.putDocument("nested-1", doc);
            expect(await repository.getDocument("nested-1")).toEqual(doc);
        });

        it("round-trips a document containing an array", async () => {
            const doc = { tags: ["alpha", "beta", "gamma"] };
            await repository.putDocument("array-1", doc);
            expect(await repository.getDocument("array-1")).toEqual(doc);
        });

        it("round-trips a document with an array of objects", async () => {
            const doc = {
                items: [
                    { id: 1, label: "first" },
                    { id: 2, label: "second" },
                ],
            };
            await repository.putDocument("array-obj-1", doc);
            expect(await repository.getDocument("array-obj-1")).toEqual(doc);
        });

        it("round-trips a document with keys containing special characters (/ and ~)", async () => {
            const doc = { "a/b": "slash", "c~d": "tilde" };
            await repository.putDocument("special-keys-1", doc);
            expect(await repository.getDocument("special-keys-1")).toEqual(doc);
        });

        it("round-trips a document with number and boolean leaf values", async () => {
            const doc = { count: 42, ratio: 3.14, enabled: false };
            await repository.putDocument("types-1", doc);
            expect(await repository.getDocument("types-1")).toEqual(doc);
        });

        it("overwrites an existing document with new content", async () => {
            await repository.putDocument("overwrite-1", { name: "Old", value: 1 });
            await repository.putDocument("overwrite-1", { name: "New", value: 2 });
            expect(await repository.getDocument("overwrite-1")).toEqual({ name: "New", value: 2 });
        });

        it("deletes stale pointers when a key is removed from the document", async () => {
            await repository.putDocument("stale-1", { keep: "yes", remove: "no" });
            await repository.putDocument("stale-1", { keep: "yes" });
            const result = await repository.getDocument("stale-1");
            expect(result).toEqual({ keep: "yes" });
            expect(result).not.toHaveProperty("remove");
        });

        it("deletes stale pointers when an array shrinks", async () => {
            await repository.putDocument("stale-array-1", { tags: ["a", "b", "c"] });
            await repository.putDocument("stale-array-1", { tags: ["a"] });
            expect(await repository.getDocument("stale-array-1")).toEqual({ tags: ["a"] });
        });

        it("deletes stale pointers when nested keys are removed", async () => {
            await repository.putDocument("stale-nested-1", { a: { x: 1, y: 2 } });
            await repository.putDocument("stale-nested-1", { a: { x: 1 } });
            expect(await repository.getDocument("stale-nested-1")).toEqual({ a: { x: 1 } });
        });

        it("round-trips a document with more than 25 leaf values (tests batchWriteItems chunking)", async () => {
            const doc: Record<string, unknown> = {};
            for (let i = 0; i < 30; i++) {
                doc[`field${i}`] = i;
            }
            await repository.putDocument("large-doc-1", doc as TestDocument);
            expect(await repository.getDocument("large-doc-1")).toEqual(doc);
        });

        it("overwrites a large document and correctly deletes more than 25 stale pointers", async () => {
            const original: Record<string, unknown> = {};
            for (let i = 0; i < 30; i++) {
                original[`field${i}`] = i;
            }
            await repository.putDocument("large-overwrite-1", original as TestDocument);
            await repository.putDocument("large-overwrite-1", { kept: true } as TestDocument);
            expect(await repository.getDocument("large-overwrite-1")).toEqual({ kept: true });
        });

        it("replaces a string value with a number value at the same pointer", async () => {
            await repository.putDocument("type-change-1", { score: 99 });
            expect(await repository.getDocument("type-change-1")).toEqual({ score: 99 });
        });
    });

    // ─── getAttribute ────────────────────────────────────────────────────────

    describe("getAttribute", () => {
        beforeAll(async () => {
            await repository.putDocument("get-attr-doc", {
                name: "Dave",
                address: { city: "Sydney" },
                scores: [10, 20],
            });
        });

        it("returns the value at a top-level pointer", async () => {
            expect(await repository.getAttribute("get-attr-doc", "/name")).toBe("Dave");
        });

        it("returns the value at a nested pointer", async () => {
            expect(await repository.getAttribute("get-attr-doc", "/address/city")).toBe("Sydney");
        });

        it("returns the value at an array index pointer", async () => {
            expect(await repository.getAttribute("get-attr-doc", "/scores/0")).toBe(10);
            expect(await repository.getAttribute("get-attr-doc", "/scores/1")).toBe(20);
        });

        it("returns undefined for a pointer that does not exist", async () => {
            expect(await repository.getAttribute("get-attr-doc", "/nonexistent")).toBeUndefined();
        });

        it("returns undefined for a document that does not exist", async () => {
            expect(await repository.getAttribute("no-such-doc", "/name")).toBeUndefined();
        });
    });

    // ─── putAttribute ────────────────────────────────────────────────────────

    describe("putAttribute", () => {
        it("creates a new attribute on a document", async () => {
            await repository.putDocument("put-attr-1", { existing: "value" });
            await repository.putAttribute("put-attr-1", "/new", "added");
            expect(await repository.getAttribute("put-attr-1", "/new")).toBe("added");
        });

        it("overwrites an existing attribute", async () => {
            await repository.putDocument("put-attr-2", { name: "Before" });
            await repository.putAttribute("put-attr-2", "/name", "After");
            expect(await repository.getAttribute("put-attr-2", "/name")).toBe("After");
        });

        it("creates an attribute on a document that did not previously exist", async () => {
            await repository.putAttribute("brand-new-doc", "/title", "Hello");
            expect(await repository.getAttribute("brand-new-doc", "/title")).toBe("Hello");
        });

        it("stores a number attribute", async () => {
            await repository.putAttribute("put-attr-num", "/count", 42);
            expect(await repository.getAttribute("put-attr-num", "/count")).toBe(42);
        });

        it("stores a boolean attribute", async () => {
            await repository.putAttribute("put-attr-bool", "/active", false);
            expect(await repository.getAttribute("put-attr-bool", "/active")).toBe(false);
        });

        it("stores a null attribute", async () => {
            await repository.putAttribute("put-attr-null", "/empty", null);
            expect(await repository.getAttribute("put-attr-null", "/empty")).toBeNull();
        });
    });

    // ─── deleteAttribute ─────────────────────────────────────────────────────

    describe("deleteAttribute", () => {
        it("removes a specific attribute from a document", async () => {
            await repository.putDocument("del-attr-1", { keep: "yes", remove: "no" });
            await repository.deleteAttribute("del-attr-1", "/remove");
            expect(await repository.getAttribute("del-attr-1", "/remove")).toBeUndefined();
            expect(await repository.getAttribute("del-attr-1", "/keep")).toBe("yes");
        });

        it("does not affect other documents when deleting an attribute", async () => {
            await repository.putDocument("del-attr-2a", { name: "A" });
            await repository.putDocument("del-attr-2b", { name: "B" });
            await repository.deleteAttribute("del-attr-2a", "/name");
            expect(await repository.getAttribute("del-attr-2b", "/name")).toBe("B");
        });

        it("is a no-op for a pointer that does not exist", async () => {
            await repository.putDocument("del-attr-3", { name: "safe" });
            await expect(
                repository.deleteAttribute("del-attr-3", "/nonexistent"),
            ).resolves.not.toThrow();
            expect(await repository.getAttribute("del-attr-3", "/name")).toBe("safe");
        });
    });

    // ─── deleteDocument ──────────────────────────────────────────────────────

    describe("deleteDocument", () => {
        it("removes all pointer items for a document", async () => {
            await repository.putDocument("del-doc-1", { a: 1, b: { c: 2 } });
            await repository.deleteDocument("del-doc-1");
            expect(await repository.getDocument("del-doc-1")).toBeUndefined();
        });

        it("does not affect other documents", async () => {
            await repository.putDocument("del-doc-2a", { name: "keep" });
            await repository.putDocument("del-doc-2b", { name: "delete" });
            await repository.deleteDocument("del-doc-2b");
            expect(await repository.getDocument("del-doc-2a")).toEqual({ name: "keep" });
        });

        it("is a no-op for a document that does not exist", async () => {
            await expect(repository.deleteDocument("no-such-doc-delete")).resolves.not.toThrow();
        });

        it("removes all items including nested and array pointers", async () => {
            await repository.putDocument("del-doc-deep", {
                name: "full",
                tags: ["x", "y"],
                meta: { created: "today" },
            });
            await repository.deleteDocument("del-doc-deep");
            expect(await repository.getDocument("del-doc-deep")).toBeUndefined();
        });

        it("deletes a document with more than 25 leaf values (tests batchWriteItems chunking)", async () => {
            const doc: Record<string, unknown> = {};
            for (let i = 0; i < 30; i++) {
                doc[`field${i}`] = i;
            }
            await repository.putDocument("large-del-doc-1", doc as TestDocument);
            await repository.deleteDocument("large-del-doc-1");
            expect(await repository.getDocument("large-del-doc-1")).toBeUndefined();
        });
    });

    // ─── patchDocument ───────────────────────────────────────────────────────

    describe("patchDocument", () => {
        it("updates an existing pointer value", async () => {
            await repository.putDocument("patch-1", { name: "Alice", age: 30 });
            await repository.patchDocument("patch-1", { "/name": "Bob" });
            expect(await repository.getDocument("patch-1")).toEqual({ name: "Bob", age: 30 });
        });

        it("adds a new pointer to an existing document", async () => {
            await repository.putDocument("patch-2", { a: 1 });
            await repository.patchDocument("patch-2", { "/b": 2 });
            expect(await repository.getDocument("patch-2")).toEqual({ a: 1, b: 2 });
        });

        it("deletes a pointer when value is undefined", async () => {
            await repository.putDocument("patch-3", { keep: "yes", drop: "no" });
            await repository.patchDocument("patch-3", { "/drop": undefined });
            expect(await repository.getDocument("patch-3")).toEqual({ keep: "yes" });
        });

        it("handles mixed puts and deletes in one call", async () => {
            await repository.putDocument("patch-4", { a: 1, b: 2, c: 3 });
            await repository.patchDocument("patch-4", { "/a": 10, "/b": undefined, "/d": 4 });
            expect(await repository.getDocument("patch-4")).toEqual({ a: 10, c: 3, d: 4 });
        });

        it("is a no-op when updates is empty", async () => {
            await repository.putDocument("patch-5", { x: "original" });
            await repository.patchDocument("patch-5", {});
            expect(await repository.getDocument("patch-5")).toEqual({ x: "original" });
        });

        it("patches a nested pointer", async () => {
            await repository.putDocument("patch-6", { user: { name: "Alice", age: 30 } });
            await repository.patchDocument("patch-6", { "/user/name": "Carol" });
            expect(await repository.getDocument("patch-6")).toEqual({ user: { name: "Carol", age: 30 } });
        });

        it("patches a null value", async () => {
            await repository.putDocument("patch-7", { status: "active" });
            await repository.patchDocument("patch-7", { "/status": null });
            expect(await repository.getDocument("patch-7")).toEqual({ status: null });
        });

        it("throws TypeError for a pointer not starting with '/'", async () => {
            await repository.putDocument("patch-8", { a: 1 });
            await expect(repository.patchDocument("patch-8", { "name": "value" })).rejects.toThrow(
                'Invalid JSON Pointer "name"',
            );
        });
    });

    // ─── validation ──────────────────────────────────────────────────────────

    describe("validation", () => {
        it("throws TypeError for an unsupported leaf type (function)", async () => {
            const doc = { fn: () => "oops" } as unknown as TestDocument;
            await expect(repository.putDocument("invalid-type", doc)).rejects.toThrow(TypeError);
        });

        it("throws TypeError for an unsupported leaf type (bigint)", async () => {
            const doc = { n: BigInt(42) } as unknown as TestDocument;
            await expect(repository.putDocument("invalid-bigint", doc)).rejects.toThrow(TypeError);
        });

        it("throws TypeError when storing an empty document", async () => {
            await expect(repository.putDocument("empty-doc", {} as TestDocument)).rejects.toThrow(
                "Cannot store a document with no leaf values",
            );
        });

        it("throws TypeError when storing a document with only empty containers", async () => {
            const doc = { nested: {} } as TestDocument;
            await expect(repository.putDocument("empty-nested", doc)).rejects.toThrow(
                "Cannot store a document with no leaf values",
            );
        });

        it("throws TypeError for getAttribute with a pointer not starting with '/'", async () => {
            await expect(repository.getAttribute("any-doc", "name")).rejects.toThrow(
                'Invalid JSON Pointer "name"',
            );
        });

        it("throws TypeError for putAttribute with a pointer not starting with '/'", async () => {
            await expect(repository.putAttribute("any-doc", "name", "value")).rejects.toThrow(
                'Invalid JSON Pointer "name"',
            );
        });

        it("throws TypeError for deleteAttribute with a pointer not starting with '/'", async () => {
            await expect(repository.deleteAttribute("any-doc", "name")).rejects.toThrow(
                'Invalid JSON Pointer "name"',
            );
        });

        it("throws TypeError on getDocument when conflicting pointers are present", async () => {
            await repository.putAttribute("conflict-doc", "/a", "leaf");
            await repository.putAttribute("conflict-doc", "/a/b", "nested");
            await expect(repository.getDocument("conflict-doc")).rejects.toThrow(
                "Conflicting pointers",
            );
        });
    });

    // ─── cross-method consistency ────────────────────────────────────────────

    describe("cross-method consistency", () => {
        it("getDocument reflects an attribute added via putAttribute", async () => {
            await repository.putDocument("cross-1", { a: "original" });
            await repository.putAttribute("cross-1", "/b", "added");
            expect(await repository.getDocument("cross-1")).toEqual({ a: "original", b: "added" });
        });

        it("getDocument reflects an attribute updated via putAttribute", async () => {
            await repository.putDocument("cross-2", { x: "before" });
            await repository.putAttribute("cross-2", "/x", "after");
            expect(await repository.getDocument("cross-2")).toEqual({ x: "after" });
        });

        it("getDocument reflects an attribute removed via deleteAttribute", async () => {
            await repository.putDocument("cross-3", { keep: "yes", drop: "no" });
            await repository.deleteAttribute("cross-3", "/drop");
            expect(await repository.getDocument("cross-3")).toEqual({ keep: "yes" });
        });

        it("second putDocument cleans up attributes added via putAttribute", async () => {
            await repository.putDocument("cross-4", { a: 1 });
            await repository.putAttribute("cross-4", "/b", 2);
            await repository.putDocument("cross-4", { a: 10 });
            expect(await repository.getDocument("cross-4")).toEqual({ a: 10 });
        });

        it("putDocument after deleteDocument stores fresh document with no stale pointers", async () => {
            await repository.putDocument("cross-5", { x: 1, y: 2 });
            await repository.deleteDocument("cross-5");
            await repository.putDocument("cross-5", { z: 3 });
            expect(await repository.getDocument("cross-5")).toEqual({ z: 3 });
        });
    });

    // ─── listDocumentIds ─────────────────────────────────────────────────────

    describe("listDocumentIds", () => {
        it("returns an empty array when there are no documents", async () => {
            const emptyTable = "json-pointer-empty-for-scan";
            await dynamoDBClient.send(
                new CreateTableCommand({
                    TableName: emptyTable,
                    KeySchema: [
                        { AttributeName: "id", KeyType: "HASH" },
                        { AttributeName: "pointer", KeyType: "RANGE" },
                    ],
                    AttributeDefinitions: [
                        { AttributeName: "id", AttributeType: "S" },
                        { AttributeName: "pointer", AttributeType: "S" },
                    ],
                    BillingMode: "PAY_PER_REQUEST",
                }),
            );
            let active = false;
            while (!active) {
                const res = await dynamoDBClient.send(new DescribeTableCommand({ TableName: emptyTable }));
                active = res.Table?.TableStatus === "ACTIVE";
                if (!active) await new Promise(r => setTimeout(r, 100));
            }
            const emptyRepo = new JsonPointerRepository<TestDocument>({
                client: dynamoDBClient,
                tableName: emptyTable,
            });
            expect(await emptyRepo.listDocumentIds()).toEqual([]);
        });

        it("returns unique document IDs for all stored documents", async () => {
            const scanTable = "json-pointer-scan-table";
            await dynamoDBClient.send(
                new CreateTableCommand({
                    TableName: scanTable,
                    KeySchema: [
                        { AttributeName: "id", KeyType: "HASH" },
                        { AttributeName: "pointer", KeyType: "RANGE" },
                    ],
                    AttributeDefinitions: [
                        { AttributeName: "id", AttributeType: "S" },
                        { AttributeName: "pointer", AttributeType: "S" },
                    ],
                    BillingMode: "PAY_PER_REQUEST",
                }),
            );
            let active = false;
            while (!active) {
                const res = await dynamoDBClient.send(new DescribeTableCommand({ TableName: scanTable }));
                active = res.Table?.TableStatus === "ACTIVE";
                if (!active) await new Promise(r => setTimeout(r, 100));
            }
            const scanRepo = new JsonPointerRepository<TestDocument>({
                client: dynamoDBClient,
                tableName: scanTable,
            });
            await scanRepo.putDocument("doc-a", { name: "Alpha", count: 1 });
            await scanRepo.putDocument("doc-b", { name: "Beta", count: 2 });
            await scanRepo.putDocument("doc-c", { name: "Gamma", count: 3 });

            const ids = await scanRepo.listDocumentIds();
            expect(ids.sort()).toEqual(["doc-a", "doc-b", "doc-c"]);
        });

        it("does not return IDs for deleted documents", async () => {
            const scanTable2 = "json-pointer-scan-table-2";
            await dynamoDBClient.send(
                new CreateTableCommand({
                    TableName: scanTable2,
                    KeySchema: [
                        { AttributeName: "id", KeyType: "HASH" },
                        { AttributeName: "pointer", KeyType: "RANGE" },
                    ],
                    AttributeDefinitions: [
                        { AttributeName: "id", AttributeType: "S" },
                        { AttributeName: "pointer", AttributeType: "S" },
                    ],
                    BillingMode: "PAY_PER_REQUEST",
                }),
            );
            let active = false;
            while (!active) {
                const res = await dynamoDBClient.send(new DescribeTableCommand({ TableName: scanTable2 }));
                active = res.Table?.TableStatus === "ACTIVE";
                if (!active) await new Promise(r => setTimeout(r, 100));
            }
            const scanRepo2 = new JsonPointerRepository<TestDocument>({
                client: dynamoDBClient,
                tableName: scanTable2,
            });
            await scanRepo2.putDocument("keep-1", { x: 1 });
            await scanRepo2.putDocument("delete-1", { x: 2 });
            await scanRepo2.deleteDocument("delete-1");

            const ids = await scanRepo2.listDocumentIds();
            expect(ids).toEqual(["keep-1"]);
        });
    });

    // ─── custom key names ────────────────────────────────────────────────────

    describe("custom key names", () => {
        let customRepo: JsonPointerRepository<TestDocument>;
        const customTable = "json-pointer-custom-table";

        beforeAll(async () => {
            await dynamoDBClient.send(
                new CreateTableCommand({
                    TableName: customTable,
                    KeySchema: [
                        { AttributeName: "docId", KeyType: "HASH" },
                        { AttributeName: "path", KeyType: "RANGE" },
                    ],
                    AttributeDefinitions: [
                        { AttributeName: "docId", AttributeType: "S" },
                        { AttributeName: "path", AttributeType: "S" },
                    ],
                    BillingMode: "PAY_PER_REQUEST",
                }),
            );

            let active = false;
            while (!active) {
                const res = await dynamoDBClient.send(
                    new DescribeTableCommand({ TableName: customTable }),
                );
                active = res.Table?.TableStatus === "ACTIVE";
                if (!active) await new Promise(r => setTimeout(r, 100));
            }

            customRepo = new JsonPointerRepository<TestDocument>({
                client: dynamoDBClient,
                tableName: customTable,
                idKey: "docId",
                pointerKey: "path",
                valueKey: "data",
            });
        });

        it("stores and retrieves documents using custom key attribute names", async () => {
            const doc = { title: "Custom", count: 7 };
            await customRepo.putDocument("custom-doc-1", doc);
            expect(await customRepo.getDocument("custom-doc-1")).toEqual(doc);
        });

        it("getAttribute works with custom key names", async () => {
            await customRepo.putDocument("custom-doc-2", { x: 99 });
            expect(await customRepo.getAttribute("custom-doc-2", "/x")).toBe(99);
        });

        it("deleteDocument works with custom key names", async () => {
            await customRepo.putDocument("custom-doc-3", { y: "bye" });
            await customRepo.deleteDocument("custom-doc-3");
            expect(await customRepo.getDocument("custom-doc-3")).toBeUndefined();
        });
    });
});
