import { createHash, randomInt } from 'node:crypto';
import type { Db, IdentityRow } from './db.js';

/**
 * Link phrases: `pine-otter-lantern`. Three words beat a hex code because a
 * phrase survives being read across a room or typed on a phone keyboard.
 * ~500 words × 3 gives about 27 bits — nowhere near password strength, and it
 * does not need to be: a code is single use, dies after ten minutes, and
 * guesses burn the same rate-limit budget as password attempts.
 */
export const LINK_CODE_TTL_MS = 10 * 60_000;

// Short, concrete, unambiguous words. No plurals-of-other-entries, no
// homophones of each other, nothing rude. Order is irrelevant.
export const WORDS: readonly string[] = [
  'acorn', 'alarm', 'amber', 'anchor', 'angle', 'ankle', 'antler', 'apple',
  'apron', 'arrow', 'atlas', 'attic', 'autumn', 'avenue', 'awning', 'badge',
  'bagel', 'bamboo', 'banjo', 'barley', 'barn', 'basil', 'basket', 'beach',
  'beacon', 'beak', 'beam', 'bean', 'beard', 'beaver', 'bell', 'belt',
  'bench', 'berry', 'bicycle', 'birch', 'bison', 'blanket', 'blossom', 'boat',
  'bolt', 'bonfire', 'book', 'boot', 'border', 'bottle', 'boulder', 'bow',
  'bowl', 'box', 'branch', 'brass', 'bread', 'breeze', 'brick', 'bridge',
  'broom', 'brush', 'bucket', 'budgie', 'bugle', 'bunker', 'burrow', 'bus',
  'butter', 'button', 'cabin', 'cable', 'cactus', 'camel', 'camera', 'canal',
  'candle', 'canoe', 'canyon', 'carpet', 'carrot', 'castle', 'cattle', 'cedar',
  'cellar', 'chair', 'chalk', 'cheese', 'cherry', 'chess', 'chest', 'chimney',
  'chisel', 'cider', 'cinema', 'circle', 'circus', 'clam', 'clay', 'cliff',
  'clock', 'cloud', 'clover', 'coal', 'coast', 'cobalt', 'coconut', 'coffee',
  'coin', 'collar', 'comet', 'compass', 'copper', 'coral', 'cork', 'corn',
  'cotton', 'cougar', 'cradle', 'crane', 'crater', 'crayon', 'cricket', 'crow',
  'crumb', 'crystal', 'curtain', 'cushion', 'cyclone', 'daisy', 'deck', 'deer',
  'delta', 'desert', 'desk', 'dew', 'diamond', 'dice', 'dinghy', 'dome',
  'donkey', 'door', 'dough', 'dragon', 'drawer', 'drill', 'drum', 'duck',
  'dune', 'dusk', 'eagle', 'earth', 'easel', 'echo', 'eel', 'elbow',
  'elder', 'elm', 'ember', 'engine', 'envelope', 'ermine', 'falcon', 'fern',
  'ferry', 'fiddle', 'field', 'fig', 'finch', 'fjord', 'flag', 'flame',
  'flask', 'fleece', 'flint', 'flute', 'fog', 'forest', 'fork', 'fossil',
  'fox', 'frame', 'frost', 'fudge', 'funnel', 'galaxy', 'garden', 'garlic',
  'gate', 'gecko', 'geyser', 'ginger', 'glacier', 'glade', 'glass', 'glove',
  'goat', 'goggles', 'gold', 'gong', 'goose', 'gorge', 'granite', 'grape',
  'grass', 'gravel', 'grove', 'guitar', 'gull', 'hammer', 'hammock', 'harbor',
  'harp', 'harvest', 'hatch', 'hawk', 'hazel', 'heron', 'hill', 'hinge',
  'hive', 'holly', 'honey', 'hood', 'hoof', 'hook', 'horizon', 'horn',
  'horse', 'hound', 'house', 'hut', 'iceberg', 'igloo', 'ink', 'iron',
  'island', 'ivory', 'ivy', 'jacket', 'jade', 'jaguar', 'jar', 'jelly',
  'jigsaw', 'jungle', 'juniper', 'kayak', 'kettle', 'key', 'kiln', 'kite',
  'kiwi', 'knot', 'ladder', 'ladle', 'lagoon', 'lake', 'lamp', 'lantern',
  'lark', 'laser', 'lava', 'lawn', 'leaf', 'ledge', 'lemon', 'lens',
  'lentil', 'leopard', 'lever', 'lichen', 'lighthouse', 'lily', 'lime', 'linen',
  'lion', 'lizard', 'llama', 'lobster', 'lock', 'log', 'loom', 'lotus',
  'lynx', 'magnet', 'mango', 'mantis', 'maple', 'marble', 'market', 'marsh',
  'mask', 'mast', 'meadow', 'melon', 'mesa', 'meteor', 'mill', 'mint',
  'mirror', 'mitten', 'moat', 'mole', 'monsoon', 'moose', 'mosaic', 'moss',
  'moth', 'motor', 'mountain', 'mouse', 'mug', 'mule', 'mural', 'mushroom',
  'nail', 'napkin', 'nectar', 'needle', 'nest', 'net', 'newt', 'north',
  'nutmeg', 'oak', 'oar', 'oasis', 'ocean', 'olive', 'onion', 'opal',
  'orbit', 'orchard', 'organ', 'oriole', 'otter', 'oven', 'owl', 'ox',
  'oyster', 'paddle', 'pail', 'palm', 'panda', 'pantry', 'paper', 'parcel',
  'parrot', 'pasta', 'patch', 'path', 'peach', 'peacock', 'pearl', 'pebble',
  'pecan', 'pedal', 'pelican', 'pencil', 'penguin', 'peony', 'pepper', 'perch',
  'petal', 'piano', 'pickle', 'picnic', 'pier', 'pigeon', 'pillow', 'pilot',
  'pine', 'pistachio', 'pitcher', 'planet', 'plank', 'plaza', 'plow', 'plum',
  'pocket', 'polar', 'pond', 'pony', 'poplar', 'poppy', 'porch', 'portrait',
  'poster', 'potato', 'prairie', 'prism', 'pretzel', 'pulley', 'pumpkin', 'puppet',
  'pyramid', 'quail', 'quarry', 'quartz', 'quill', 'quilt', 'rabbit', 'raccoon',
  'radio', 'radish', 'raft', 'rail', 'rain', 'rake', 'ranch', 'raven',
  'reef', 'reel', 'ribbon', 'rice', 'ridge', 'river', 'roast', 'robin',
  'rocket', 'roof', 'rope', 'rose', 'rowboat', 'ruby', 'rudder', 'rug',
  'runway', 'saddle', 'saffron', 'sage', 'sail', 'salad', 'salmon', 'sand',
  'sapphire', 'satchel', 'saucer', 'sauna', 'saw', 'scarf', 'school', 'scooter',
  'seal', 'seed', 'shadow', 'shark', 'shed', 'shelf', 'shell', 'shield',
  'ship', 'shore', 'shovel', 'shrimp', 'shutter', 'silk', 'silver', 'sketch',
  'ski', 'sled', 'sleet', 'slipper', 'sloth', 'smoke', 'snail', 'snow',
  'sock', 'sofa', 'soil', 'sonar', 'spade', 'spark', 'sparrow', 'spice',
  'spider', 'spinach', 'spiral', 'sponge', 'spool', 'spoon', 'spring', 'spruce',
  'squash', 'squirrel', 'stable', 'stack', 'stadium', 'stamp', 'star', 'statue',
  'steam', 'steel', 'stem', 'stone', 'stool', 'stork', 'storm', 'stove',
  'straw', 'stream', 'street', 'string', 'summit', 'sun', 'swan', 'sweater',
  'swing', 'syrup', 'table', 'tailor', 'tandem', 'tangerine', 'tea', 'teapot',
  'telescope', 'tent', 'thistle', 'thread', 'thunder', 'ticket', 'tiger', 'timber',
  'toad', 'toast', 'tomato', 'torch', 'tortoise', 'tower', 'tractor', 'trail',
  'train', 'tram', 'treasure', 'tree', 'trellis', 'trench', 'tripod', 'trout',
  'trumpet', 'trunk', 'tulip', 'tundra', 'tunnel', 'turbine', 'turnip', 'turtle',
  'tusk', 'twig', 'umbrella', 'valley', 'vanilla', 'vase', 'vault', 'velvet',
  'vine', 'violet', 'violin', 'volcano', 'wagon', 'walnut', 'walrus', 'wand',
  'wasp', 'watch', 'water', 'wave', 'weasel', 'well', 'whale', 'wharf',
  'wheat', 'wheel', 'whisk', 'willow', 'wind', 'window', 'wing', 'winter',
  'wolf', 'wombat', 'wood', 'wool', 'wren', 'yacht', 'yarn', 'yeast',
  'yogurt', 'zebra', 'zephyr', 'zinc',
];

export const newLinkPhrase = (): string =>
  Array.from({ length: 3 }, () => WORDS[randomInt(WORDS.length)]).join('-');

/** Case, spacing and separator don't matter: "House Dog  erratic" redeems `house-dog-erratic`. */
export const normalizePhrase = (raw: string): string =>
  raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');

export const hashPhrase = (raw: string): string =>
  createHash('sha256').update(normalizePhrase(raw)).digest('hex');

/**
 * Mint a fresh phrase for this identity, replacing any it already had — one
 * live code per identity keeps "did my old code die?" a non-question.
 */
export function mintLinkCode(db: Db, identityId: number): { phrase: string; expiresAt: string } {
  const now = Date.now();
  const expiresAt = new Date(now + LINK_CODE_TTL_MS).toISOString();
  const phrase = db.transaction(() => {
    db.prepare('DELETE FROM link_codes WHERE identity_id = ?').run(identityId);
    // The hash is UNIQUE across identities; on the off-chance of a collision
    // just roll again.
    for (;;) {
      const candidate = newLinkPhrase();
      try {
        db.prepare(
          'INSERT INTO link_codes (identity_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)',
        ).run(identityId, hashPhrase(candidate), new Date(now).toISOString(), expiresAt);
        return candidate;
      } catch (err) {
        if (!String(err).includes('UNIQUE')) throw err;
      }
    }
  })();
  return { phrase, expiresAt };
}

/**
 * Redeem a phrase: burns the code and hands back the identity it belongs to.
 * The caller sets that identity's token as the requester's cookie — adoption,
 * not merging. Undefined means wrong, expired, or already used.
 */
export function redeemLinkCode(db: Db, rawPhrase: string): IdentityRow | undefined {
  return db.transaction((): IdentityRow | undefined => {
    const row = db
      .prepare<[string, string], { id: number; identity_id: number }>(
        `SELECT id, identity_id FROM link_codes
          WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`,
      )
      .get(hashPhrase(rawPhrase), new Date().toISOString());
    if (!row) return undefined;
    db.prepare('UPDATE link_codes SET used_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      row.id,
    );
    return db
      .prepare<[number], IdentityRow>('SELECT * FROM identities WHERE id = ?')
      .get(row.identity_id);
  })();
}
