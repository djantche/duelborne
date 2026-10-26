# Duelborne — consignes pour les agents

Duelborne est un jeu de duel de cartes jouable dans le navigateur, en réseau local ou contre l'ordinateur.
Un serveur Node fait tourner le moteur de règles ocgcore (WebAssembly) ; le client est une application web Preact.

## Travailler ici

- Répondre en français. Pour un long chantier, donner des points d'avancement courts.
- Lire l'état Git avant de modifier. Ne jamais annuler ni écraser un travail en cours sans accord.
- Faire seulement ce qui est demandé ; signaler ce qui a été vérifié et ce qui reste à essayer en jeu.
- Commit et push uniquement sur demande. Un « checkpoint » demandé se fait avant le chantier.
- Pas de nouvelle dépendance sans besoin réel et justifié.

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/shared/` | protocole, formats et messages communs ; ni DOM ni Node |
| `src/server/` | serveur HTTP/WebSocket, salles, moteur (`ocg/`), IA (`ai/`), comptes, tournois, replays |
| `src/client/app/` | état global, réseau, navigation, stockage |
| `src/client/screens/` | écrans ; la logique du duel est dans `screens/duel/` |
| `src/client/ui/` | composants réutilisables (boutons, icônes, fenêtres, cartes) |
| `src/client/styles/` | feuilles de style, une par sujet |
| `src/client/locales/` | traductions `fr.json` et `en.json` |
| `vendor/ocgcore/` | enveloppe du moteur, modifiée sur place (repères `[duelborne]`) |
| `scripts/`, `tools/` | récupération des données, decks fournis, outils de développement |

Un fichier = une responsabilité. Extraire données et fonctions quand un écran mélange plusieurs systèmes.

## Données et droits

- `data/` (cartes, images, scripts d'effets, sons) n'est jamais versionné : `npm run restore-data` le recrée.
- Ne jamais ajouter au dépôt d'images de cartes, de musiques ou de ressources d'autres jeux.
- Aucune marque de Konami dans l'identité du jeu (nom, logo, textes de présentation).

## Règles du code

- Le serveur fait autorité : client et IA choisissent parmi les actions légales envoyées par le moteur.
- L'IA n'utilise que ce qu'elle a le droit de savoir ; jamais les cartes cachées.
- Le protocole évolue de façon compatible : nouveaux champs facultatifs, anciens replays toujours lisibles.
- Tout texte visible ou libellé accessible a une clé dans `fr.json` **et** `en.json`. `t()` pour l'interface,
  `tx()` pour les messages du serveur ; pas de phrases assemblées à la main.
- Accessibilité : clavier et toucher, libellés, focus visible, réduction des mouvements respectée.
  Pas d'`alert`/`confirm`/`prompt` : utiliser les fenêtres de l'application.
- Une mise à jour du duel ne ferme pas ce que le joueur consulte (fiche, journal, pile).
- Les animations utilisent le temps écoulé et s'arrêtent proprement quand l'écran change.
- Le duel doit tenir à l'écran, du téléphone en paysage au grand écran.
- Suivre le style du fichier voisin : noms, commentaires (en français), densité.

## Vérifier

```sh
npm run typecheck
npm run build
git diff --check
```

Ne pas ajouter ni lancer de tests sans demande. La compilation ne prouve pas qu'un écran fonctionne :
ne pas annoncer une vérification visuelle qui n'a pas été faite (`tools/visual/` permet de la faire).
