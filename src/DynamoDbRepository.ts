import {
    BatchGetItemCommand,
    BatchGetItemCommandInput,
    DeleteItemCommand,
    DynamoDBClient,
    GetItemCommand,
    paginateQuery,
    PutItemCommand,
    QueryCommandInput,
    UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {marshall, unmarshall} from "@aws-sdk/util-dynamodb";
import {replace, uniqWith, isEqual, pickBy} from "lodash";

const expressionAttributeKey = (key: string) => replace(key, /-/g, "_");

export enum FilterOperator {
    EQUALS = "=",
    NOT_EQUALS = "<>",
    GREATER_THAN_OR_EQUALS = ">=",
    GREATER_THAN = ">",
    LESS_THAN = "<",
    LESS_THAN_OR_EQUALS = "<=",
    IN = "IN",
    BETWEEN = "BETWEEN",
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

export interface Query
    extends Partial<FilterableQuery>, Partial<ProjectedQuery> {
    index?: string
}



const mapInKeys = (filterExpression: FilterExpression) =>
    Array.isArray(filterExpression.value)
        ? filterExpression.value.map(
            (_, index) => `:${filterExpression.attribute}${index}`,
        )
        : `:${filterExpression.attribute}`;

export const mapFilterExpression = (filterExpression: FilterExpression) => {
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
        default:
            return (
                `#${expressionAttributeKey(filterExpression.attribute)} ${filterExpression.operator} ` +
                `:${expressionAttributeKey(filterExpression.attribute)}`
            );
    }
};

export const mapFilterExpressions = (
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
        let idx = Math.floor(i / pageSize)
        let page = acc[idx] || (acc[idx] = [])
        page.push(val)
        return acc
    }, [] as Array<Array<T>>);
}

export class DynamoDbRepository<K, T> {

    constructor(
        private readonly dynamoDBClient: DynamoDBClient,
        private readonly tableName: string,
        private readonly hashKey: string,
        private readonly rangKey?: string,
    ) {

    }

    getItem = async (key: K): Promise<T | undefined> => {
        return this.dynamoDBClient
            .send(
                new GetItemCommand({
                    TableName: this.tableName,
                    Key: marshall(key, {removeUndefinedValues: true}),
                }),
            )
            .then((result) =>
                result.Item ? unmarshall(result.Item) as T : undefined,
            )
    };

    putItem = async (key: K, record: T): Promise<T> => {
        const Item = marshall({...record, ...key}, {removeUndefinedValues: true});
        return this.dynamoDBClient
            .send(
                new PutItemCommand({
                    TableName: this.tableName,
                    Item,
                }),
            )
            .then(() => this.getItem(key) as Promise<T>);
    };

    deleteItem = async (key: K) => {
        return this.dynamoDBClient.send(new DeleteItemCommand({
            TableName: this.tableName,
            Key: marshall(key),
        })).then((result) => result.Attributes ?
            unmarshall(result.Attributes) : undefined);
    };


    updateItem = async (
        key: K,
        updates: Partial<T>,
        remove?: string[],
    ): Promise<T | undefined> => {
        const hasUpdates = Object.keys(updates).length > 0;
        const setAttributesExpression = hasUpdates ? `SET ${Object.entries(updates)
            .filter(([_, value]) => value !== undefined)
            .map(
                ([key]) =>
                    `#${expressionAttributeKey(key)} = :${expressionAttributeKey(key)}`,
            )
            .join(", ")}` : '';
        const removeAttributesExpression = remove
            ? ` REMOVE ${remove.map((key) => `#${expressionAttributeKey(key)}`).join(", ")}`
            : "";
        const removeAttributeNames = remove
            ? remove.map(expressionAttributeKey).reduce(
                (acc, key) => ({
                    ...acc,
                    [`#${expressionAttributeKey(key)}`]: key,
                }),
                {},
            )
            : {};
        const updateItemCommandInput = {
            TableName: this.tableName,
            Key: marshall(key),
            UpdateExpression: `${setAttributesExpression}${removeAttributesExpression}`,
            ExpressionAttributeNames: Object.entries(updates)
                .filter(([_, value]) => value !== undefined)
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
                Object.entries(updates).reduce(
                    (acc, [key, value]) => ({
                        ...acc,
                        [`:${expressionAttributeKey(key)}`]: value,
                    }),
                    Object.assign(
                        {},
                    ),
                ),
                {removeUndefinedValues: true},
            ) : undefined,
        };
        return this.dynamoDBClient
            .send(new UpdateItemCommand(updateItemCommandInput))
            .then(() => this.getItem(key));
    };


    getItems = async (
        query: Query & (K | Record<string, any>),
    ): Promise<Array<T> | undefined> => {
        const {index, filterExpressions, projectedAttributes, ...keys} = query;
        const KeyConditionExpression = Object.keys(keys)
            .map((key) => `#${expressionAttributeKey(key)} = :${expressionAttributeKey(key)}`).join(' AND ');
        const keyExpressionAttributeNames = Object.keys(keys)
            .reduce((acc, key) => ({...acc, [`#${expressionAttributeKey(key)}`]: key}), Object.assign({}));
        const keyExpressionAttributeValues = Object.entries(keys)
            .reduce((acc, [key, value]) => ({...acc, [`:${expressionAttributeKey(key)}`]: value}), Object.assign({}));

        const ProjectionExpression = projectedAttributes
            ? projectedAttributes.map((attribute) => `#${expressionAttributeKey(attribute)}`).join(',')
            : undefined;
        const projectionAttributeNames: Record<string, string> = projectedAttributes ? projectedAttributes.reduce(
            (
                reduction: Record<string, string>,
                attribute: string,
            ) => ({
                ...reduction,
                [`#${expressionAttributeKey(attribute)}`]:
                attribute,
            }),
            Object.assign({}),
        ) : {}
        const FilterExpression = filterExpressions
            ? mapFilterExpressions(filterExpressions)
            : undefined;
        const filterAttributeNames: Record<string, string> = filterExpressions
            ? filterExpressions.reduce(
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
        const filterAttributeValues: Record<string, string> = filterExpressions
            ? filterExpressions.reduce(
                (reduction: Record<string, any>, filterExpression) => ({
                    ...reduction,
                    ...mapFilterExpressionValues(filterExpression),
                }),
                Object.assign({}),
            )
            : {};
        const queryCommandInput: QueryCommandInput = {
            TableName: this.tableName,
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
                {...keyExpressionAttributeValues, ...filterAttributeValues},
                {removeUndefinedValues: true},
            ),
        };
        const paginator = paginateQuery(
            {client: this.dynamoDBClient, pageSize: 100},
            queryCommandInput,
        );

        if (index) {
            const keys: Array<K> = [];
            for await (const page of paginator) {
                if (page.Items) {
                    keys.push(
                        ...(page.Items.map((item) => unmarshall(item) as T)
                            .map((item: any) => pickBy(item, (value, key) => value !== undefined && (key === this.hashKey || key === this.rangKey)) as K)),
                    )
                }
            }
            const items = await this.batchGetItems(keys);
            return items as Array<T>;
        }

        const items: Array<T> = [];
        for await (const page of paginator) {
            if (page.Items) {
                items.push(
                    ...(page.Items?.map((item) => unmarshall(item) as T)),
                )
            }
        }
        return items;
    };


    batchGetItems = async (
        keys: K[],
    ): Promise<Array<T | undefined>> => {
        const uniqueKeys = uniqWith(keys, isEqual);
        const keyPages = paginate(uniqueKeys, 100);
        return Promise.all((keyPages.map(async (keyPage) => {
            const batchRequest: BatchGetItemCommandInput = {
                RequestItems: {
                    [this.tableName]: {
                        Keys: keyPage.map((key) => (marshall(key))),
                    }
                }
            }
            return this.dynamoDBClient.send(new BatchGetItemCommand(batchRequest)).then(result =>
                result.Responses?.[this.tableName].map((item) => unmarshall(item) as T));
        })))
            .then((itemSets) => itemSets.flat());

    };

}

