// Bac à sable : une carte spéciale, la Console, posée face recto sur le terrain de chaque joueur. Ses effets sont de
// vrais scripts du moteur : ajouter n'importe quelle carte, créer des jetons, lancer des dés et des pièces, modifier les
// LP, détruire, bannir, poser des compteurs... Tout passe par le moteur, donc par les mêmes messages, les mêmes
// animations et les mêmes questions que dans un vrai duel.

import { raw } from '../../shared/msg.ts'
import { summonAssets } from '../assets/summons.ts'
import { TYPE, cardData } from './data.ts'

/** Passeport de la Console (au-dessus des codes de cartes réels). */
export const CONSOLE_CODE = 3900000001
export const CONSOLE_NAME = 'Console du bac à sable'
export const CONSOLE_NAME_EN = 'Sandbox Console'
export const CONSOLE_TEXT_FR =
  'Carte du bac à sable. Une fois par Main Phase (autant de fois que tu veux) : tu peux ajouter n’importe quelle carte, créer des jetons, lancer des dés ou des pièces, modifier les LP, déplacer ou détruire une carte, poser des compteurs, tester des chaînes ou des fusions, lancer un test du moteur ou jouer une scène de victoire.'
export const CONSOLE_TEXT_EN =
  'Sandbox card. Once per Main Phase (as many times as you like): you can add any card, create Tokens, roll dice or flip coins, change LP, move or destroy a card, place Counters, try chains or Fusion Summons, run an engine test, or play a victory scene.'
/** Nom et texte de la Console, en références « @= » que le client traduit. */
export const CONSOLE_NAME_REF = raw(CONSOLE_NAME, CONSOLE_NAME_EN)
export const CONSOLE_TEXT = raw(CONSOLE_TEXT_FR, CONSOLE_TEXT_EN)

/** Textes des menus, en [français, anglais]. Le rang dans cette liste est le numéro de description utilisé par le script Lua. */
const LABELS = {
  title: ['Ouvrir la Console', 'Open the Console'],
  // menus et leurs titres
  main: ['Console : que veux-tu faire ?', 'Console: what do you want to do?'],
  who: ['Pour qui ?', 'For whom?'],
  where: ['Où mettre la carte ?', 'Where to put the card?'],
  howmany: ['Combien ?', 'How many?'],
  tokenwhich: ['Quel jeton ?', 'Which Token?'],
  lpkind: ['Quels points de vie ?', 'Which Life Points?'],
  cardact: ['Que faire de cette carte ?', 'What to do with this card?'],
  counterkind: ['Quel compteur ?', 'Which Counter?'],
  tests: ['Tests du moteur', 'Engine tests'],
  shufflewhat: ['Mélanger quoi ?', 'Shuffle what?'],
  // actions du menu principal
  add: ['Ajouter une carte (n’importe laquelle)', 'Add a card (any card)'],
  token: ['Créer des jetons', 'Create Tokens'],
  dice: ['Lancer des dés', 'Roll dice'],
  coin: ['Lancer des pièces', 'Flip coins'],
  lp: ['Modifier les points de vie', 'Change Life Points'],
  draw: ['Piocher des cartes', 'Draw cards'],
  shuffle: ['Mélanger', 'Shuffle'],
  cardop: ['Agir sur une carte (détruire, bannir, compteur...)', 'Act on a card (destroy, banish, counter...)'],
  testmenu: ['Tests du moteur (questions rares)', 'Engine tests (rare questions)'],
  victory: ['Scène de victoire (jouer la fin du duel)', 'Victory scene (play the end of the duel)'],
  victorykind: ['Quelle victoire ?', 'Which victory?'],
  v_exodia: ['Victoire d’Exodia (les cinq pièces en main)', 'Exodia victory (the five pieces in hand)'],
  v_battle: ['Préparer un coup fatal : à toi d’attaquer', 'Set up a lethal strike: you attack'],
  v_effect: ['Dégâts fatals par un effet', 'Lethal damage by an effect'],
  // pour qui
  me: ['Pour moi', 'For me'],
  foe: ['Pour l’adversaire', 'For the opponent'],
  // où
  w_hand: ['Dans la main', 'To the hand'],
  w_field: ['Sur le terrain', 'To the field'],
  w_grave: ['Au Cimetière', 'To the Graveyard'],
  w_banish: ['Bannie', 'Banished'],
  w_deck: ['Sur le Deck', 'On the Deck'],
  // jetons
  t_sheep: ['Jeton Mouton (0/0)', 'Sheep Token (0/0)'],
  t_ojama: ['Jeton Ojama (0/1000)', 'Ojama Token (0/1000)'],
  t_other: ['Un autre jeton (je choisis)', 'Another Token (I choose)'],
  // LP
  lp_damage: ['Infliger des dommages', 'Inflict damage'],
  lp_gain: ['Gagner des LP', 'Gain LP'],
  lp_set: ['Fixer les LP à…', 'Set LP to...'],
  howmuch: ['Combien de points ?', 'How many points?'],
  // mélange
  sh_deck: ['Le Deck', 'The Deck'],
  sh_hand: ['La main', 'The hand'],
  // actions sur une carte
  c_destroy: ['Les détruire', 'Destroy them'],
  c_grave: ['Les envoyer au Cimetière', 'Send them to the Graveyard'],
  c_banish: ['Les bannir', 'Banish them'],
  c_hand: ['Les renvoyer en main', 'Return them to the hand'],
  c_deck: ['Les renvoyer sur le Deck', 'Return them to the Deck'],
  c_flip: ['Changer leur position', 'Change their position'],
  c_counter: ['Poser un compteur sur chacune', 'Place a Counter on each'],
  c_control: ['Prendre ou rendre le contrôle', 'Take or give back control'],
  c_boost: ['Augmenter leur ATK de 1000', 'Increase their ATK by 1000'],
  // compteurs
  k_spell: ['Compteur Magique', 'Spell Counter'],
  k_chronicle: ['Compteur Parchemin', 'Chronicle Counter'],
  k_clock: ['Compteur Horloge', 'Clock Counter'],
  // tests
  tt_rps: ['Pierre-feuille-ciseaux', 'Rock-Paper-Scissors'],
  tt_race: ['Déclarer un Type', 'Declare a Type'],
  tt_attr: ['Déclarer un Attribut', 'Declare an Attribute'],
  tt_sort: ['Ordonner le dessus du Deck (3 cartes)', 'Order the top of the Deck (3 cards)'],
  tt_rmcounter: ['Retirer 2 Compteurs Magiques du terrain', 'Remove 2 Spell Counters from the field'],
  tt_disfield: ['Désactiver une Zone Monstre', 'Disable a Monster Zone'],
  tt_reveal: ['Révéler le dessus du Deck', 'Reveal the top of the Deck'],
  tt_number: ['Déclarer un nombre', 'Declare a number'],
  tt_sumeq: ['Somme de Niveaux exacte, 1re carte imposée', 'Exact Level sum, 1st card imposed'],
  tt_sumge: ['Somme de Niveaux d’au moins 4, 1re carte imposée', 'Level sum of at least 4, 1st card imposed'],
  // invites
  pickcard: ['Déclare la carte à ajouter', 'Declare the card to add'],
  pickonfield: ['Choisis les cartes concernées', 'Choose the cards concerned'],
  pickzone: ['Choisis la Zone Monstre à désactiver', 'Choose the Monster Zone to disable'],
  rps_win: ['Pierre-feuille-ciseaux : tu gagnes !', 'Rock-Paper-Scissors: you win!'],
  rps_lose: ['Pierre-feuille-ciseaux : l’adversaire gagne.', 'Rock-Paper-Scissors: the opponent wins.'],
  disabled: ['Cette zone est désactivée jusqu’à la fin du tour.', 'This zone is disabled until the end of the turn.'],
  pos: ['Choisis la nouvelle position', 'Choose the new position'],
  one: ['1', '1'],
  two: ['2', '2'],
  three: ['3', '3'],
  five: ['5', '5'],
  // Ajoutés à la fin pour préserver les numéros de description des menus existants.
  chain_menu: ['Tester des chaînes', 'Try chains'],
  chain_kind: ['Quelle chaîne veux-tu observer ?', 'Which chain would you like to watch?'],
  chain_one: ['1 maillon : gagner 300 LP', '1 link: gain 300 LP'],
  chain_two: ['2 maillons : pioche et LP', '2 links: draw and LP'],
  chain_three: ['3 maillons : ATK, pioche et LP', '3 links: ATK, draw and LP'],
  chain_negate: ['3 maillons : annuler la pioche', '3 links: negate the draw'],
  chain_full: ['Il faut une Zone Monstre libre chez l’adversaire et jusqu’à deux chez toi. Libère les zones puis réessaie.', 'You need a free Monster Zone on the opponent’s field and up to two on yours. Free the zones and try again.'],
  chain_ready: ['Place les monstres d’essai dans les zones libres : leur chaîne se lancera automatiquement. Leurs effets d’essai durent jusqu’à la fin du tour.', 'Place the demonstration monsters in free zones: their chain will start automatically. Their demonstration effects last until the end of the turn.'],
  chain_recover: ['Essai de chaîne : gagner 300 LP', 'Chain demonstration: gain 300 LP'],
  chain_draw: ['Essai de chaîne : piocher une carte', 'Chain demonstration: draw a card'],
  chain_boost: ['Essai de chaîne : gagner 300 ATK', 'Chain demonstration: gain 300 ATK'],
  chain_cancel: ['Essai de chaîne : annuler le maillon précédent', 'Chain demonstration: negate the previous link'],
  fusion_menu: ['Tester des fusions', 'Try Fusion Summons'],
  fusion_kind: ['Quelle Fusion veux-tu observer ?', 'Which Fusion Summon would you like to watch?'],
  fusion_two: ['2 matériaux : Dragon Jumelé d’Explosion aux Yeux Bleus', '2 materials: Blue-Eyes Twin Burst Dragon'],
  fusion_three: ['3 matériaux : Dragon Ultime aux Yeux Bleus', '3 materials: Blue-Eyes Ultimate Dragon'],
  fusion_full: ['Libère une Zone Monstre pour invoquer le monstre Fusion.', 'Free a Monster Zone for the Fusion Monster.'],
  chain_ten: ['10 maillons : une longue chaîne à deux joueurs', '10 links: a long chain between both players'],
  chain_ten_full: ['Il faut une Zone Monstre libre chez toi pour lancer la chaîne de 10 maillons. Libère-la puis réessaie.', 'You need a free Monster Zone to start the 10-link chain. Free it and try again.'],
  summon_menu: ['Tester les illustrations d’invocation', 'Try summon illustrations'],
  summon_pick: ['Choisis un monstre avec une illustration téléchargée', 'Choose a monster with a downloaded illustration'],
  summon_unavailable: ['Aucune illustration d’invocation disponible. Télécharge les images Master Duel, puis relance le bac à sable.', 'No summon illustrations available. Download the Master Duel images, then restart the sandbox.'],
  summon_full: ['Il n’y a pas de zone libre pour cette carte.', 'There is no free zone for this card.'],
  cards_scope: ['Sur les cartes de qui veux-tu agir ?', 'Whose cards do you want to act on?'],
  cards_both: ['Les deux joueurs', 'Both players'],
  cards_area: ['Dans quelles zones ?', 'In which zones?'],
  cards_all: ['Le terrain, les mains, les Cimetières et les cartes bannies', 'Fields, hands, Graveyards and banished cards'],
  cards_field: ['Le terrain', 'The field'],
  cards_hand: ['La main', 'The hand'],
  cards_grave: ['Le Cimetière', 'The Graveyard'],
  cards_banish: ['Les cartes bannies', 'Banished cards'],
  cards_deck: ['Le Deck', 'The Deck'],
  cards_extra: ['L’Extra Deck', 'The Extra Deck'],
  cards_count: ['Combien de cartes sélectionner ? (0 : choix libre)', 'How many cards to select? (0: free selection)'],
  cards_empty: ['Aucune carte dans les zones choisies.', 'No cards in the chosen zones.'],
  cards_action: ['Agir sur des cartes (nombre et zones au choix)', 'Act on cards (choose count and zones)'],
} as const

type Key = keyof typeof LABELS
export const CONSOLE_MAIN_REF = raw(...LABELS.main)
const KEYS = Object.keys(LABELS) as Key[]
/** Les nouveaux menus utilisent les mêmes clés de traduction que le client. Les anciennes descriptions restent compatibles. */
export const CONSOLE_MESSAGE_KEYS = new Map(KEYS.flatMap((key, index) => /^(chain_|fusion_|summon_|cards_)/.test(key) ? [[index, `sandbox.${key}`] as const] : []))

/** Textes de la Console, dans l'ordre de leurs numéros de description. */
export const CONSOLE_STRINGS_FR: string[] = KEYS.map((k) => LABELS[k][0])
export const CONSOLE_STRINGS_EN: string[] = KEYS.map((k) => LABELS[k][1])

/** Script Lua de la Console. */
export function consoleScript(): string {
  const index = KEYS.map((k, i) => `${k}=${i}`).join(',')
  // Mêmes monstres que la présentation du client : Niveau ou Rang 5 et plus, Lien 3 et plus.
  const illustrated = (id: number): boolean => { const c = cardData(id); return !!c && c.level >= ((c.type & TYPE.LINK) ? 3 : 5) }
  const illustrations = Object.entries(summonAssets()).filter(([, value]) => value.image).map(([id]) => Number(id)).filter((id) => Number.isSafeInteger(id) && id > 0 && illustrated(id))
  return `-- Console du bac à sable (générée par src/server/ocg/sandbox.ts)
local s,id=GetID()
local L={${index}}
local summonCodes={${illustrations.join(',')}}

function s.initial_effect(c)
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,L.title))
	e1:SetType(EFFECT_TYPE_IGNITION)
	e1:SetRange(LOCATION_SZONE)
	e1:SetOperation(s.operation)
	c:RegisterEffect(e1)
end

-- Menu : un titre, puis des choix (rendus 1, 2, 3...).
function s.menu(tp,title,...)
	Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L[title]))
	local opts={}
	for _,k in ipairs({...}) do table.insert(opts,aux.Stringid(id,L[k])) end
	return Duel.SelectOption(tp,table.unpack(opts))+1
end

function s.who(tp)
	return s.menu(tp,'who','me','foe')==1 and tp or 1-tp
end

function s.number(tp,title,...)
	Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L[title]))
	return Duel.AnnounceNumber(tp,...)
end

function s.quantity(tp,title,max,free)
	local numbers={}
	if free then table.insert(numbers,0) end
	for i=1,math.min(max,99) do table.insert(numbers,i) end
	if max>99 then table.insert(numbers,max) end
	return s.number(tp,title,table.unpack(numbers))
end

function s.operation(e,tp,eg,ep,ev,re,r,rp)
	local pick=s.menu(tp,'main','add','token','dice','coin','lp','draw','shuffle','cards_action','testmenu','victory','chain_menu','fusion_menu','summon_menu')
	if pick==1 then s.add(tp)
	elseif pick==2 then s.token(tp)
	elseif pick==3 then Duel.TossDice(tp,s.menu(tp,'howmany','one','two','three'))
	elseif pick==4 then Duel.TossCoin(tp,s.menu(tp,'howmany','one','two','three'))
	elseif pick==5 then s.lp(tp)
	elseif pick==6 then Duel.Draw(s.who(tp),s.number(tp,'howmany',1,2,3,5),REASON_EFFECT)
	elseif pick==7 then s.shuffle(tp)
	elseif pick==8 then s.cardop(e,tp)
	elseif pick==9 then s.tests(e,tp)
	elseif pick==10 then s.victory(tp)
	elseif pick==11 then s.chains(e,tp)
	elseif pick==12 then s.fusions(e,tp)
	else s.summons(tp) end
end

-- Mise sur le terrain d'une carte créée : monstre, Magie de Terrain ou autre Magie/Piège.
function s.tofield(tc,p)
	if tc:IsType(TYPE_MONSTER) then
		Duel.SpecialSummon(tc,0,p,p,true,true,POS_FACEUP_ATTACK)
	elseif tc:IsType(TYPE_FIELD) then
		Duel.MoveToField(tc,p,p,LOCATION_FZONE,POS_FACEUP,true)
	else
		Duel.MoveToField(tc,p,p,LOCATION_SZONE,POS_FACEUP,true)
	end
end

function s.add(tp)
	local p=s.who(tp)
	Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L.pickcard))
	local code=Duel.AnnounceCard(tp)
	local where=s.menu(tp,'where','w_hand','w_field','w_grave','w_banish','w_deck')
	local tc=Duel.CreateToken(p,code)
	local max=10
	if where==2 then
		max=tc:IsType(TYPE_MONSTER) and Duel.GetLocationCount(p,LOCATION_MZONE) or tc:IsType(TYPE_FIELD) and 1 or Duel.GetLocationCount(p,LOCATION_SZONE)
	end
	if max<=0 then Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.summon_full)) return end
	local count=s.quantity(tp,'howmany',max,false)
	for i=1,count do
		local card=i==1 and tc or Duel.CreateToken(p,code)
		if where==1 then Duel.SendtoHand(card,p,REASON_EFFECT)
		elseif where==2 then s.tofield(card,p)
		elseif where==3 then Duel.SendtoGrave(card,REASON_EFFECT)
		elseif where==4 then Duel.Remove(card,POS_FACEUP,REASON_EFFECT)
		else Duel.SendtoDeck(card,p,SEQ_DECKTOP,REASON_EFFECT) end
	end
end

-- Même chemin moteur qu'une invocation réelle, avec choix du monstre, du joueur et du nombre d'exemplaires.
function s.summons(tp)
	if #summonCodes==0 then Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.summon_unavailable)) return end
	local p=s.who(tp)
	local max=Duel.GetLocationCount(p,LOCATION_MZONE)
	if max<=0 then Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.summon_full)) return end
	Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L.summon_pick))
	-- Le serveur restreint cette recherche aux illustrations locales ; le Lua vérifie aussi le Type Monstre.
	-- Une longue liste de OPCODE_ISCODE dépasserait la limite d'un octet du protocole du moteur.
	local code=Duel.AnnounceCard(tp,TYPE_MONSTER,OPCODE_ISTYPE,OPCODE_ALLOW_TOKENS,OPCODE_ALLOW_ALIASES)
	local count=s.quantity(tp,'howmany',max,false)
	local sample=Duel.CreateToken(p,code)
	if not sample:IsType(TYPE_MONSTER) then return end
	Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L.pos))
	local pos=Duel.SelectPosition(tp,sample,POS_FACEUP_ATTACK+POS_FACEUP_DEFENSE)
	for i=1,count do
		local card=i==1 and sample or Duel.CreateToken(p,code)
		Duel.SpecialSummon(card,0,p,p,true,true,pos)
	end
end

function s.token(tp)
	local p=s.who(tp)
	local which=s.menu(tp,'tokenwhich','t_sheep','t_ojama','t_other')
	local code=73915052
	if which==2 then code=29843092
	elseif which==3 then
		Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L.pickcard))
		code=Duel.AnnounceCard(tp,TYPE_TOKEN,OPCODE_ISTYPE,OPCODE_ALLOW_TOKENS)
	end
	local n=s.number(tp,'howmany',1,2,3,5)
	for i=1,n do
		if Duel.GetLocationCount(p,LOCATION_MZONE)<=0 then break end
		local tk=Duel.CreateToken(p,code)
		Duel.SpecialSummon(tk,0,p,p,true,true,POS_FACEUP_ATTACK)
	end
end

function s.lp(tp)
	local p=s.who(tp)
	local kind=s.menu(tp,'lpkind','lp_damage','lp_gain','lp_set')
	local v=s.number(tp,'howmuch',100,500,1000,2000,4000,8000)
	if kind==1 then Duel.Damage(p,v,REASON_EFFECT)
	elseif kind==2 then Duel.Recover(p,v,REASON_EFFECT)
	else Duel.SetLP(p,v) end
end

function s.shuffle(tp)
	local p=s.who(tp)
	if s.menu(tp,'shufflewhat','sh_deck','sh_hand')==1 then Duel.ShuffleDeck(p) else Duel.ShuffleHand(p) end
end

function s.cardop(e,tp)
	local who=s.menu(tp,'cards_scope','me','foe','cards_both')
	local zones={LOCATION_ONFIELD+LOCATION_HAND+LOCATION_GRAVE+LOCATION_REMOVED,LOCATION_ONFIELD,LOCATION_HAND,LOCATION_GRAVE,LOCATION_REMOVED,LOCATION_DECK,LOCATION_EXTRA}
	local area=zones[s.menu(tp,'cards_area','cards_all','cards_field','cards_hand','cards_grave','cards_banish','cards_deck','cards_extra')]
	local mine=who==2 and 0 or area
	local theirs=who==1 and 0 or area
	local all=Duel.GetMatchingGroup(aux.TRUE,tp,mine,theirs,e:GetHandler())
	if #all==0 then Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.cards_empty)) return end
	local count=s.quantity(tp,'cards_count',#all,true)
	Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L.pickonfield))
	local g=Duel.SelectMatchingCard(tp,aux.TRUE,tp,mine,theirs,count>0 and count or 1,count>0 and count or #all,e:GetHandler())
	if not g or #g==0 then return end
	local a=s.menu(tp,'cardact','c_destroy','c_grave','c_banish','c_hand','c_deck','c_flip','c_counter','c_control','c_boost')
	if a==1 then Duel.Destroy(g,REASON_EFFECT)
	elseif a==2 then Duel.SendtoGrave(g,REASON_EFFECT)
	elseif a==3 then Duel.Remove(g,POS_FACEUP,REASON_EFFECT)
	elseif a==4 then Duel.SendtoHand(g,nil,REASON_EFFECT)
	elseif a==5 then Duel.SendtoDeck(g,nil,SEQ_DECKTOP,REASON_EFFECT)
	elseif a==6 then
		local monsters=g:Filter(Card.IsLocation,nil,LOCATION_MZONE)
		if #monsters>0 then
			Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L.pos))
			local pos=Duel.SelectPosition(tp,monsters:GetFirst(),POS_FACEUP_ATTACK+POS_FACEUP_DEFENSE+POS_FACEDOWN_DEFENSE)
			Duel.ChangePosition(monsters,pos)
		end
		for tc in aux.Next(g:Filter(Card.IsLocation,nil,LOCATION_SZONE)) do
			Duel.ChangePosition(tc,tc:IsFaceup() and POS_FACEDOWN or POS_FACEUP)
		end
	elseif a==7 then
		local k=({0x1,0x25,0x1b})[s.menu(tp,'counterkind','k_spell','k_chronicle','k_clock')]
		for tc in aux.Next(g) do
			-- Une carte sans effet de compteur n'en accepte aucun : on lui en accorde la permission.
			local e1=Effect.CreateEffect(e:GetHandler())
			e1:SetType(EFFECT_TYPE_SINGLE)
			e1:SetCode(EFFECT_COUNTER_PERMIT+k)
			e1:SetValue(LOCATION_ONFIELD)
			tc:RegisterEffect(e1)
			tc:AddCounter(k,1)
		end
	elseif a==8 then
		for tc in aux.Next(g:Filter(Card.IsLocation,nil,LOCATION_MZONE)) do Duel.GetControl(tc,1-tc:GetControler()) end
	elseif a==9 then
		for tc in aux.Next(g) do
			local e1=Effect.CreateEffect(e:GetHandler())
			e1:SetType(EFFECT_TYPE_SINGLE)
			e1:SetCode(EFFECT_UPDATE_ATTACK)
			e1:SetValue(1000)
			e1:SetReset(RESET_EVENT+RESETS_STANDARD)
			tc:RegisterEffect(e1)
		end
	end
end

-- Scènes de victoire : la fin du duel, jouée pour de vrai par le moteur (mêmes messages, même mise en scène qu'en partie).
function s.victory(tp)
	local k=s.menu(tp,'victorykind','v_exodia','v_battle','v_effect')
	if k==1 then
		-- Les cinq pièces d'Exodia arrivent en main, puis la victoire particulière.
		for _,code in ipairs({44519536,7902349,33396948,70903634,8124921}) do
			Duel.SendtoHand(Duel.CreateToken(tp,code),tp,REASON_EFFECT)
		end
		Duel.Win(tp,0x10)
	else
		-- Le terrain adverse est vidé ; Obelisk et un Dragon Blanc aux Yeux Bleus arrivent chez nous.
		local g=Duel.GetFieldGroup(tp,0,LOCATION_MZONE)
		if #g>0 then Duel.Destroy(g,REASON_EFFECT) end
		for _,code in ipairs({10000000,89631139}) do
			if Duel.GetLocationCount(tp,LOCATION_MZONE)>0 then s.tofield(Duel.CreateToken(tp,code),tp) end
		end
		if k==2 then
			-- Plus que 1000 LP à l'adversaire : c'est à nous d'aller à la Battle Phase et d'attaquer directement.
			Duel.SetLP(1-tp,1000)
		else
			Duel.Damage(1-tp,9999,REASON_EFFECT)
		end
	end
end

-- Vraies chaînes, automatiques même contre l'adversaire passif : un déclencheur puis des Effets Rapides obligatoires.
-- Les cartes et leurs effets ne concernent que cette scène ; aucun terrain existant n'est vidé.
-- Démonstration autoritaire : matériaux réels en main, puis vraie Invocation Fusion.
function s.fusions(e,tp)
	local count=s.menu(tp,'fusion_kind','fusion_two','fusion_three')+1
	if Duel.GetLocationCount(tp,LOCATION_MZONE)<=0 then
		Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.fusion_full))
		return
	end
	local materials=Group.CreateGroup()
	for i=1,count do
		local tc=Duel.CreateToken(tp,89631139)
		Duel.SendtoHand(tc,tp,REASON_RULE)
		materials:AddCard(tc)
	end
	local fusion=Duel.CreateToken(tp,count==2 and 2129638 or 23995346)
	Duel.SendtoDeck(fusion,tp,SEQ_DECKTOP,REASON_RULE)
	fusion:SetMaterial(materials)
	Duel.SendtoGrave(materials,REASON_EFFECT|REASON_MATERIAL|REASON_FUSION)
	Duel.SpecialSummon(fusion,SUMMON_TYPE_FUSION,tp,tp,true,false,POS_FACEUP)
	fusion:CompleteProcedure()
end

function s.chains(e,tp)
	local kind=s.menu(tp,'chain_kind','chain_one','chain_two','chain_three','chain_negate','chain_ten')
	if kind==5 then return s.longchain(e,tp) end
	local n=math.min(kind,3)
	if Duel.GetLocationCount(tp,LOCATION_MZONE)<(n==3 and 2 or 1)
		or (n>1 and Duel.GetLocationCount(1-tp,LOCATION_MZONE)<1) then
		Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.chain_full))
		return
	end
	Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.chain_ready))
	local cards={}
	local codes={89631139,46986414,74677422}
	for i=1,n do
		local p=i==2 and 1-tp or tp
		local tc=Duel.CreateToken(p,codes[i])
		if Duel.SpecialSummon(tc,0,p,p,true,true,POS_FACEUP_ATTACK)==0 then return end
		cards[i]=tc
	end
	for i,tc in ipairs(cards) do
		local rank=i
		local previous=cards[i-1]
		local ce=Effect.CreateEffect(tc)
		ce:SetDescription(aux.Stringid(id,rank==1 and L.chain_recover or rank==2 and L.chain_draw or kind==4 and L.chain_cancel or L.chain_boost))
		ce:SetRange(LOCATION_MZONE)
		ce:SetCountLimit(1)
		ce:SetReset(RESET_EVENT+RESETS_STANDARD+RESET_PHASE+PHASE_END)
		if rank==1 then
			ce:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
			ce:SetCode(EVENT_CUSTOM+id)
		else
			ce:SetType(EFFECT_TYPE_QUICK_F)
			ce:SetCode(EVENT_CHAINING)
			ce:SetCondition(function(e,tp,eg,ep,ev,re)
				return ev==rank-1 and re:GetHandler()==previous
			end)
		end
		ce:SetOperation(function(e,tp,eg,ep,ev,re)
			if rank==1 then
				Duel.Recover(tp,300,REASON_EFFECT)
			elseif rank==2 then
				if Duel.GetFieldGroupCount(tp,LOCATION_DECK,0)>0 then Duel.Draw(tp,1,REASON_EFFECT) end
			elseif kind==4 then
				Duel.NegateActivation(ev)
			else
				local boost=Effect.CreateEffect(e:GetHandler())
				boost:SetType(EFFECT_TYPE_SINGLE)
				boost:SetCode(EFFECT_UPDATE_ATTACK)
				boost:SetValue(300)
				boost:SetReset(RESET_EVENT+RESETS_STANDARD+RESET_PHASE+PHASE_END)
				e:GetHandler():RegisterEffect(boost)
			end
		end)
		tc:RegisterEffect(ce)
	end
	Duel.RaiseSingleEvent(cards[1],EVENT_CUSTOM+id,e,REASON_EFFECT,tp,tp,0)
end

-- Longue chaîne : un déclencheur sur le terrain, puis neuf Effets Rapides depuis les mains, un joueur sur deux.
-- Neuf cartes différentes en main permettent de voir toute la pile sans occuper les Zones Monstres.
function s.longchain(e,tp)
	if Duel.GetLocationCount(tp,LOCATION_MZONE)<1 then
		Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.chain_ten_full))
		return
	end
	local codes={89631139,46986414,74677422,70781052,17444133,44519536,7902349,33396948,70903634,8124921}
	local cards={}
	for i=1,10 do
		local p=i%2==1 and tp or 1-tp
		local tc=Duel.CreateToken(p,codes[i])
		if i==1 then
			if Duel.SpecialSummon(tc,0,p,p,true,true,POS_FACEUP_ATTACK)==0 then return end
		else
			Duel.SendtoHand(tc,p,REASON_RULE)
		end
		cards[i]=tc
	end
	for i,tc in ipairs(cards) do
		local rank=i
		local previous=cards[i-1]
		local ce=Effect.CreateEffect(tc)
		ce:SetDescription(aux.Stringid(id,L.chain_recover))
		ce:SetCountLimit(1)
		ce:SetReset(RESET_EVENT+RESETS_STANDARD+RESET_PHASE+PHASE_END)
		if rank==1 then
			ce:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
			ce:SetRange(LOCATION_MZONE)
			ce:SetCode(EVENT_CUSTOM+id)
		else
			ce:SetType(EFFECT_TYPE_QUICK_F)
			ce:SetRange(LOCATION_HAND)
			ce:SetCode(EVENT_CHAINING)
			ce:SetCondition(function(e,tp,eg,ep,ev,re)
				return ev==rank-1 and re:GetHandler()==previous
			end)
		end
		ce:SetOperation(function(e,tp,eg,ep,ev,re)
			Duel.Recover(e:GetHandlerPlayer(),300,REASON_EFFECT)
		end)
		tc:RegisterEffect(ce)
	end
	Duel.RaiseSingleEvent(cards[1],EVENT_CUSTOM+id,e,REASON_EFFECT,tp,tp,0)
end

function s.tests(e,tp)
	local t=s.menu(tp,'tests','tt_rps','tt_race','tt_attr','tt_sort','tt_rmcounter','tt_disfield','tt_reveal','tt_number','tt_sumeq','tt_sumge')
	if t==1 then
		local winner=Duel.RockPaperScissors(true)
		Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,winner==tp and L.rps_win or L.rps_lose))
	elseif t==2 then Duel.AnnounceRace(tp,1,RACE_ALL)
	elseif t==3 then Duel.AnnounceAttribute(tp,1,ATTRIBUTE_ALL)
	elseif t==4 then Duel.SortDecktop(tp,tp,3)
	elseif t==5 then Duel.RemoveCounter(tp,1,1,0x1,2,REASON_EFFECT)
	elseif t==6 then
		Duel.Hint(HINT_SELECTMSG,tp,aux.Stringid(id,L.pickzone))
		local zone=Duel.SelectDisableField(tp,1,LOCATION_MZONE,LOCATION_MZONE,0)
		local e1=Effect.CreateEffect(e:GetHandler())
		e1:SetType(EFFECT_TYPE_FIELD)
		e1:SetCode(EFFECT_DISABLE_FIELD)
		e1:SetValue(zone)
		e1:SetReset(RESET_PHASE+PHASE_END)
		Duel.RegisterEffect(e1,tp)
		Duel.Hint(HINT_MESSAGE,tp,aux.Stringid(id,L.disabled))
	elseif t==7 then Duel.ConfirmDecktop(tp,2)
	elseif t==8 then Duel.AnnounceNumber(tp,1,2,3,4,5,6,7,8,9,10)
	else s.sumtest(tp,t==10) end
end

-- Sélection par somme de Niveaux avec une carte imposée : la première de nos monstres.
function s.sumtest(tp,greater)
	local g=Duel.GetMatchingGroup(Card.IsFaceup,tp,LOCATION_MZONE,0,nil)
	if #g<3 then return end
	local first=g:GetFirst()
	local rest=g:Clone()
	rest:RemoveCard(first)
	Duel.SetSelectedCard(Group.FromCards(first))
	if greater then rest:SelectWithSumGreater(tp,Card.GetLevel,4)
	else rest:SelectWithSumEqual(tp,Card.GetLevel,4,1,2) end
end
`
}
