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

const escapeToken = (token: string): string =>
    token.replace(/~/g, "~0").replace(/\//g, "~1");

const unescapeToken = (token: string): string =>
    token.replace(/~1/g, "/").replace(/~0/g, "~");

const flattenDocument = (doc: unknown, prefix = ""): Record<string, JsonPointerValue> => {
    if (doc === null) return { [prefix]: null };
    if (typeof doc !== "object") return { [prefix]: doc as JsonPointerValue };

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

        const existing = await this.repository.getItems({ [this.idKey]: id }) ?? [];
        const existingPointers = existing.map(item => item[this.pointerKey] as string);
        const stalePointers = existingPointers.filter(p => !newPointers.includes(p));

        await Promise.all([
            ...stalePointers.map(pointer =>
                this.repository.deleteItem({
                    [this.idKey]: id,
                    [this.pointerKey]: pointer,
                } as PointerKey),
            ),
            ...Object.entries(flat).map(([pointer, value]) =>
                this.repository.putItem(
                    { [this.idKey]: id, [this.pointerKey]: pointer } as PointerKey,
                    { [this.idKey]: id, [this.pointerKey]: pointer, [this.valueKey]: value } as PointerItem,
                ),
            ),
        ]);
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
        const key = { [this.idKey]: id, [this.pointerKey]: pointer } as PointerKey;
        await this.repository.putItem(key, { ...key, [this.valueKey]: value } as PointerItem);
    };

    deleteAttribute = async (id: string, pointer: string): Promise<void> => {
        await this.repository.deleteItem({
            [this.idKey]: id,
            [this.pointerKey]: pointer,
        } as PointerKey);
    };

    deleteDocument = async (id: string): Promise<void> => {
        const items = await this.repository.getItems({ [this.idKey]: id }) ?? [];
        await Promise.all(
            items.map(item =>
                this.repository.deleteItem({
                    [this.idKey]: id,
                    [this.pointerKey]: item[this.pointerKey] as string,
                } as PointerKey),
            ),
        );
    };
}
