import {
    ConsumedCapacity,
    ReturnConsumedCapacity
} from "@aws-sdk/client-dynamodb";

import {
    HandlerExecutionContext,
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

/* eslint-disable  @typescript-eslint/no-explicit-any  */
/* eslint-disable  @typescript-eslint/no-unused-vars  */
export const consumedCapacityMiddleware =
    (consumedCapacityMiddlewareConfig: ConsumedCapacityMiddlewareConfig) =>
        <Output extends MetadataBearer = MetadataBearer>(
            next: InitializeHandler<any, Output>,
            context: HandlerExecutionContext
        ): InitializeHandler<any, Output> =>
            async (args: InitializeHandlerArguments<any>): Promise<InitializeHandlerOutput<Output>> => {
                const {input} = args;
                const {ReturnConsumedCapacity} = input;
                const response = await next(args);
                const {output} = response;
                const consumedCapacity = get(output, "ConsumedCapacity") as ConsumedCapacity | ConsumedCapacity[] | undefined;
                await consumedCapacityMiddlewareConfig.onConsumedCapacity({ReturnConsumedCapacity, ConsumedCapacity: consumedCapacity});
                return response;
            };