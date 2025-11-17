import {
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {marshall, unmarshall} from "@aws-sdk/util-dynamodb";

//
// export enum FilterOperator {
//     EQUALS = "=",
//     NOT_EQUALS = "<>",
//     GREATER_THAN_OR_EQUALS = ">=",
//     GREATER_THAN = ">",
//     LESS_THAN = "<",
//     LESS_THAN_OR_EQUALS = "<=",
//     IN = "IN",
//     BETWEEN = "BETWEEN",
// }
//
// export interface FilterExpression {
//     attribute: string;
//     value:
//         | string
//         | number
//         | boolean
//         | Array<string | number>
//         | [string, string]
//         | [number, number];
//     operator: FilterOperator;
//     negate?: boolean;
// }
//
// export interface FilterableQuery {
//     filterExpressions: Array<FilterExpression>;
// }
//
// export interface ProjectedQuery {
//     projectedAttributes: string[];
// }
//
// export interface Query
//     extends Partial<FilterableQuery>, Partial<ProjectedQuery> {
// }

// const expressionAttributeKey = (key: string) => replace(key, /-/g, "_");
//
// const mapInKeys = (filterExpression: FilterExpression) =>
//     Array.isArray(filterExpression.value)
//         ? filterExpression.value.map(
//             (_, index) => `:${filterExpression.attribute}${index}`,
//         )
//         : `:${filterExpression.attribute}`;

// export const mapFilterExpression = (filterExpression: FilterExpression) => {
//     switch (filterExpression.operator) {
//         case FilterOperator.IN:
//             return (
//                 `#${expressionAttributeKey(filterExpression.attribute)} ${filterExpression.operator} ` +
//                 `(${mapInKeys(filterExpression)})`
//             );
//         case FilterOperator.BETWEEN:
//             return (
//                 `#${expressionAttributeKey(filterExpression.attribute)} ${filterExpression.operator} ` +
//                 `:${expressionAttributeKey(filterExpression.attribute)}0 AND :${expressionAttributeKey(filterExpression.attribute)}1`
//             );
//         default:
//             return (
//                 `#${expressionAttributeKey(filterExpression.attribute)} ${filterExpression.operator} ` +
//                 `:${expressionAttributeKey(filterExpression.attribute)}`
//             );
//     }
// };

// export const mapFilterExpressions = (
//     filterExpressions: Array<FilterExpression>,
// ) =>
//     filterExpressions
//         .map((filterExpression) =>
//             filterExpression.negate
//                 ? `NOT ${mapFilterExpression(filterExpression)}`
//                 : mapFilterExpression(filterExpression),
//         )
//         .join(" AND ");

// const mapFilterExpressionValues = (
//     filterExpression: FilterExpression,
// ): Record<string, string | number | boolean> =>
//     Array.isArray(filterExpression.value)
//         ? filterExpression.value.reduce(
//             (reduction, value, index) => ({
//                 ...reduction,
//                 [`:${expressionAttributeKey(filterExpression.attribute)}${index}`]: value,
//             }),
//             Object.assign({}),
//         )
//         : {
//             [`:${expressionAttributeKey(filterExpression.attribute)}`]:
//             filterExpression.value,
//         };

// const paginate = <T>(array: Array<T>, pageSize: number) => {
//     return array.reduce((acc, val, i) => {
//         let idx = Math.floor(i / pageSize)
//         let page = acc[idx] || (acc[idx] = [])
//         page.push(val)
//         return acc
//     }, [] as Array<Array<T>>);
// }

export class DynamoDbRepository<K, T> {
    constructor(
        private readonly dynamoDBClient: DynamoDBClient,
        private readonly tableName: string,
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

    //
    // deleteItem = async (key: Key): Promise<[Metadata, Record<string, any>] | undefined> => {
    //     const metadata = {[DELETED_AT_ATTRIBUTE]: new Date().toISOString()};
    //     return this.updateItem(key, metadata)
    //         .then((result) =>
    //             this.dynamoDBClient.send(new DeleteItemCommand({
    //                 TableName: this.tableName,
    //                 Key: marshall(key),
    //             }))
    //                 .then(() => result));
    // };
    //
    // updateItem = async (
    //     key: Key,
    //     updates: Record<string, any>,
    //     remove?: string[],
    // ): Promise<[Metadata, Record<string, any>] | undefined> => {
    //     const metadata = {[UPDATED_AT_ATTRIBUTE]: new Date().toISOString()};
    //     const AttributeUpdates = {
    //         ...updates,
    //         ...metadata
    //     };
    //
    //     const setAttributesExpression = `SET ${Object.entries(AttributeUpdates)
    //         .filter(([_, value]) => value !== undefined)
    //         .map(
    //             ([key]) =>
    //                 `#${expressionAttributeKey(key)} = :${expressionAttributeKey(key)}`,
    //         )
    //         .join(", ")}`;
    //     const removeAttributesExpression = remove
    //         ? ` REMOVE ${remove.map((key) => `#${expressionAttributeKey(key)}`).join(", ")}`
    //         : "";
    //     const removeAttributeNames = remove
    //         ? remove.map(expressionAttributeKey).reduce(
    //             (acc, key) => ({
    //                 ...acc,
    //                 [`#${expressionAttributeKey(key)}`]: key,
    //             }),
    //             {},
    //         )
    //         : {};
    //
    //     const UpdateItemInput = {
    //         TableName: this.tableName,
    //         Key: marshall(key),
    //         ConditionExpression: key[SK_ATTRIBUTE]
    //             ? `#${PK_ATTRIBUTE} = :${PK_ATTRIBUTE} AND #${SK_ATTRIBUTE} = :${SK_ATTRIBUTE}`
    //             : `#${PK_ATTRIBUTE} = :${PK_ATTRIBUTE}`,
    //         UpdateExpression: `${setAttributesExpression}${removeAttributesExpression}`,
    //         ExpressionAttributeNames: Object.entries(AttributeUpdates)
    //             .filter(([_, value]) => value !== undefined)
    //             .reduce(
    //                 (acc, [key]) => ({
    //                     ...acc,
    //                     [`#${expressionAttributeKey(key)}`]: key,
    //                 }),
    //                 Object.assign(
    //                     removeAttributeNames,
    //                     {
    //                         [`#${PK_ATTRIBUTE}`]: PK_ATTRIBUTE,
    //                     },
    //                     key[SK_ATTRIBUTE]
    //                         ? {
    //                             [`#${SK_ATTRIBUTE}`]: SK_ATTRIBUTE,
    //                         }
    //                         : {},
    //                 ),
    //             ) as Record<string, string>,
    //         ExpressionAttributeValues: marshall(
    //             Object.entries(AttributeUpdates).reduce(
    //                 (acc, [key, value]) => ({
    //                     ...acc,
    //                     [`:${expressionAttributeKey(key)}`]: value,
    //                 }),
    //                 Object.assign(
    //                     {},
    //                     key[SK_ATTRIBUTE]
    //                         ? {
    //                             [`:${PK_ATTRIBUTE}`]: key[PK_ATTRIBUTE],
    //                             [`:${SK_ATTRIBUTE}`]: key[SK_ATTRIBUTE],
    //                         }
    //                         : {
    //                             [`:${PK_ATTRIBUTE}`]: key[PK_ATTRIBUTE],
    //                         },
    //                 ),
    //             ),
    //             {removeUndefinedValues: true},
    //         ),
    //
    //     };
    //     return this.dynamoDBClient
    //         .send(new UpdateItemCommand(UpdateItemInput))
    //         .then(() => this.getItem(key));
    // };
    //
    //
    // getItems = async (
    //     query: Query,
    // ): Promise<Array<[Metadata, Record<string, any>]> | undefined> => {
    //     const {pk, sk, index, filterExpressions, projectedAttributes} = query;
    //     const PK_ATTRIBUTE_NAME = index ? `${index}Pk` : PK_ATTRIBUTE;
    //     const SK_ATTRIBUTE_NAME = index ? `${index}Sk` : SK_ATTRIBUTE;
    //     const KeyConditionExpression =
    //         `#${PK_ATTRIBUTE} = :${PK_ATTRIBUTE}` +
    //         (sk ? ` AND #${SK_ATTRIBUTE} = :${SK_ATTRIBUTE}` : "");
    //     const keyExpressionAttributeNames: Record<string, string> = sk
    //         ? {
    //             [`#${PK_ATTRIBUTE}`]: PK_ATTRIBUTE_NAME,
    //             [`#${SK_ATTRIBUTE}`]: SK_ATTRIBUTE_NAME,
    //         }
    //         : {
    //             [`#${PK_ATTRIBUTE}`]: PK_ATTRIBUTE_NAME,
    //         };
    //     const keyExpressionAttributeValues: Record<string, string> = sk
    //         ? {
    //             [`:${PK_ATTRIBUTE}`]: pk,
    //             [`:${SK_ATTRIBUTE}`]: sk,
    //         }
    //         : {
    //             [`:${PK_ATTRIBUTE}`]: pk,
    //         };
    //     const ProjectionExpression = projectedAttributes
    //         ? projectedAttributes.map((attribute) => `#${expressionAttributeKey(attribute)}`).join(',')
    //         : undefined;
    //     const projectionAttributeNames: Record<string, string> = projectedAttributes ? projectedAttributes.reduce(
    //         (
    //             reduction: Record<string, string>,
    //             attribute: string,
    //         ) => ({
    //             ...reduction,
    //             [`#${expressionAttributeKey(attribute)}`]:
    //             attribute,
    //         }),
    //         Object.assign({}),
    //     ) : {}
    //     const FilterExpression = filterExpressions
    //         ? mapFilterExpressions(filterExpressions)
    //         : undefined;
    //     const filterAttributeNames: Record<string, string> = filterExpressions
    //         ? filterExpressions.reduce(
    //             (
    //                 reduction: Record<string, string>,
    //                 filterExpression: FilterExpression,
    //             ) => ({
    //                 ...reduction,
    //                 [`#${expressionAttributeKey(filterExpression.attribute)}`]:
    //                 filterExpression.attribute,
    //             }),
    //             Object.assign({}),
    //         )
    //         : {};
    //     const filterAttributeValues: Record<string, string> = filterExpressions
    //         ? filterExpressions.reduce(
    //             (reduction: Record<string, any>, filterExpression) => ({
    //                 ...reduction,
    //                 ...mapFilterExpressionValues(filterExpression),
    //             }),
    //             Object.assign({}),
    //         )
    //         : {};
    //     const queryCommandInput: QueryCommandInput = {
    //         TableName: this.tableName,
    //         IndexName: index,
    //         KeyConditionExpression,
    //         FilterExpression,
    //         ProjectionExpression,
    //         ExpressionAttributeNames: {
    //             ...keyExpressionAttributeNames,
    //             ...filterAttributeNames,
    //             ...projectionAttributeNames
    //         },
    //         ExpressionAttributeValues: marshall(
    //             {...keyExpressionAttributeValues, ...filterAttributeValues},
    //             {removeUndefinedValues: true},
    //         ),
    //     };
    //     const paginator = paginateQuery(
    //         {client: this.dynamoDBClient, pageSize: 100},
    //         queryCommandInput,
    //     );
    //
    //     if (query.index) {
    //         const keys: Array<Key> = [];
    //         for await (const page of paginator) {
    //             if (page.Items) {
    //                 keys.push(
    //                     ...(page.Items?.map((item) =>
    //                         unmarshall(item)).map((item) => ({[PK_ATTRIBUTE]: get(item, PK_ATTRIBUTE)}))),
    //                 )
    //             }
    //         }
    //         const items = await this.batchGetItems(keys);
    //         return items as Array<[Metadata, Record<string, any>]>;
    //     }
    //
    //     const items: Array<[Metadata, Record<string, any>]> = [];
    //     for await (const page of paginator) {
    //         if (page.Items) {
    //             items.push(
    //                 ...(page.Items?.map((item) => extract(unmarshall(item)))),
    //             )
    //         }
    //     }
    //     return items;
    // };
    //
    //
    // batchGetItems = async (
    //     keys: Key[],
    // ): Promise<Array<[Metadata, Record<string, any>] | undefined>> => {
    //     const keyPages = paginate(keys, 100);
    //     return Promise.all((keyPages.map(async (keyPage) => {
    //         const batchRequest: BatchGetItemCommandInput = {
    //             RequestItems: {
    //                 [this.tableName]: {
    //                     Keys: keyPage.map((key) => (marshall(key))),
    //                 }
    //             }
    //         }
    //         return this.dynamoDBClient.send(new BatchGetItemCommand(batchRequest)).then(result =>
    //             result.Responses?.[this.tableName].map((item) => extract(unmarshall(item))));
    //     })))
    //         .then((itemSets) => itemSets.flat());
    //
    // };

}

