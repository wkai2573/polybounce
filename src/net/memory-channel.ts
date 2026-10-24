import type { ClientChannel, ClientMessage, HostChannel, HostMessage } from './protocol.ts';

/**
 * 記憶體內的一對連線，讓同一個行程裡的房主與玩家互通，不依賴真實的 PeerJS。
 * 送出的訊息會先序列化再還原，模擬真實連線不會共用物件。
 */
export function createChannelPair(): { host: HostChannel; client: ClientChannel } {
  let closed = false;
  let hostHandler: ((m: ClientMessage) => void) | undefined;
  let clientHandler: ((m: HostMessage) => void) | undefined;
  const closeHandlers: Array<() => void> = [];

  const onClose = (h: () => void) => {
    closeHandlers.push(h);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    for (const h of closeHandlers) h();
  };

  return {
    host: {
      send: (m) => {
        if (!closed) clientHandler?.(structuredClone(m));
      },
      onMessage: (h) => {
        hostHandler = h;
      },
      onClose,
      close,
    },
    client: {
      send: (m) => {
        if (!closed) hostHandler?.(structuredClone(m));
      },
      onMessage: (h) => {
        clientHandler = h;
      },
      onClose,
      close,
    },
  };
}
