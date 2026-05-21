import { DynamoDBClient, ReturnConsumedCapacity } from "@aws-sdk/client-dynamodb";
import { DynamoDbRepository } from "./DynamoDbRepository";

export type JsonPointerValue = string | number | boolean | null;

export interface JsonPointerRepositoryOptions {
    client: DynamoDBClient;
    tableName: string;
    idKey?: string;
    pointerKey?: string;
    valueKey?: string;
    returnConsumedCapacity?: ReturnConsumedCapacity;
}

type PointerKey = Record<string, string>;
type PointerItem = Record<string, unknown>;

const isJsonPointerValue = (value: unknown): value is JsonPointerValue =>
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";

const escapeToken = (token: string): string =>
    token.replace(/~/g, "~0").replace(/\//g, "~1");

const unescapeToken = (token: string): string =>
    token.replace(/~1/g, "/").replace(/~0/g, "~");

const validatePointer = (pointer: string): void => {
    if (!pointer.startsWith("/")) {
        throw new TypeError(`Invalid JSON Pointer "${pointer}": must start with "/".`);
    }
};

const flattenDocument = (doc: unknown, prefix = ""): Record<string, JsonPointerValue> => {
    if (doc === null) return { [prefix]: null };
    if (typeof doc !== "object") {
        if (isJsonPointerValue(doc)) {
            return { [prefix]: doc };
        }
        const pointer = prefix === "" ? "/" : prefix;
        throw new TypeError(
            `Unsupported value at JSON pointer "${pointer}": expected string, number, boolean, or null but received ${typeof doc}.`,
        );
    }

    const result: Record<string, JsonPointerValue> = {};

    if (Array.isArray(doc)) {
        for (let i = 0; i < doc.length; i++) {
            Object.assign(result, flattenDocument(doc[i], `${prefix}/${i}`));
        }
    } else {
        for (const [key, value] of Object.entries(doc)) {
            Object.assign(result, flattenDocument(value, `${prefix}/${escapeToken(key)}`));
        }
    }

    return result;
};

const setAtPointer = (
    root: Record<string, unknown>,
    pointer: string,
    value: JsonPointerValue,
): void => {
    const tokens = pointer.split("/").slice(1).map(unescapeToken);
    if (tokens.length === 0) return;

    let current: Record<string, unknown> = root;
    for (let i = 0; i < tokens.length - 1; i++) {
        const token = tokens[i];
        const nextToken = tokens[i + 1];
        if (current[token] == null) {
            current[token] = /^\d+$/.test(nextToken) ? [] : {};
        } else if (typeof current[token] !== "object") {
            throw new TypeError(
                `Conflicting pointers: cannot traverse "${pointer}" because "/${tokens.slice(0, i + 1).join("/")}" already holds a primitive value.`,
            );
        }
        current = current[token] as Record<string, unknown>;
    }

    const lastToken = tokens[tokens.length - 1];
    current[lastToken] = value;
};

const reconstructDocument = <T>(
    items: Array<{ pointer: string; value: JsonPointerValue }>,
): T => {
    const root: Record<string, unknown> = {};
    const sorted = [...items].sort((a, b) => a.pointer.localeCompare(b.pointer));
    for (const item of sorted) {
        setAtPointer(root, item.pointer, item.value);
    }
    return root as T;
};

/**
 * Stores JSON documents as individual per-pointer DynamoDB items addressed by JSON Pointer (RFC 6901).
 *
 * Only JSON objects are supported as the root document (`T extends Record<string, unknown>`).
 * Root arrays and primitives are not supported. Documents must contain at least one leaf value;
 * empty objects and empty arrays are not supported.
 */
export class JsonPointerRepository<T extends Record<string, unknown>> {
    private readonly repository: DynamoDbRepository<PointerKey, PointerItem>;
    private readonly idKey: string;
    private readonly pointerKey: string;
    private readonly valueKey: string;

    constructor(options: JsonPointerRepositoryOptions) {
        const {
            client,
            tableName,
            idKey = "id",
            pointerKey = "pointer",
            valueKey = "value",
            returnConsumedCapacity,
        } = options;

        this.idKey = idKey;
        this.pointerKey = pointerKey;
        this.valueKey = valueKey;

        this.repository = new DynamoDbRepository<PointerKey, PointerItem>({
            client,
            tableName,
            hashKey: idKey,
            rangeKey: pointerKey,
            returnConsumedCapacity,
        });
    }

    putDocument = async (id: string, document: T): Promise<void> => {
        const flat = flattenDocument(document);
        const newPointers = Object.keys(flat);

        if (newPointers.length === 0) {
            throw new TypeError(
                "Cannot store a document with no leaf values. Empty objects and arrays are not supported.",
            );
        }

        const newPointerSet = new Set(newPointers);
        const existing = await this.repository.getItems({ [this.idKey]: id });
        const existingPointers = existing.map(item => item[this.pointerKey] as string);
        const stalePointers = existingPointers.filter(p => !newPointerSet.has(p));

        const puts = Object.entries(flat).map(([pointer, value]) => {
            const key = { [this.idKey]: id, [this.pointerKey]: pointer } as PointerKey;
            return { key, item: { ...key, [this.valueKey]: value } as PointerItem };
        });
        const deleteKeys = stalePointers.map(
            pointer => ({ [this.idKey]: id, [this.pointerKey]: pointer } as PointerKey),
        );
        await this.repository.batchWriteItems(puts, deleteKeys);
    };

    getDocument = async (id: string): Promise<T | undefined> => {
        const items = await this.repository.getItems({ [this.idKey]: id });
        if (!items || items.length === 0) return undefined;

        return reconstructDocument<T>(
            items.map(item => ({
                pointer: item[this.pointerKey] as string,
                value: item[this.valueKey] as JsonPointerValue,
            })),
        );
    };

    getAttribute = async <V = JsonPointerValue>(
        id: string,
        pointer: string,
    ): Promise<V | undefined> => {
        validatePointer(pointer);
        const item = await this.repository.getItem({
            [this.idKey]: id,
            [this.pointerKey]: pointer,
        } as PointerKey);
        return item ? (item[this.valueKey] as V) : undefined;
    };

    putAttribute = async (
        id: string,
        pointer: string,
        value: JsonPointerValue,
    ): Promise<void> => {
        validatePointer(pointer);
        const key = { [this.idKey]: id, [this.pointerKey]: pointer } as PointerKey;
        await this.repository.putItem(key, { ...key, [this.valueKey]: value } as PointerItem);
    };

    deleteAttribute = async (id: string, pointer: string): Promise<void> => {
        validatePointer(pointer);
        await this.repository.deleteItem({
            [this.idKey]: id,
            [this.pointerKey]: pointer,
        } as PointerKey);
    };

    deleteDocument = async (id: string): Promise<void> => {
        const items = await this.repository.getItems({ [this.idKey]: id });
        if (items.length === 0) return;
        const deleteKeys = items.map(
            item => ({ [this.idKey]: id, [this.pointerKey]: item[this.pointerKey] as string } as PointerKey),
        );
        await this.repository.batchWriteItems([], deleteKeys);
    };

    listDocumentIds = async (): Promise<string[]> => {
        const items = await this.repository.scan({ projectedAttributes: [this.idKey] });
        const seen = new Set<string>();
        for (const item of items) {
            seen.add(item[this.idKey] as string);
        }
        return [...seen];
    };

    patchDocument = async (
        id: string,
        updates: Record<string, JsonPointerValue | undefined>,
    ): Promise<void> => {
        const entries = Object.entries(updates);
        if (entries.length === 0) return;
        entries.forEach(([pointer]) => validatePointer(pointer));
        const puts = entries
            .filter((entry): entry is [string, JsonPointerValue] => entry[1] !== undefined)
            .map(([pointer, value]) => {
                const key = { [this.idKey]: id, [this.pointerKey]: pointer } as PointerKey;
                return { key, item: { ...key, [this.valueKey]: value } as PointerItem };
            });
        const deleteKeys = entries
            .filter(([, value]) => value === undefined)
            .map(([pointer]) => ({ [this.idKey]: id, [this.pointerKey]: pointer } as PointerKey));
        await this.repository.batchWriteItems(puts, deleteKeys);
    };
}
