import {
    ConsumedCapacity,
    ReturnConsumedCapacity,
    ServiceInputTypes,
    ServiceOutputTypes,
} from "@aws-sdk/client-dynamodb";

import {
    InitializeHandler,
    InitializeHandlerArguments,
    InitializeHandlerOutput,
} from "@smithy/types";



export interface ConsumedCapacityDetail {
    ReturnConsumedCapacity: ReturnConsumedCapacity | undefined
    ConsumedCapacity: ConsumedCapacity | ConsumedCapacity[] | undefined
}

export interface ConsumedCapacityMiddlewareConfig {
    onConsumedCapacity: (consumedCapacity: ConsumedCapacityDetail) => Promise<unknown>;
}

export const consumedCapacityMiddleware =
    (consumedCapacityMiddlewareConfig: ConsumedCapacityMiddlewareConfig) =>
        (next: InitializeHandler<ServiceInputTypes, ServiceOutputTypes>) =>
            async (args: InitializeHandlerArguments<ServiceInputTypes>): Promise<InitializeHandlerOutput<ServiceOutputTypes>> => {
                const {input} = args;
                const returnConsumedCapacity = (input as unknown as Record<string, unknown>)["ReturnConsumedCapacity"] as ReturnConsumedCapacity | undefined;
                const response = await next(args);
                const {output} = response;
                const consumedCapacity = (output as unknown as Record<string, unknown>)["ConsumedCapacity"] as ConsumedCapacity | ConsumedCapacity[] | undefined;
                await consumedCapacityMiddlewareConfig.onConsumedCapacity({ReturnConsumedCapacity: returnConsumedCapacity, ConsumedCapacity: consumedCapacity});
                return response;
            };