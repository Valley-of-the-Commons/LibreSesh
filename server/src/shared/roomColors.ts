/**
 * Room colours. Washed-out watercolour tints rather than saturated hues: a
 * schedule is mostly text on coloured columns, and strong fills fight the
 * session blocks sitting on top of them.
 *
 * Shared so the client can render swatches from the same list the server
 * assigns defaults from.
 */
export const ROOM_COLORS = [
  '#BFD7E8', // pale blue
  '#CFE3CE', // pale green
  '#F3D8DA', // pale rose
  '#EDE2C6', // pale sand
  '#DBD3E9', // pale lilac
  '#CCE5E2', // pale teal
  '#F5E0CD', // pale peach
  '#E1E5C9', // pale olive
] as const;

export const DEFAULT_ROOM_COLOR = ROOM_COLORS[0];

/**
 * The first colour no existing room is using, so a new room looks different
 * from its neighbours without anyone choosing. Falls back to cycling once
 * every colour is spoken for.
 */
export function nextRoomColor(taken: readonly string[]): string {
  const used = new Set(taken.map((c) => c.toLowerCase()));
  const free = ROOM_COLORS.find((c) => !used.has(c.toLowerCase()));
  return free ?? ROOM_COLORS[taken.length % ROOM_COLORS.length];
}
