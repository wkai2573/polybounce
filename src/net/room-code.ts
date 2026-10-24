/** 去掉容易看錯的 0、1、I、O。 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const PEER_PREFIX = 'polybounce-';

export function generateRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return code;
}

/** 玩家輸入的房間碼轉成標準格式，格式不對回傳 null。 */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}

/** 配對伺服器是公用的，加上前綴避免撞到別的應用程式用的代號。 */
export const peerIdForRoom = (code: string) => PEER_PREFIX + code;
