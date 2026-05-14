import { Buffer } from "node:buffer";
import * as net from "node:net";

export class StreamReader {
  private buffer = Buffer.alloc(0);
  private waiters: { n: number; resolve: (buf: Buffer) => void; reject: (err: Error) => void }[] = [];
  private ended = false;

  constructor(private stream: net.Socket) {
    stream.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.checkWaiters();
    });
    stream.on("error", (err: Error) => {
      this.waiters.forEach((w) => w.reject(err));
      this.waiters = [];
    });
    stream.on("end", () => {
      this.ended = true;
      this.waiters.forEach((w) => w.reject(new Error("stream ended")));
      this.waiters = [];
    });
  }

  readExact(n: number): Promise<Buffer> {
    if (this.ended) return Promise.reject(new Error("stream already ended"));
    return new Promise((resolve, reject) => {
      this.waiters.push({ n, resolve, reject });
      this.checkWaiters();
    });
  }

  private checkWaiters() {
    while (this.waiters.length > 0 && this.buffer.length >= this.waiters[0].n) {
      const waiter = this.waiters.shift()!;
      const chunk = this.buffer.subarray(0, waiter.n);
      this.buffer = this.buffer.subarray(waiter.n);
      waiter.resolve(chunk);
    }
  }
}
