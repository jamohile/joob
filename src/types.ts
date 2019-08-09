/**
 * Maps some arbitrary data to a promise.
 * This allows us to execute async batch jobs.
 */
export type DataToPromise = (data: any) => Promise<any>;

/**
 * Maps some data to an ID so we can make an identifiable operation for it.
 */
export type DataToId = (data: any, index: number) => string | number;
