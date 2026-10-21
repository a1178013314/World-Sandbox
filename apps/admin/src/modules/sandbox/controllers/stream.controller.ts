import type { SandboxEvent, SandboxStreamEvent } from "@ifss/shared";
import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { SandboxRuntime } from "../runtime";
import { WorldService } from "../services/world";

function toStreamEvent(event: SandboxEvent): SandboxStreamEvent | null {
  if (event.kind === "post" || event.kind === "reply" || event.kind === "like") {
    return {
      type: "action",
      data: {
        seq: event.seq,
        round: event.round,
        kind: event.kind,
        actorId: event.actorId ?? "",
        targetId: event.targetId,
        content: event.content ?? "",
        emotion: event.payload?.emotion,
      },
    };
  }
  if (event.kind === "intervention") {
    return {
      type: "intervention",
      data: {
        seq: event.seq,
        round: event.round,
        visibility: event.visibility,
        content: event.content ?? "",
        kind: "intervention",
        actorId: null,
        targetId: event.targetId,
      },
    };
  }
  return null;
}

@Controller("worlds")
export class StreamController {
  constructor(
    private readonly worlds: WorldService,
    private readonly runtime: SandboxRuntime,
  ) {}

  @Get(":id/stream")
  async stream(
    @Param("id") id: string,
    @Query("lastEventId") lastEventId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.worlds.get(id);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const headerLastId = req.headers["last-event-id"];
    const since =
      Number(lastEventId ?? (Array.isArray(headerLastId) ? headerLastId[0] : headerLastId) ?? 0) ||
      0;
    const sent = new Set<number>();
    let closed = false;
    let ready = false;
    const buffered: { event: SandboxStreamEvent; seq?: number }[] = [];

    const consume = (event: SandboxStreamEvent, seq?: number): void => {
      if (closed) {
        return;
      }
      if (seq !== undefined) {
        if (sent.has(seq)) {
          return;
        }
        sent.add(seq);
        res.write(`id: ${seq}\n`);
      }
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      if (event.type === "done") {
        closed = true;
        res.end();
      }
    };

    const subscription = this.runtime.stream(id).subscribe((event) => {
      const seq = "seq" in event.data ? event.data.seq : undefined;
      if (!ready) {
        buffered.push({ event, seq });
        return;
      }
      consume(event, seq);
    });

    consume({ type: "snapshot", data: await this.worlds.snapshot(id) });
    for (const event of await this.worlds.eventList(id)) {
      if (event.seq <= since) {
        continue;
      }
      const frame = toStreamEvent(event);
      if (frame) {
        consume(frame, event.seq);
      }
    }

    ready = true;
    for (const item of buffered) {
      consume(item.event, item.seq);
    }

    const ping = setInterval(() => {
      if (!closed) {
        res.write(": ping\n\n");
      }
    }, 15_000);

    req.on("close", () => {
      closed = true;
      clearInterval(ping);
      subscription.unsubscribe();
    });
  }
}
