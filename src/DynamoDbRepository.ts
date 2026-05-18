import {
    BatchGetItemCommand,
    BatchGetItemCommandInput,
    DeleteItemCommand,
    DynamoDBClient,
    GetItemCommand,
    paginateQuery,
    PutItemCommand,
    QueryCommandInput,
    ReturnConsumedCapacity,
    ReturnValue,
    UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {marshall, unmarshall, NativeAttributeValue} from "@aws-sdk/util-dynamodb";
import {replace, uniqWith, isEqual, pickBy} from "lodash";

export enum FilterOperator {
    EQUALS = "=",
    NOT_EQUALS = "<>",
    GREATER_THAN_OR_EQUALS = ">=",
    GREATER_THAN = ">",
    LESS_THAN = "<",
    LESS_THAN_OR_EQUALS = "<=",
    IN = "IN",
    BETWEEN = "BETWEEN",
    BEGINS_WITH = "BEGINS_WITH",
    CONTAINS = "CONTAINS",
}

export interface FilterExpression {
    attribute: string;
    value:
        | string
        | number
        | boolean
        | Array<string | number>
        | [string, string]
        | [number, number];
    operator: FilterOperator;
    negate?: boolean;
}

export interface FilterableQuery {
    filterExpressions: Array<FilterExpression>;
}

export interface ProjectedQuery {
    projectedAttributes: string[];
}

export interface IndexedQuery {
    index: string;
}

export interface Query extends Partial<FilterableQuery>, Partial<ProjectedQuery>, Partial<IndexedQuery> {
    [key: string]: unknown;
    filterExpressions?: Array<FilterExpression>;
    projectedAttributes?: string[];
    index?: string;
    sortOrder?: "ASC" | "DESC";
    limit?: number
}

const marshallKey = (key: unknown) =>
    marshall(key as Record<string, NativeAttributeValue>, {removeUndefinedValues: true});

const expressionAttributeKey = (key: string) => replace(key, /-/g, "_");

const mapInKeys = (filterExpression: FilterExpression) =>
    Array.isArray(filterExpression.value)
        ? filterExpression.value.map(
            (_, index) => `:${expressionAttributeKey(filterExpression.attribute)}${index}`,
        )
        : `:${expressionAttributeKey(filterExpression.attribute)}`;

const mapFilterExpression = (filterExpression: FilterExpression) => {
    switch (filterExpression.operator) {
        case FilterOperator.IN:
            return (
                `#${expressionAttributeKey(filterExpression.attribute)} ${filterExpression.operator} ` +
                `(${mapInKeys(filterExpression)})`
            );
        case FilterOperator.BETWEEN:
            return (
                `#${expressionAttributeKey(filterExpression.attribute)} ${filterExpression.operator} ` +
                `:${expressionAttributeKey(filterExpression.attribute)}0 AND :${expressionAttributeKey(filterExpression.attribute)}1`
            );
        case FilterOperator.BEGINS_WITH:
        case FilterOperator.CONTAINS:
            return (
                `${filterExpression.operator}(#${expressionAttributeKey(filterExpression.attribute)}, ` +
                `:${expressionAttributeKey(filterExpression.attribute)})`
            );
        default:
            return (
                `#${expressionAttributeKey(filterExpression.attribute)} ${filterExpression.operator} ` +
                `:${expressionAttributeKey(filterExpression.attribute)}`
            );
    }
};

const mapFilterExpressions = (
    filterExpressions: Array<FilterExpression>,
) =>
    filterExpressions
        .map((filterExpression) =>
            filterExpression.negate
                ? `NOT ${mapFilterExpression(filterExpression)}`
                : mapFilterExpression(filterExpression),
        )
        .join(" AND ");

const mapFilterExpressionValues = (
    filterExpression: FilterExpression,
): Record<string, string | number | boolean> =>
    Array.isArray(filterExpression.value)
        ? filterExpression.value.reduce(
            (reduction, value, index) => ({
                ...reduction,
                [`:${expressionAttributeKey(filterExpression.attribute)}${index}`]: value,
            }),
            Object.assign({}),
        )
        : {
            [`:${expressionAttributeKey(filterExpression.attribute)}`]:
            filterExpression.value,
        };

const paginate = <T>(array: Array<T>, pageSize: number) => {
    return array.reduce((acc, val, i) => {
        const idx = Math.floor(i / pageSize)
        const page = acc[idx] || (acc[idx] = [])
        page.push(val)
        return acc
    }, [] as Array<Array<T>>);
}

export interface DynamoDbRepositoryOptions {
    client: DynamoDBClient;
    tableName: string;
    hashKey: string;
    rangeKey?: string;
    returnConsumedCapacity?: ReturnConsumedCapacity;
}

export class DynamoDbRepository<K, T> {
    private readonly dynamoDBClient: DynamoDBClient;
    private readonly tableName: string;
    private readonly hashKey: string;
    private readonly rangKey?: string;
    private readonly returnConsumedCapacity: ReturnConsumedCapacity | undefined;

    constructor(options: DynamoDbRepositoryOptions) {
        this.dynamoDBClient = options.client;
        this.tableName = options.tableName;
        this.hashKey = options.hashKey;
        this.rangKey = options.rangeKey;
        this.returnConsumedCapacity = options.returnConsumedCapacity ?? ReturnConsumedCapacity.TOTAL;
    }

    getItem = async (key: K): Promise<T | undefined> => {
        return this.dynamoDBClient
            .send(
                new GetItemCommand({
                    TableName: this.tableName,
                    Key: marshallKey(key),
                    ReturnConsumedCapacity: this.returnConsumedCapacity,
                }),
            )
            .then((result) =>
                result.Item ? unmarshall(result.Item) as T : undefined,
            )
    };

    putItem = async (key: K, record: T): Promise<T> => {
        const Item = marshall({...record, ...key} as Record<string, NativeAttributeValue>, {removeUndefinedValues: true});
        return this.dynamoDBClient
            .send(
                new PutItemCommand({
                    TableName: this.tableName,
                    ReturnConsumedCapacity: this.returnConsumedCapacity,
                    Item,
                }),
            )
            .then(() => unmarshall(Item) as T);
    };

    deleteItem = async (key: K): Promise<T | undefined> => {
        return this.dynamoDBClient.send(new DeleteItemCommand({
            TableName: this.tableName,
            Key: marshallKey(key),
            ReturnValues: ReturnValue.ALL_OLD,
            ReturnConsumedCapacity: this.returnConsumedCapacity,
        })).then((result) => result.Attributes ?
            unmarshall(result.Attributes) as T : undefined);
    };


    updateItem = async (
        key: K,
        updates: Partial<T>,
        remove?: string[],
    ): Promise<T | undefined> => {
        const filteredUpdateEntries = Object.entries(updates).filter(([, value]) => value !== undefined);
        const hasUpdates = filteredUpdateEntries.length > 0;
        if (!hasUpdates && !remove?.length) {
            return this.getItem(key);
        }
        const setAttributesExpression = hasUpdates ? `SET ${filteredUpdateEntries
            .map(
                ([key]) =>
                    `#${expressionAttributeKey(key)} = :${expressionAttributeKey(key)}`,
            )
            .join(", ")}` : '';
        const removeAttributesExpression = remove?.length
            ? ` REMOVE ${remove.map((key) => `#${expressionAttributeKey(key)}`).join(", ")}`
            : "";
        const removeAttributeNames = remove?.length
            ? remove.reduce(
                (acc, key) => ({
                    ...acc,
                    [`#${expressionAttributeKey(key)}`]: key,
                }),
                {} as Record<string, string>,
            )
            : {};
        const updateItemCommandInput = {
            TableName: this.tableName,
            Key: marshallKey(key),
            UpdateExpression: `${setAttributesExpression}${removeAttributesExpression}`,
            ExpressionAttributeNames: filteredUpdateEntries
                .reduce(
                    (acc, [key]) => ({
                        ...acc,
                        [`#${expressionAttributeKey(key)}`]: key,
                    }),
                    Object.assign(
                        removeAttributeNames,
                    ),
                ) as Record<string, string>,
            ExpressionAttributeValues: hasUpdates ? marshall(
                filteredUpdateEntries.reduce(
                    (acc, [key, value]) => ({
                        ...acc,
                        [`:${expressionAttributeKey(key)}`]: value,
                    }),
                    {} as Record<string, NativeAttributeValue>,
                ),
                {removeUndefinedValues: true},
            ) : undefined,
            ReturnConsumedCapacity: this.returnConsumedCapacity,
        };
        return this.dynamoDBClient
            .send(new UpdateItemCommand({...updateItemCommandInput, ReturnValues: 'ALL_NEW'}))
            .then((result) => result.Attributes ? unmarshall(result.Attributes) as T : undefined);
    };


    getItems = async (
        query: Query
    ): Promise<Array<T> | undefined> => {
        const {index, filterExpressions, projectedAttributes, limit, sortOrder,...keys} = query;
        const KeyConditionExpression = Object.keys(keys)
            .map((key) => `#${expressionAttributeKey(key)} = :${expressionAttributeKey(key)}`).join(' AND ');
        const keyExpressionAttributeNames = Object.keys(keys)
            .reduce((acc, key) => ({...acc, [`#${expressionAttributeKey(key)}`]: key}), Object.assign({}));
        const keyExpressionAttributeValues = Object.entries(keys)
            .reduce((acc, [key, value]) => ({...acc, [`:${expressionAttributeKey(key)}`]: value}), Object.assign({}));

        const gsiKeyAttributes = index
            ? [this.hashKey, ...(this.rangKey ? [this.rangKey] : [])]
            : [];

        const ProjectionExpression = index
            ? gsiKeyAttributes.map((attr) => `#${expressionAttributeKey(attr)}`).join(',')
            : (projectedAttributes
                ? projectedAttributes.map((attribute) => `#${expressionAttributeKey(attribute)}`).join(',')
                : undefined);

        const projectionAttributeNames: Record<string, string> = index
            ? gsiKeyAttributes.reduce(
                (acc: Record<string, string>, attr: string) => ({
                    ...acc,
                    [`#${expressionAttributeKey(attr)}`]: attr,
                }),
                {},
            )
            : (projectedAttributes ? projectedAttributes.reduce(
                (
                    reduction: Record<string, string>,
                    attribute: string,
                ) => ({
                    ...reduction,
                    [`#${expressionAttributeKey(attribute)}`]:
                    attribute,
                }),
                Object.assign({}),
            ) : {})
        const hasFilterExpressions = Array.isArray(filterExpressions) && filterExpressions.length > 0;
        const FilterExpression = hasFilterExpressions
            ? mapFilterExpressions(filterExpressions!)
            : undefined;
        const filterAttributeNames: Record<string, string> = hasFilterExpressions
            ? filterExpressions!.reduce(
                (
                    reduction: Record<string, string>,
                    filterExpression: FilterExpression,
                ) => ({
                    ...reduction,
                    [`#${expressionAttributeKey(filterExpression.attribute)}`]:
                    filterExpression.attribute,
                }),
                Object.assign({}),
            )
            : {};
        const filterAttributeValues = filterExpressions
            ? filterExpressions.reduce(
                (reduction, filterExpression) => ({
                    ...reduction,
                    ...mapFilterExpressionValues(filterExpression),
                }),
                Object.assign({}),
            )
            : {};

        const Limit = limit;
        const ScanIndexForward = sortOrder === "DESC" ? false : undefined;
        const queryCommandInput: QueryCommandInput = {
            TableName: this.tableName,
            ReturnConsumedCapacity: this.returnConsumedCapacity,
            IndexName: index,
            KeyConditionExpression,
            FilterExpression,
            ProjectionExpression,
            ExpressionAttributeNames: {
                ...keyExpressionAttributeNames,
                ...filterAttributeNames,
                ...projectionAttributeNames
            },
            ExpressionAttributeValues: marshall(
                {...keyExpressionAttributeValues, ...filterAttributeValues} as Record<string, NativeAttributeValue>,
                {removeUndefinedValues: true},
            ),
            Limit,
            ScanIndexForward
        };
        const paginator = paginateQuery(
            {client: this.dynamoDBClient, pageSize: 100},
            queryCommandInput,
        );

        if (index) {
            const collectedKeys: Array<K> = [];
            for await (const page of paginator) {
                if (page.Items) {
                    collectedKeys.push(
                        ...(page.Items.map((item) => unmarshall(item) as T)
                            .map((item: T) =>
                                pickBy(item as object, (_, key) => (key === this.hashKey || key === this.rangKey)) as K)),
                    )
                }
                if (limit && collectedKeys.length >= limit) break;
            }
            const keysBatch = limit ? collectedKeys.slice(0, limit) : collectedKeys;
            const keyAttrs = [this.hashKey, ...(this.rangKey ? [this.rangKey] : [])];
            const batchProjectedQuery = projectedAttributes
                ? { ...query, projectedAttributes: [...new Set([...projectedAttributes, ...keyAttrs])] } as ProjectedQuery
                : query as ProjectedQuery;
            const items = await this.batchGetItems(keysBatch, batchProjectedQuery);
            const orderedItems = keysBatch.flatMap((key) => {
                const k = key as Record<string, unknown>;
                const match = (items as Array<T | undefined>).find((item) => {
                    if (!item) return false;
                    const t = item as Record<string, unknown>;
                    return t[this.hashKey] === k[this.hashKey] &&
                        (!this.rangKey || t[this.rangKey] === k[this.rangKey]);
                });
                return match ? [match] : [];
            });
            if (projectedAttributes) {
                const projSet = new Set(projectedAttributes);
                return orderedItems.map(item =>
                    pickBy(item as object, (_, key) => projSet.has(key)) as T
                ) as Array<T>;
            }
            return orderedItems as Array<T>;
        }

        const items: Array<T> = [];
        for await (const page of paginator) {
            if (page.Items) {
                items.push(
                    ...(page.Items?.map((item) => unmarshall(item) as T) || []),
                )
            }
            if (limit && items.length >= limit) break;
        }
        return limit ? items.slice(0, limit) : items;
    };


    batchGetItems = async (
        keys: K[], projectedQuery?: ProjectedQuery
    ): Promise<Array<T | undefined>> => {
        const uniqueKeys = uniqWith(keys, isEqual);
        const keyPages = paginate(uniqueKeys, 100);
        const {projectedAttributes} = projectedQuery || {};
        const ProjectionExpression = projectedAttributes
            ? projectedAttributes.map((attribute) => `#${expressionAttributeKey(attribute)}`).join(',')
            : undefined;
        const ExpressionAttributeNames = projectedAttributes ?
            projectedAttributes.reduce(
            (
                reduction: Record<string, string>,
                attribute: string,
            ) => ({
                ...reduction,
                [`#${expressionAttributeKey(attribute)}`]:
                attribute,
            }),
            Object.assign({}),
        ) : undefined;
        return Promise.all((keyPages.map(async (keyPage) => {
            const batchRequest: BatchGetItemCommandInput = {
                RequestItems: {
                    [this.tableName]: {
                        Keys: keyPage.map((key) => marshallKey(key)),
                        ProjectionExpression,
                        ExpressionAttributeNames,
                    }
                },
                ReturnConsumedCapacity: this.returnConsumedCapacity,
            }
            const items: T[] = [];
            let result = await this.dynamoDBClient.send(new BatchGetItemCommand(batchRequest));
            items.push(...(result.Responses?.[this.tableName]?.map((item) => unmarshall(item) as T) ?? []));

            let delay = 100;
            while (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay = Math.min(delay * 2, 3200);
                result = await this.dynamoDBClient.send(new BatchGetItemCommand({
                    RequestItems: result.UnprocessedKeys,
                    ReturnConsumedCapacity: this.returnConsumedCapacity,
                }));
                items.push(...(result.Responses?.[this.tableName]?.map((item) => unmarshall(item) as T) ?? []));
            }
            return items;
        })))
            .then((itemSets) => itemSets.flat());

    };
}

