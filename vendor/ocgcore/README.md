# vendor/ocgcore

Enveloppe TypeScript autour du moteur de règles **ocgcore** (celui d'EDOPro, Project Ignis),
compilé en WebAssembly. C'est une dépendance interne du projet : on la modifie ici directement.

## Origine

- Enveloppe : [`ocgcore-wasm` 0.1.2](https://github.com/n1xx1/ocgcore-wasm) par n1xx1, licence MIT.
  Les sources de `src/` viennent des source maps du paquet publié ; `src/types.ts`, qui ne produisait
  aucun code, a été reconstitué à partir des déclarations publiées.
- Moteur : [`edo9300/ygopro-core`](https://github.com/edo9300/ygopro-core), licence AGPL-3.0.
  `lib/ocgcore.sync.mjs` et `lib/ocgcore.sync.wasm` sont les binaires fournis par `ocgcore-wasm`,
  non modifiés.

## Nos modifications (repérées par `[duelborne]` dans le code)

1. `src/data.ts` — l'échelle Pendule droite et les flèches Lien étaient écrites 4 octets trop loin
   dans la structure `OCG_CardData`. Le moteur lisait une échelle droite à 0 : aucune Invocation
   Pendule n'était proposée.
2. `src/queries.ts` — le champ `TYPE` d'une requête de carte n'était pas lu et les champs inconnus
   n'étaient pas sautés, ce qui décalait toute la suite de la réponse.
3. `src/index.ts` — seule la variante synchrone du moteur est embarquée (la variante JSPI est
   retirée) et le binaire wasm est lu sur disque au lieu d'être inclus dans le bundle.
4. `src/messages.ts` — le message `MOVE` expose maintenant `reason` (destruction, Tribut, défausse…),
   que le moteur envoyait déjà mais qui n'était pas lu.
5. `src/messages.ts` — dans `SELECT_SUM`, les listes `selects_must` et `selects` étaient inversées.
6. `src/type_message.ts` — `OcgFieldPlayer.lp` était lu mais absent du type.
7. `src/queries.ts` — les LP étaient lus comme un entier non signé : un joueur tombé sous zéro
   affichait plus de 4 milliards de LP.
8. `src/queries.ts` — dans les compteurs d'une carte, le type et le nombre étaient lus dans le mauvais ordre
   (un Compteur Parchemin ×2 devenait « 37 compteurs de type 2 »).

## Reconstruire

```bash
npm run build:ocgcore
```

`dist/` (bundle + types) est versionné : la reconstruction n'est nécessaire qu'après une
modification de `src/`.
9. `src/messages.ts` — `SHUFFLE_SET_CARD` : nombre de cartes sur 1 octet, anciennes places puis nouvelles places
   (la lecture en paires levait « eof » et faisait tomber le duel).
10. `src/index.ts` — un message mal lu est signalé (avec ses octets) et ignoré au lieu de faire tomber le duel.
11. `src/messages.ts` — `SELECT_SUM` : la position de chaque carte précède sa valeur (4 octets de plus par entrée) ;
    `ANNOUNCE_ATTRIB` : masque sur 4 octets. Un message qui n'est pas lu jusqu'au dernier octet est signalé une fois par type.
12. `src/responses.ts` — réponse `SORT_CARD` : sans nombre de cartes devant la liste des rangs (le moteur lisait ce nombre comme un rang).
