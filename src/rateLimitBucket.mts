export interface RateLimitHistoryEntry {
    time: number;
    amount: number;
}

export class RateLimitBucket {
    private history: RateLimitHistoryEntry[] = [];
    private trippedRateLimit = false;

    constructor(
        private limitPerMessage = 200,
        private limitOverTime = 500,
        private limitTimeFrame = 30000
    ) {}

    public add(this: RateLimitBucket, amount: number) {
        const now = Date.now();
        this.history.push({ time: now, amount });
        this.history = this.history.filter(
            (e) => e.time + this.limitTimeFrame >= now
        );

        if (
            amount >= this.limitPerMessage ||
            this.history.reduce((prev, e) => prev + e.amount, 0) >=
                this.limitOverTime
        ) {
            this.trippedRateLimit = true;
            return;
        }
    }

    public hasTrippedRateLimit(this: RateLimitBucket) {
        return this.trippedRateLimit;
    }
}
