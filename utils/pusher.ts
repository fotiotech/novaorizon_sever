import Pusher from "pusher";
import { env } from "../config/env.js";

let _client: Pusher | null | undefined = undefined;

/**
 * Lazily-initialized Pusher client. Returns `null` if any required env
 * var is missing — callers must null-check. This keeps the app fully
 * functional without Pusher configured (events are written; realtime
 * pushes silently no-op).
 */
export function getPusher(): Pusher | null {
  if (_client !== undefined) return _client;

  if (
    !env.pusherAppId ||
    !env.pusherKey ||
    !env.pusherSecret ||
    !env.pusherCluster
  ) {
    console.warn("[pusher] env vars not set — realtime disabled");
    _client = null;
    return null;
  }

  _client = new Pusher({
    appId: env.pusherAppId,
    key: env.pusherKey,
    secret: env.pusherSecret,
    cluster: env.pusherCluster,
    useTLS: true,
  });
  return _client;
}
