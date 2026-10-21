import type { SandboxStreamEvent } from "@ifss/shared";
import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

/** 每个 world 一个 Subject：SSE 只负责推送，真相始终在 DB。 */
@Injectable()
export class SandboxRuntime {
  private readonly streams = new Map<string, Subject<SandboxStreamEvent>>();

  getOrCreate(worldId: string): Subject<SandboxStreamEvent> {
    let subject = this.streams.get(worldId);
    if (!subject) {
      subject = new Subject<SandboxStreamEvent>();
      this.streams.set(worldId, subject);
    }
    return subject;
  }

  stream(worldId: string): Observable<SandboxStreamEvent> {
    return this.getOrCreate(worldId).asObservable();
  }

  publish(worldId: string, event: SandboxStreamEvent): void {
    this.getOrCreate(worldId).next(event);
  }

  complete(worldId: string): void {
    const subject = this.streams.get(worldId);
    if (subject) {
      subject.complete();
      this.streams.delete(worldId);
    }
  }
}
