// minimal Cloudflare Workers globals for typecheck (runtime-provided)
declare class ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

declare const caches: {
  default: {
    match(key: Request | string): Promise<Response | undefined>;
    put(key: Request | string, response: Response): Promise<void>;
    delete(key: Request | string): Promise<boolean>;
  };
};
