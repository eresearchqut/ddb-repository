import {
    ConsumedCapacity,
    ReturnConsumedCapacity
} from "@aws-sdk/client-dynamodb";

import {
    InitializeHandler,
    InitializeHandlerArguments,
    InitializeHandlerOutput,
    MetadataBearer
} from "@smithy/types";

import {get} from "lodash";

export interface ConsumedCapacityDetail {
    ReturnConsumedCapacity: ReturnConsumedCapacity | undefined
    ConsumedCapacity: ConsumedCapacity | ConsumedCapacity[] | undefined
}

export interface ConsumedCapacityMiddlewareConfig {
    onConsumedCapacity: (consumedCapacity: ConsumedCapacityDetail) => Promise<unknown>;
}

interface ConsumedCapacityInput {
    ReturnConsumedCapacity?: ReturnConsumedCapacity;
}

export const consumedCapacityMiddleware =
    (consumedCapacityMiddlewareConfig: ConsumedCapacityMiddlewareConfig) =>
        <Output extends MetadataBearer = MetadataBearer>(
            next: InitializeHandler<ConsumedCapacityInput, Output>,
        ): InitializeHandler<ConsumedCapacityInput, Output> =>
            async (args: InitializeHandlerArguments<ConsumedCapacityInput>): Promise<InitializeHandlerOutput<Output>> => {
                const {input} = args;
                const {ReturnConsumedCapacity} = input;
                const response = await next(args);
                const {output} = response;
                const consumedCapacity = get(output, "ConsumedCapacity") as ConsumedCapacity | ConsumedCapacity[] | undefined;
                await consumedCapacityMiddlewareConfig.onConsumedCapacity({ReturnConsumedCapacity, ConsumedCapacity: consumedCapacity});
                return response;
            };