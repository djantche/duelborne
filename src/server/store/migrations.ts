// Migrations de la base, dans l'ordre. Une migration déjà publiée ne se modifie jamais : on en ajoute une nouvelle.
// Chaque migration s'exécute dans une transaction ; avant la première d'un lot, la base est sauvegardée (database.ts).
import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number
  name: string
  up(db: DatabaseSync): void
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'comptes-et-decks',
    up(db) {
      db.exec(`
        -- Un compte. L'identifiant est stable ; le nom public peut changer, il reste unique (sans tenir compte des majuscules).
        CREATE TABLE users (
          id            TEXT PRIMARY KEY,
          username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
          display_name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          prefs         TEXT NOT NULL DEFAULT '{}',
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL
        );

        -- Sessions de connexion : seul l'empreinte du jeton est gardée, jamais le jeton lui-même.
        CREATE TABLE auth_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          last_seen  INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER,
          agent      TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

        -- Decks des joueurs. user_id NULL : deck d'avant les comptes, en attente d'être récupéré par un compte.
        CREATE TABLE decks (
          id         TEXT PRIMARY KEY,
          user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          series     TEXT NOT NULL,
          cover      INTEGER NOT NULL DEFAULT 0,
          main       TEXT NOT NULL,
          extra      TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_decks_user ON decks(user_id);
        CREATE UNIQUE INDEX idx_decks_owner_name ON decks(user_id, name COLLATE NOCASE) WHERE user_id IS NOT NULL;
        CREATE UNIQUE INDEX idx_decks_orphan_name ON decks(name COLLATE NOCASE) WHERE user_id IS NULL;

        -- Petites valeurs du serveur (ex. : migration des anciens decks déjà faite).
        CREATE TABLE app_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)
    },
  },
  {
    version: 2,
    name: 'historique-des-duels',
    up(db) {
      db.exec(`
        -- Un duel terminé. meta : format, défi, réglages (public, aussi présent dans le replay).
        -- record : graine du moteur, cartes dans l'ordre mélangé et réponses données. Il contient les Decks : jamais envoyé aux clients.
        CREATE TABLE duels (
          id            TEXT PRIMARY KEY,
          started_at    INTEGER NOT NULL,
          ended_at      INTEGER NOT NULL,
          mode          TEXT NOT NULL,
          format        TEXT NOT NULL,
          challenge     TEXT NOT NULL,
          winner        TEXT NOT NULL,
          meta          TEXT NOT NULL,
          record        TEXT NOT NULL,
          tournament_id TEXT,
          match_id      TEXT
        );
        CREATE INDEX idx_duels_ended ON duels(ended_at);

        CREATE TABLE duel_players (
          duel_id   TEXT NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
          place     INTEGER NOT NULL,
          team      INTEGER NOT NULL,
          user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
          name      TEXT NOT NULL,
          bot       INTEGER NOT NULL,
          deck_name TEXT NOT NULL,
          result    TEXT NOT NULL,
          PRIMARY KEY (duel_id, place)
        );
        CREATE INDEX idx_duel_players_user ON duel_players(user_id, duel_id);
      `)
    },
  },
  {
    version: 3,
    name: 'tournois-prives',
    up(db) {
      db.exec(`
        CREATE TABLE tournaments (
          id            TEXT PRIMARY KEY,
          owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name          TEXT NOT NULL,
          code          TEXT NOT NULL UNIQUE,
          kind          TEXT NOT NULL,
          format        TEXT NOT NULL,
          settings      TEXT NOT NULL,
          state         TEXT NOT NULL,
          max_players   INTEGER NOT NULL,
          rounds        INTEGER NOT NULL DEFAULT 0,
          current_round INTEGER NOT NULL DEFAULT 0,
          created_at    INTEGER NOT NULL,
          started_at    INTEGER,
          finished_at   INTEGER
        );
        CREATE INDEX idx_tournaments_owner ON tournaments(owner_id);

        -- Un inscrit. Le deck est copié à l'inscription : il ne change plus pendant le tournoi.
        CREATE TABLE tournament_players (
          tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
          user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name          TEXT NOT NULL,
          deck_name     TEXT NOT NULL,
          deck_series   TEXT NOT NULL,
          deck_cover    INTEGER NOT NULL DEFAULT 0,
          deck_main     TEXT NOT NULL,
          deck_extra    TEXT NOT NULL,
          seed          INTEGER,
          joined_at     INTEGER NOT NULL,
          PRIMARY KEY (tournament_id, user_id)
        );
        CREATE INDEX idx_tournament_players_user ON tournament_players(user_id);

        -- Un match. Les joueurs sont des identifiants de compte (sans clé : un compte supprimé ne casse pas un tournoi terminé).
        CREATE TABLE tournament_matches (
          id            TEXT PRIMARY KEY,
          tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
          round         INTEGER NOT NULL,
          slot          INTEGER NOT NULL,
          a_user        TEXT,
          b_user        TEXT,
          state         TEXT NOT NULL,
          winner        TEXT,
          result        TEXT,
          draws         INTEGER NOT NULL DEFAULT 0,
          duel_id       TEXT,
          finished_at   INTEGER,
          UNIQUE (tournament_id, round, slot)
        );
        CREATE INDEX idx_tournament_matches_t ON tournament_matches(tournament_id);
      `)
    },
  },
  {
    version: 4,
    name: 'tournois-solo',
    up(db) {
      db.exec(`
        ALTER TABLE tournaments ADD COLUMN mode TEXT NOT NULL DEFAULT 'friends';
        ALTER TABLE tournaments ADD COLUMN ai_level TEXT NOT NULL DEFAULT 'normal';
        -- Les ordinateurs sont des participants de tournoi, sans faux compte utilisateur.
        CREATE TABLE tournament_bots (
          tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
          user_id       TEXT NOT NULL,
          name          TEXT NOT NULL,
          deck_name     TEXT NOT NULL,
          deck_series   TEXT NOT NULL,
          deck_cover    INTEGER NOT NULL DEFAULT 0,
          deck_main     TEXT NOT NULL,
          deck_extra    TEXT NOT NULL,
          seed          INTEGER,
          joined_at     INTEGER NOT NULL,
          ai_level      TEXT NOT NULL,
          PRIMARY KEY (tournament_id, user_id)
        );
      `)
    },
  },
  {
    version: 5,
    name: 'tournois-series',
    up(db) {
      db.exec(`
        -- Match au meilleur de 3 ou 5 : duels gagnés par chaque côté.
        ALTER TABLE tournament_matches ADD COLUMN score_a INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE tournament_matches ADD COLUMN score_b INTEGER NOT NULL DEFAULT 0;
      `)
    },
  },
]
