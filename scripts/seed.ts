/**
 * Creates the "DemoConf 2026" demo event used by local development.
 * Idempotent: re-running wipes and recreates the demo event only.
 *
 *   npm run seed
 *
 * Days default to today + tomorrow so the now-line and "happening now" filters
 * have something to point at. Override with SEED_START_DATE=YYYY-MM-DD.
 */
import { hashPassword } from '../server/src/auth.js';
import { loadConfig } from '../server/src/config.js';
import { openDb, type Db } from '../server/src/db.js';
import { newDisplayName, newIdentityToken } from '../server/src/identity.js';
import { localDate, zonedTimeToUtc } from '../server/src/shared/time.js';

const SLUG = 'democonf-2026';
const TIMEZONE = 'Europe/Berlin';
const PASSWORDS = { viewer: 'viewer2026', user: 'user2026', admin: 'admin2026' };

/** Small deterministic PRNG so a reseed produces the same demo schedule. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260101);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;

const ROOMS = [
  { name: 'Main Hall', description: 'Keynotes and plenaries', capacity: 300, openTrack: 0 },
  { name: 'Workshop A', description: 'Hands-on, bring a laptop', capacity: 60, openTrack: 0 },
  { name: 'Workshop B', description: 'Hands-on, bring a laptop', capacity: 60, openTrack: 0 },
  { name: 'Open Track', description: 'Grab a slot — anyone may schedule here', capacity: 40, openTrack: 1 },
];

const TAGS = [
  { name: 'AI', color: '#7C6FF0' },
  { name: 'Community', color: '#3AA981' },
  { name: 'Web', color: '#E2703A' },
  { name: 'Hardware', color: '#4A90D9' },
  { name: 'Beginner', color: '#C25FA3' },
  { name: 'Governance', color: '#8A8A5C' },
];

const OFFICIAL_TITLES = [
  'Opening keynote: schedules as commons',
  'What pretalx taught us about complexity',
  'Running an unconference without a spreadsheet',
  'SQLite in production, honestly',
  'Server-sent events beat websockets here',
  'Designing for a hallway on a phone',
  'Moderation without accounts',
  'The five-minute grid',
  'Accessible colour for tag systems',
  'Rate limiting a friendly crowd',
  'Backups you will actually test',
  'Deploying to one small VPS',
  'Anonymous identity, real names',
  'Drag and drop that respects the data',
  'Timezones: the short painful version',
  'Open tracks and who owns them',
  'Markdown, sanitised',
  'A schedule that survives a lost signal',
  'Consent and contribution',
  'What to log when nobody signs in',
  'Lightning talks: infrastructure',
  'Lightning talks: community',
  'Closing circle',
  'Post-conference notes, together',
  'Retrospective: what we would cut',
];

const OPEN_TITLES = [
  'Rust for people who like Python',
  'Repair café: bring broken things',
  'Quiet room: silent co-working',
  'Board game protocols',
  'How do we fund this?',
  'Cold brew and cold takes',
];

/** Speakers are real records now, so the demo gives them profiles worth reading. */
const SPEAKERS = [
  {
    name: 'Ada Lovelace',
    bio: 'Works on the analytical side of things. Happy to talk through **anything** on the notes below.',
    links: [{ label: 'Notes', url: 'https://example.org/ada' }],
  },
  {
    name: 'Grace Hopper',
    bio: 'Compilers, plain language, and a low tolerance for "we have always done it this way".',
    links: [{ label: 'Talks', url: 'https://example.org/grace' }],
  },
  { name: 'Alan Kay', bio: 'Interested in what the medium makes thinkable.', links: [] },
  {
    name: 'Barbara Liskov',
    bio: 'Abstraction, substitution, and why the interface is the promise.',
    links: [{ label: 'Papers', url: 'https://example.org/liskov' }],
  },
  { name: 'Radia Perlman', bio: 'Networks that heal themselves.', links: [] },
  { name: 'Jean Bartik', bio: 'Programmed the room-sized ones.', links: [] },
  { name: 'Karen Spärck Jones', bio: 'On weighting what matters in a pile of text.', links: [] },
  { name: 'Ken Thompson', bio: 'Small tools, composed.', links: [] },
];

const NOTES = [
  'Slides are up already, link below.',
  'Great point about the 5-minute grid — that is why drag feels calm.',
  'Room is warm, prop the door open.',
  'Recording is not happening, take notes.',
  'Follow-up session tomorrow in Open Track.',
  'Someone asked about backups — VACUUM INTO is the answer.',
];

const QUESTIONS = [
  'How does this handle two people editing the same session?',
  'Is there an export?',
  'What happens when the wifi drops mid-talk?',
  'Can attendees rename themselves after the fact?',
  'Why no accounts?',
];

const LINKS = [
  { body: 'Slides', url: 'https://example.org/slides' },
  { body: 'Repository', url: 'https://example.org/repo' },
  { body: 'Notes doc', url: 'https://example.org/notes' },
  { body: 'Related talk', url: 'https://example.org/talk' },
];

function createIdentity(db: Db, name?: string): number {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO identities (token, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
    )
    .run(newIdentityToken(), name ?? newDisplayName(), now, now);
  return Number(info.lastInsertRowid);
}

function main(): void {
  const config = loadConfig();
  const db = openDb(config.databasePath);
  const now = new Date().toISOString();

  const startDate = process.env.SEED_START_DATE ?? localDate(new Date(), TIMEZONE);
  const endParts = new Date(`${startDate}T12:00:00Z`);
  endParts.setUTCDate(endParts.getUTCDate() + 1);
  const endDate = endParts.toISOString().slice(0, 10);

  db.transaction(() => {
    // Wipe any previous demo event, leaving other events untouched.
    const prior = db.prepare<[string], { id: number }>('SELECT id FROM events WHERE slug = ?').get(SLUG);
    if (prior) {
      db.prepare('DELETE FROM session_tags WHERE session_id IN (SELECT id FROM sessions WHERE event_id = ?)').run(prior.id);
      db.prepare('DELETE FROM contributions WHERE session_id IN (SELECT id FROM sessions WHERE event_id = ?)').run(prior.id);
      db.prepare('DELETE FROM sessions WHERE event_id = ?').run(prior.id);
      db.prepare('DELETE FROM rooms WHERE event_id = ?').run(prior.id);
      db.prepare('DELETE FROM tags WHERE event_id = ?').run(prior.id);
      db.prepare('DELETE FROM roles WHERE event_id = ?').run(prior.id);
      db.prepare('DELETE FROM audit WHERE event_id = ?').run(prior.id);
      db.prepare('DELETE FROM events WHERE id = ?').run(prior.id);
    }

    const eventId = Number(
      db
        .prepare(
          `INSERT INTO events
            (slug, name, timezone, start_date, end_date, day_start_min, day_end_min,
             viewer_pw_hash, user_pw_hash, admin_pw_hash, archived, created_at)
           VALUES (?, ?, ?, ?, ?, 480, 1320, ?, ?, ?, 0, ?)`,
        )
        .run(
          SLUG,
          'DemoConf 2026',
          TIMEZONE,
          startDate,
          endDate,
          hashPassword(PASSWORDS.viewer),
          hashPassword(PASSWORDS.user),
          hashPassword(PASSWORDS.admin),
          now,
        ).lastInsertRowid,
    );

    const roomIds = ROOMS.map((room, i) =>
      Number(
        db
          .prepare(
            'INSERT INTO rooms (event_id, name, description, capacity, open_track, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(eventId, room.name, room.description, room.capacity, room.openTrack, i).lastInsertRowid,
      ),
    );
    const openRoomId = roomIds[ROOMS.findIndex((r) => r.openTrack === 1)] as number;

    const tagIds = TAGS.map((tag) =>
      Number(
        db
          .prepare('INSERT INTO tags (event_id, name, color) VALUES (?, ?, ?)')
          .run(eventId, tag.name, tag.color).lastInsertRowid,
      ),
    );

    const insertPerson = db.prepare(
      `INSERT INTO people (event_id, identity_id, name, bio, links, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    );
    const personIds = SPEAKERS.map((speaker) =>
      Number(
        insertPerson.run(
          eventId,
          speaker.name,
          speaker.bio,
          JSON.stringify(speaker.links),
          now,
          now,
        ).lastInsertRowid,
      ),
    );
    // A couple of sessions deliberately have no speaker at all.
    const speakerChoices: (number | null)[] = [...personIds, null, null];

    const organiser = createIdentity(db, 'programme_team');
    const attendees = [organiser, ...Array.from({ length: 5 }, () => createIdentity(db))];
    db.prepare(
      'INSERT INTO roles (identity_id, event_id, role, granted_at) VALUES (?, ?, ?, ?)',
    ).run(organiser, eventId, 'admin', now);

    const days = [startDate, endDate];
    const insertSession = db.prepare(
      `INSERT INTO sessions
        (event_id, room_id, type, title, description, speaker, speaker_id, starts_at, ends_at,
         created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`,
    );
    const insertSessionTag = db.prepare(
      'INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)',
    );

    const sessionIds: number[] = [];

    // Official sessions: fill the three fixed rooms on a tidy grid.
    const officialRooms = roomIds.filter((id) => id !== openRoomId);
    let titleIndex = 0;
    for (const day of days) {
      for (const roomId of officialRooms) {
        let minute = 9 * 60;
        while (minute < 17 * 60 && titleIndex < OFFICIAL_TITLES.length) {
          const durationMin = pick([45, 60, 60, 90]);
          const startsAt = zonedTimeToUtc(day, minute, TIMEZONE);
          const endsAt = zonedTimeToUtc(day, minute + durationMin, TIMEZONE);
          const id = Number(
            insertSession.run(
              eventId,
              roomId,
              'official',
              OFFICIAL_TITLES[titleIndex],
              'A short description of the session. Written in **markdown**, rendered safely.',
              pick(speakerChoices),
              startsAt.toISOString(),
              endsAt.toISOString(),
              organiser,
              now,
              now,
            ).lastInsertRowid,
          );
          sessionIds.push(id);
          titleIndex++;
          for (const tagId of new Set([pick(tagIds), pick(tagIds)])) insertSessionTag.run(id, tagId);
          // A break between sessions, rounded to the 5-minute grid.
          minute += durationMin + pick([15, 30]);
        }
      }
    }

    // Open sessions: attendee-created, in the open track only.
    OPEN_TITLES.forEach((title, i) => {
      const day = days[i % days.length] as string;
      const minute = 10 * 60 + i * 75;
      const startsAt = zonedTimeToUtc(day, minute, TIMEZONE);
      const endsAt = zonedTimeToUtc(day, minute + 45, TIMEZONE);
      const author = attendees[1 + (i % (attendees.length - 1))] as number;
      const id = Number(
        insertSession.run(
          eventId,
          openRoomId,
          'open',
          title,
          'Proposed on the day. Turn up, or do not.',
          null,
          startsAt.toISOString(),
          endsAt.toISOString(),
          author,
          now,
          now,
        ).lastInsertRowid,
      );
      sessionIds.push(id);
      insertSessionTag.run(id, pick(tagIds));
      db.prepare(
        `INSERT INTO roles (identity_id, event_id, role, granted_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(identity_id, event_id) DO NOTHING`,
      ).run(author, eventId, 'user', now);
    });

    const insertContribution = db.prepare(
      `INSERT INTO contributions (session_id, kind, body, url, created_by, created_at, hidden)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    );
    for (let i = 0; i < 30; i++) {
      const sessionId = pick(sessionIds);
      const author = pick(attendees);
      const roll = rand();
      if (roll < 0.45) {
        insertContribution.run(sessionId, 'note', pick(NOTES), null, author, now);
      } else if (roll < 0.8) {
        insertContribution.run(sessionId, 'question', pick(QUESTIONS), null, author, now);
      } else {
        const link = pick(LINKS);
        insertContribution.run(sessionId, 'link', link.body, link.url, author, now);
      }
    }

    console.log(`Seeded "${SLUG}" — ${sessionIds.length} sessions, ${days.length} days`);
  })();

  db.close();
  console.log(`Database: ${config.databasePath}`);
  console.log(`Open:     http://localhost:${config.port}/e/${SLUG}`);
  console.log(
    `Passwords: viewer=${PASSWORDS.viewer}  user=${PASSWORDS.user}  admin=${PASSWORDS.admin}`,
  );
}

main();
