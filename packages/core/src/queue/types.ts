export interface QueueItem<T> {
  raw: string;
  data: T;
}

export type DeadLetterPayload<T> = T & {
  _error: string;
  _failedAt: string;
};

export interface QueueOptions {
  queueKey?: string;
  processingKey?: string;
  deadLetterKey?: string;
}

export interface QueueLengths {
  waiting: number;
  processing: number;
  deadLetter: number;
}
