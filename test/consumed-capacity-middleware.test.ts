import { describe, it, expect, vi } from 'vitest';
import { consumedCapacityMiddleware, type ConsumedCapacityDetail } from '../src/consumed-capacity-middleware';
import { type InitializeHandlerArguments } from '@smithy/types';

describe('consumed-capacity-middleware', () => {
    describe('basic functionality', () => {
        it('should extract ReturnConsumedCapacity from input and ConsumedCapacity from output', async () => {
            const capturedDetails: ConsumedCapacityDetail[] = [];
            const onConsumedCapacity = vi.fn(async (detail: ConsumedCapacityDetail) => {
                capturedDetails.push(detail);
            });

            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const mockNext = vi.fn(async () => ({
                output: {
                    ConsumedCapacity: {
                        CapacityUnits: 5,
                        TableName: 'test-table',
                    },
                },
                response: {},
            }));

            const result = await middleware(mockNext)({
                input: { ReturnConsumedCapacity: 'TOTAL', TableName: 'test-table' },
            } as InitializeHandlerArguments);

            expect(onConsumedCapacity).toHaveBeenCalledOnce();
            expect(capturedDetails[0]).toEqual({
                ReturnConsumedCapacity: 'TOTAL',
                ConsumedCapacity: {
                    CapacityUnits: 5,
                    TableName: 'test-table',
                },
            });
            expect(result.output).toEqual({
                ConsumedCapacity: {
                    CapacityUnits: 5,
                    TableName: 'test-table',
                },
            });
        });
    });

    describe('edge cases', () => {
        it('should handle undefined ReturnConsumedCapacity', async () => {
            const capturedDetails: ConsumedCapacityDetail[] = [];
            const onConsumedCapacity = vi.fn(async (detail: ConsumedCapacityDetail) => {
                capturedDetails.push(detail);
            });

            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const mockNext = vi.fn(async () => ({
                output: { ConsumedCapacity: { CapacityUnits: 1, TableName: 'test' } },
                response: {},
            }));

            await middleware(mockNext)({
                input: { TableName: 'test' }, // no ReturnConsumedCapacity
            } as InitializeHandlerArguments);

            expect(capturedDetails[0].ReturnConsumedCapacity).toBeUndefined();
        });

        it('should handle undefined ConsumedCapacity in output', async () => {
            const capturedDetails: ConsumedCapacityDetail[] = [];
            const onConsumedCapacity = vi.fn(async (detail: ConsumedCapacityDetail) => {
                capturedDetails.push(detail);
            });

            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const mockNext = vi.fn(async () => ({
                output: { /* no ConsumedCapacity */ },
                response: {},
            }));

            await middleware(mockNext)({
                input: { ReturnConsumedCapacity: 'TOTAL', TableName: 'test' },
            } as InitializeHandlerArguments);

            expect(capturedDetails[0].ConsumedCapacity).toBeUndefined();
        });

        it('should handle array of ConsumedCapacity (from batch operations)', async () => {
            const capturedDetails: ConsumedCapacityDetail[] = [];
            const onConsumedCapacity = vi.fn(async (detail: ConsumedCapacityDetail) => {
                capturedDetails.push(detail);
            });

            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const capacityArray = [
                { CapacityUnits: 2, TableName: 'table1' },
                { CapacityUnits: 3, TableName: 'table2' },
            ];

            const mockNext = vi.fn(async () => ({
                output: { ConsumedCapacity: capacityArray },
                response: {},
            }));

            await middleware(mockNext)({
                input: { ReturnConsumedCapacity: 'INDEXES', TableName: 'table1' },
            } as InitializeHandlerArguments);

            expect(capturedDetails[0].ConsumedCapacity).toEqual(capacityArray);
        });

        it('should handle different ReturnConsumedCapacity values', async () => {
            const capturedDetails: ConsumedCapacityDetail[] = [];
            const onConsumedCapacity = vi.fn(async (detail: ConsumedCapacityDetail) => {
                capturedDetails.push(detail);
            });

            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const mockNext = vi.fn(async () => ({
                output: { ConsumedCapacity: { CapacityUnits: 1, TableName: 'test' } },
                response: {},
            }));

            const values: ('INDEXES' | 'TOTAL' | 'NONE')[] = ['INDEXES', 'TOTAL', 'NONE'];

            for (const value of values) {
                capturedDetails.length = 0;
                await middleware(mockNext)({
                    input: { ReturnConsumedCapacity: value, TableName: 'test' },
                } as InitializeHandlerArguments);

                expect(capturedDetails[0].ReturnConsumedCapacity).toBe(value);
            }
        });
    });

    describe('error handling', () => {
        it('should propagate errors from next handler', async () => {
            const onConsumedCapacity = vi.fn(async () => {});
            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const testError = new Error('DynamoDB error');
            const mockNext = vi.fn(async () => {
                throw testError;
            });

            await expect(
                middleware(mockNext)({
                    input: { TableName: 'test' },
                } as InitializeHandlerArguments)
            ).rejects.toThrow('DynamoDB error');
        });

        it('should propagate errors from onConsumedCapacity callback', async () => {
            const callbackError = new Error('Callback error');
            const onConsumedCapacity = vi.fn(async () => {
                throw callbackError;
            });

            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const mockNext = vi.fn(async () => ({
                output: { ConsumedCapacity: { CapacityUnits: 1, TableName: 'test' } },
                response: {},
            }));

            await expect(
                middleware(mockNext)({
                    input: { ReturnConsumedCapacity: 'TOTAL', TableName: 'test' },
                } as InitializeHandlerArguments)
            ).rejects.toThrow('Callback error');
        });

        it('should still call onConsumedCapacity even if next handler returns empty output', async () => {
            const onConsumedCapacity = vi.fn(async () => {});
            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const mockNext = vi.fn(async () => ({
                output: {},
                response: {},
            }));

            await middleware(mockNext)({
                input: { TableName: 'test' },
            } as InitializeHandlerArguments);

            expect(onConsumedCapacity).toHaveBeenCalledOnce();
            expect(onConsumedCapacity).toHaveBeenCalledWith({
                ReturnConsumedCapacity: undefined,
                ConsumedCapacity: undefined,
            });
        });
    });

    describe('middleware chain integrity', () => {
        it('should return the full response from next handler', async () => {
            const onConsumedCapacity = vi.fn(async () => {});
            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const expectedResponse = {
                output: {
                    ConsumedCapacity: { CapacityUnits: 1, TableName: 'test' },
                    Item: { id: { S: 'test-id' }, name: { S: 'test' } },
                },
                response: { $metadata: { requestId: 'req-123' } },
            };

            const mockNext = vi.fn(async () => expectedResponse);

            const result = await middleware(mockNext)({
                input: { ReturnConsumedCapacity: 'TOTAL', TableName: 'test' },
            } as InitializeHandlerArguments);

            expect(result).toEqual(expectedResponse);
        });

        it('should preserve input integrity through middleware', async () => {
            const capturedInputs: unknown[] = [];
            const onConsumedCapacity = vi.fn(async () => {});
            const middleware = consumedCapacityMiddleware({ onConsumedCapacity });

            const mockNext = vi.fn(async (args: InitializeHandlerArguments) => {
                capturedInputs.push(args.input);
                return { output: {}, response: {} };
            });

            const testInput = {
                TableName: 'test',
                Item: { id: { S: 'abc' } },
                ReturnConsumedCapacity: 'TOTAL',
            };

            await middleware(mockNext)({
                input: testInput,
            } as InitializeHandlerArguments);

            expect(capturedInputs[0]).toEqual(testInput);
        });
    });
});
