import type { DataTranslations } from '../model';

// Swedish translations of data.js content. Applied at startup when the app language is Swedish.
export const DATA_SV: DataTranslations = {
  categories: {
    mustsee: 'Måste se',
    beach: 'Stränder',
    island: 'Öar',
    hiking: 'Vandring & natur',
    hotel: 'Hotell',
    food: 'Restauranger',
    airport: 'Flygplatser',
  },

  regions: {
    bangkok: 'Bangkok',
    north: 'Chiang Mai & norr',
    andaman: 'Phuket, Krabi & Andamansjön',
    gulf: 'Samui, Phangan & Tao',
    east: 'Koh Chang & öster',
    central: 'Ayutthaya & Kanchanaburi',
    south: 'Koh Lipe & djupa södern',
    all: 'Hela Thailand',
  },

  places: {
    // ───────────── MÅSTE SE ─────────────
    'grand-palace': {
      desc: 'Det forna kungliga residenset och hem för Smaragdbuddhan. Thailands viktigaste sevärdhet.',
      tip: 'Strikt klädkod: täckta axlar och knän. Kom när det öppnar 8:30 för att slippa värmen och trängseln. Strunta i alla utanför som säger att det är ”stängt i dag”.',
      duration: '2–3 tim',
    },
    'wat-pho': {
      desc: 'En 46 m lång gyllene liggande Buddha – och den traditionella thaimassagens födelseplats.',
      tip: 'Boka massage på templets massageskola – en av stadens mest prisvärda.',
      duration: '1–1,5 tim',
    },
    'wat-arun': {
      desc: 'Porslinsklädd prang vid floden. Fantastisk i solnedgången från andra stranden.',
      tip: 'Ta färjan över från Tha Tien-bryggan (några baht, går med några minuters mellanrum).',
      duration: '1 tim',
    },
    'chinatown': {
      desc: 'Neonskyltar, guldbutiker och Bangkoks bästa gatumat på kvällen.',
      tip: 'Kom efter 18:00 när matstånden slår upp. MRT Wat Mangkon ligger precis intill.',
      duration: '2–3 tim',
    },
    'chatuchak': {
      desc: 'Över 15 000 stånd – kläder, hantverk, växter, antikviteter och mat.',
      tip: 'Bara lördag och söndag. Kom senast 9–10 innan det blir för varmt. MRT Kamphaeng Phet.',
      duration: '3–4 tim',
    },
    'jim-thompson': {
      desc: 'Teakhus och djungelträdgård som tillhörde den amerikanske sidenkungen som försvann 1967.',
      tip: 'Endast guidade turer, var 20–30:e minut. Nära BTS National Stadium.',
      duration: '1–1,5 tim',
    },
    'lumphini': {
      desc: 'Bangkoks gröna lunga – trampbåtar, joggare och vilda varaner.',
      tip: 'Bäst tidigt på morgonen eller efter 17:00. Perfekt paus för barnen.',
      duration: '1 tim',
    },
    'mahanakhon': {
      desc: 'Utsiktsdäck med glasgolv 314 m över staden.',
      tip: 'Boka en tid vid solnedgången på nätet. Nära BTS Chong Nonsi.',
      duration: '1–1,5 tim',
    },
    'iconsiam': {
      desc: 'Jättegalleria vid floden med en inomhusmathall i flytande marknadsstil (SookSiam).',
      tip: 'Gratis pendelbåt från Sathorn-bryggan. Bra alternativ en regnig dag.',
      duration: '2 tim',
    },
    'damnoen': {
      desc: 'Den klassiska flytande marknaden med försäljare i båtar, ca 100 km från Bangkok.',
      tip: 'Turistigt men roligt. Var på plats senast 8. Kombinera med Maeklong Railway Market.',
      duration: 'Halvdag',
    },
    'ayutthaya': {
      desc: 'Ruinerna av den gamla siamesiska huvudstaden – med Buddhahuvudet bland trädrötterna vid Wat Mahathat.',
      tip: 'Ta tåget från Bangkok (~1,5 tim) och hyr sedan cykel eller tuk-tuk för dagen.',
      duration: 'Heldag',
    },
    'river-kwai': {
      desc: 'Bron på Dödsjärnvägen från andra världskriget i Kanchanaburi, plus gripande krigsmuseer.',
      tip: 'Åk med tåget på Dödsjärnvägen över Wang Pho-viadukten.',
      duration: '2–3 tim',
    },
    'doi-suthep': {
      desc: 'Gyllene tempel på bergstoppen med utsikt över Chiang Mai – dit leder en naga-trappa med 306 steg.',
      tip: 'Vandra upp via Monk’s Trail eller ta en röd songthaew från djurparken.',
      duration: '2 tim',
    },
    'cm-oldcity': {
      desc: 'Vallgravsomgärdad gamla stad full av tempel, med en enorm förfallen chedi från 1300-talet.',
      tip: 'Sunday Walking Street på Ratchadamnoen Rd är norra Thailands bästa nattmarknad.',
      duration: 'Halvdag',
    },
    'cm-nightbazaar': {
      desc: 'Marknad varje kväll med hantverk, kläder och matgårdar.',
      tip: 'Pruta artigt – börja runt 60 % av utgångspriset.',
      duration: '2 tim',
    },
    'elephant-nature-park': {
      desc: 'Etisk elefantfristad – ingen ridning, inga uppvisningar. Räddade elefanter strövar fritt.',
      tip: 'Boka flera veckor i förväg. Hämtning på hotellet i Chiang Mai ingår.',
      duration: 'Heldag',
    },
    'white-temple': {
      desc: 'Surrealistiskt, helvitt modernt tempel i Chiang Rai.',
      tip: 'Dagsutflykt från Chiang Mai blir lång (3 tim enkel väg) – sov en natt i Chiang Rai.',
      duration: '1,5 tim',
    },
    'blue-temple': {
      desc: 'Klart safirblått tempel med en vit Buddha.',
      tip: 'Gratis inträde. Kombinera med Vita templet.',
      duration: '45 min',
    },
    'golden-triangle': {
      desc: 'Där Thailand, Laos och Myanmar möts vid Mekongfloden.',
      tip: 'Besök museet Hall of Opium.',
      duration: '2–3 tim',
    },
    'sukhothai': {
      desc: 'Unesco-listade ruiner av Thailands första huvudstad, bäst att utforska på cykel.',
      tip: 'Magiskt i soluppgången. Loy Krathong-festivalen här är förtrollande.',
      duration: 'Heldag',
    },
    'big-buddha': {
      desc: 'En 45 m hög Buddha i vit marmor med panoramautsikt över Chalong Bay.',
      tip: 'Saronger finns att låna vid entrén. Åk dit till solnedgången.',
      duration: '1 tim',
    },
    'phuket-oldtown': {
      desc: 'Färgglada sino-portugisiska butikshus, kaféer och gatukonst.',
      tip: 'Söndagskvällens gågatumarknad Lard Yai på Thalang Road.',
      duration: '2–3 tim',
    },
    'james-bond': {
      desc: 'Höga kalkstensklippor som reser sig ur smaragdgrönt vatten. Kajakpaddling i havsgrottor.',
      tip: 'Välj en tur som inkluderar den flytande byn Koh Panyee.',
      duration: 'Heldag',
    },
    'maya-bay': {
      desc: 'Klippomgärdad vik som blev känd genom ”The Beach”. Bad är inte tillåtet (korallrevet återhämtar sig).',
      tip: 'Brukar vara stängt aug–sep. Åk tidigt på morgonen – longtail från Phi Phi Don.',
      duration: '1 tim',
    },
    'khao-sok-lake': {
      desc: 'Jadegrön sjö omgiven av djungelklädda kalkstensberg. Sov i flytande flotthus.',
      tip: 'Turer med övernattning i flotthus är det bästa sättet att uppleva sjön.',
      duration: '1–2 dagar',
    },
    'ang-thong': {
      desc: '42 öar – inspirationen till ”The Beach”. Kajakpaddling och en vandring till Emerald Lake.',
      tip: 'Dagsutflykt från Samui; välj en snabbbåtstur där kajak ingår.',
      duration: 'Heldag',
    },

    // ───────────── STRÄNDER ─────────────
    'railay-west': {
      desc: 'Klippinramad strand som bara nås med båt. Klättring i världsklass.',
      tip: 'Longtail från Ao Nang (15 min). Solnedgången här är overklig.',
    },
    'phra-nang': {
      desc: 'Rankas ofta som en av världens vackraste stränder. Med prinsessgrottans helgedom.',
      tip: '10 minuters promenad från Railay East längs klippstigen.',
    },
    'ao-nang': {
      desc: 'Krabis största strandort och startpunkt för ö-hopping.',
      tip: 'Boka 4-östurer vid båtdisken på stranden – där är priserna fasta.',
    },
    'patong': {
      desc: 'Phukets livligaste strand – vattensporter och nattliv på Bangla Road.',
      tip: 'Inte stället för en lugn familjedag; testa Kata eller Nai Harn.',
    },
    'kata': {
      desc: 'Avslappnad, barnvänlig strand med milda vågor under torrperioden.',
      tip: 'Surflektioner jun–sep. Karon Viewpoint ligger nära.',
    },
    'nai-harn': {
      desc: 'Lokalbornas favorit med en sjö bakom stranden; nära utsiktsplatsen Promthep Cape för solnedgången.',
      tip: 'Röd flagg under monsunen – respektera den.',
    },
    'freedom-beach': {
      desc: 'Avskild vik med vit sand söder om Patong.',
      tip: 'Longtail från Patong är enklast; annars är det en brant stig.',
    },
    'long-beach-phiphi': {
      desc: 'Lugnare strand med fin snorkling och utsikt mot Phi Phi Leh.',
      tip: 'Snorkling vid Shark Point strax utanför – svartfenade revhajar.',
    },
    'lanta-long-beach': {
      desc: '4 km mjuk sand och avslappnade strandbarer.',
      tip: 'Koh Lanta passar barnfamiljer perfekt – lugnare än Phi Phi.',
    },
    'chaweng': {
      desc: 'Samuis längsta och livligaste strand.',
      tip: 'Norra Chaweng är lugnare och har finare sand.',
    },
    'lamai': {
      desc: 'Lugnare alternativ till Chaweng, med klipporna Hin Ta Hin Yai.',
      tip: 'Nattmarknad i Lamai på söndagar.',
    },
    'haad-rin': {
      desc: 'Hemmaplan för Full Moon Party.',
      tip: 'Kolla månkalendern – boka boende i god tid kring fullmåne.',
    },
    'sairee': {
      desc: 'Dykskolornas centrum med fantastiska solnedgångar.',
      tip: 'Koh Tao är ett av världens billigaste ställen att ta PADI-certifikat.',
    },
    'sunrise-lipe': {
      desc: 'Turkost vatten och vit sand – ”Thailands Maldiverna”.',
      tip: 'Säsong nov–apr. Färjor från Pak Bara eller Langkawi.',
    },
    'koh-kradan': {
      desc: 'Liten ö i Trang med kristallklart vatten och koraller precis utanför stranden.',
      tip: 'Dagsutflykt från Koh Lanta eller Koh Mook (Emerald Cave).',
    },
    'white-sand-chang': {
      desc: 'Huvudstranden på Thailands näst största ö.',
      tip: 'Lonely Beach längre söderut har mer backpackerkänsla.',
    },
    'sai-kaew': {
      desc: 'Knarrande vit sand bara 3,5 tim från Bangkok.',
      tip: 'Perfekt helgflykt från Bangkok.',
    },
    'hua-hin-beach': {
      desc: 'Kunglig badort 3 tim från Bangkok.',
      tip: 'Fin matscen och nattmarknader.',
    },

    // ───────────── ÖAR ─────────────
    'phi-phi-don': {
      desc: 'Huvudön i Phi Phi och färjenav.',
      tip: 'Färjor från Phuket (Rassada) och Krabi. ~2 tim.',
    },
    'pileh-lagoon': {
      desc: 'Smaragdgrön lagun omsluten av klippor på Phi Phi Leh – badstopp på de flesta turer.',
      tip: 'Kom före kl. 10.',
    },
    'bamboo-island': {
      desc: 'Platt ö omgiven av puderfin vit sand och rev.',
      tip: 'Nationalparksavgift betalas vid ankomst.',
    },
    'chicken-island': {
      desc: 'Klippa formad som ett kycklinghuvud; vid lågvatten kan man gå på sandbanken till Koh Tup.',
      tip: 'Klassiskt stopp på Krabis 4-östur.',
    },
    'poda': {
      desc: 'Vykortsö med en jättelik kalkstenspelare.',
      tip: 'Lunchstopp på de flesta 4-östurer.',
    },
    'koh-hong': {
      desc: 'Dold lagun inne i en kalkstensö – paddla in med kajak.',
      tip: 'Lugnare alternativ till dagsturerna till Phi Phi.',
    },
    'koh-yao-noi': {
      desc: 'Lantlig, genuin ö mellan Phuket och Krabi med utsikt över Phang Nga Bay.',
      tip: 'Hyr en skoter – det är lätt att köra runt ön.',
    },
    'similan': {
      desc: 'Ett av världens tio bästa dykställen, med granitblock och ibland valhajar.',
      tip: 'Öppet endast mitten av okt till mitten av maj. Snabbbåt från Khao Lak.',
    },
    'koh-samui': {
      desc: 'Gulfens ö-nav med flygplats, resorter och vattenfall.',
      tip: 'Gulfsidan har ett annat regnmönster – bäst jan–aug.',
    },
    'koh-phangan': {
      desc: 'Djungel, yogaretreats och dolda stränder bortom festerna.',
      tip: 'Bottle Beach och Thong Nai Pan för lugna dagar.',
    },
    'koh-tao': {
      desc: 'Litet paradis för dykning och snorkling.',
      tip: 'Lomprayahs katamaran går mellan Samui–Phangan–Tao.',
    },
    'nang-yuan': {
      desc: 'Tre småöar sammanbundna av en sandbank – ikonisk utsiktsplats.',
      tip: 'Plastflaskor är förbjudna; liten inträdesavgift.',
    },
    'koh-lanta': {
      desc: 'Lång, avslappnad ö; perfekt för barnfamiljer och längre vistelser.',
      tip: 'Bilfärja från fastlandet vid Krabi eller snabbbåt från Phi Phi.',
    },
    'koh-lipe': {
      desc: 'Liten ö i Tarutao nationalpark med suverän snorkling.',
      tip: 'Walking Street har fantastisk grillad skaldjursmat.',
    },
    'koh-chang': {
      desc: 'Bergig djungelö med vattenfall.',
      tip: 'Färja från Trat (Ao Thammachat).',
    },
    'koh-kood': {
      desc: 'Orörd ö med kristallklart vatten och vattenfallet Klong Chao.',
      tip: 'Lugnt – ta med kontanter, det finns få bankomater.',
    },

    // ───────────── VANDRING & NATUR ─────────────
    'monks-trail': {
      desc: 'Skuggig djungelstig till ett dolt tempel vid ett vattenfall, som sedan fortsätter upp till Doi Suthep.',
      tip: 'Starta bakom Chiang Mai University. ~45 min till Wat Pha Lat, +1,5 tim till Doi Suthep. Lätt–medel.',
      duration: '2–3 tim',
      difficulty: 'Medel',
    },
    'doi-inthanon': {
      desc: 'Topp på 2 565 m, två kungliga pagoder, vattenfall och molnskog.',
      tip: 'Ta med jacka – det kan vara 5 °C i gryningen på vintern.',
      duration: 'Heldag',
      difficulty: 'Lätt',
    },
    'kew-mae-pan': {
      desc: '3 km lång åsled med vidsträckt utsikt i Doi Inthanons nationalpark.',
      tip: 'Öppet endast nov–maj; lokal guide är obligatorisk (betalas vid stigen).',
      duration: '2–3 tim',
      difficulty: 'Medel',
    },
    'doi-luang-chiang-dao': {
      desc: 'Kalkstenstopp med soluppgång ovanför ett hav av moln. Vandring med övernattning i tält.',
      tip: 'Öppet ungefär nov–feb med tillstånd. Anlita en lokal guide.',
      duration: '2 dagar',
      difficulty: 'Krävande',
    },
    'pai-canyon': {
      desc: 'Smala sandstensåsar med branta stup – legendarisk plats för solnedgången.',
      tip: 'Inga räcken. Ha bra skor och var försiktig med barnen.',
      duration: '1–2 tim',
      difficulty: 'Medel',
    },
    'erawan': {
      desc: 'Sju turkosa vattenfallsterrasser att bada i – med fiskar som nafsar på tårna.',
      tip: 'Kom när det öppnar kl. 8. De översta nivåerna stänger runt 15:30.',
      duration: '3–4 tim',
      difficulty: 'Medel',
    },
    'khao-yai': {
      desc: 'Unesco-listad djungel med vilda elefanter, gibboner och vattenfallet Haew Suwat.',
      tip: 'Anlita en guide för att hålla koll på iglar och hitta djuren; ~3 tim från Bangkok.',
      duration: 'Heldag',
      difficulty: 'Lätt–Medel',
    },
    'phu-kradueng': {
      desc: 'Hjärtformad platå med tallskogar och utsiktspunkter för soluppgången på klippkanten.',
      tip: 'Stängt jun–sep. Bärare kan bära upp ditt bagage.',
      duration: '2–3 dagar',
      difficulty: 'Krävande',
    },
    'tiger-cave': {
      desc: 'Brant trappklättring till en gyllene Buddha med 360° utsikt över Krabis kalkstensberg.',
      tip: 'Börja kl. 7 – det blir brutalt varmt. Se upp för aporna.',
      duration: '2 tim',
      difficulty: 'Krävande',
    },
    'railay-viewpoint': {
      desc: 'Kort men lerig klättring med rep till en utsiktsplats och en dold lagun.',
      tip: 'Ha torra skor som du inte är rädd om. Inte för små barn.',
      duration: '1–1,5 tim',
      difficulty: 'Krävande',
    },
    'phiphi-viewpoint': {
      desc: 'Den ikoniska utsikten över Phi Phi Dons två vikar.',
      tip: 'Gå upp till soluppgången eller solnedgången; liten inträdesavgift.',
      duration: '1 tim',
      difficulty: 'Medel',
    },
    'khao-sok': {
      desc: 'Urgammal regnskog, flodtubing och nattsafari.',
      tip: 'Vissa leder kräver guide. Rafflesian blommar dec–feb.',
      duration: '1–3 dagar',
      difficulty: 'Medel',
    },
    'john-suwan': {
      desc: 'Kort, brant vandring till en berömd utsikt över två vikar.',
      tip: 'Liten avgift. Kombinera med ett dopp på Freedom Beach på Koh Tao.',
      duration: '45 min',
      difficulty: 'Medel',
    },
    'phraya-nakhon': {
      desc: 'Kunglig paviljong badande i solstrålar inne i en rasad grotta, Sam Roi Yot nationalpark.',
      tip: 'Ljusstrålarna är som bäst 10–11. Vandra dit från stranden Laem Sala.',
      duration: '2–3 tim',
      difficulty: 'Medel',
    },

    // ───────────── HOTELL ─────────────
    'mandarin-oriental': {
      desc: 'Legendariskt hotell vid floden sedan 1876.',
      tip: 'Ta eftermiddagste i Authors’ Lounge även om du inte bor där.',
    },
    'capella': {
      desc: 'Lugnt resorthotell mitt i staden; alla rum vetter mot Chao Phraya.',
    },
    'peninsula': {
      desc: 'Ikoniskt hotell vid floden med stora rum – perfekt för familjer.',
    },
    'sala-rattanakosin': {
      desc: 'Boutiquehotell mittemot Wat Arun – gångavstånd till Grand Palace.',
      tip: 'Takbaren är perfekt i solnedgången.',
    },
    'riva-surya': {
      desc: 'Stilrent hotell vid floden nära Khao San och Phra Athit-bryggan.',
    },
    'lubd-silom': {
      desc: 'Socialt vandrarhem med privata rum; bra budgetbas nära BTS.',
    },
    '137-pillars': {
      desc: 'Renoverad gård i teak som blivit lyxsviter i Chiang Mai.',
    },
    'tamarind-village': {
      desc: 'Oas i Lanna-stil mitt i gamla stan.',
    },
    'four-seasons-cm': {
      desc: 'Villor bland risterrasser i Mae Rim-dalen.',
    },
    'trisara': {
      desc: 'Villor med egen pool vid en avskild vik.',
    },
    'keemala': {
      desc: 'Poolvillor formade som trädkojor och fågelbon i bergen ovanför Kamala.',
    },
    'katathani': {
      desc: 'Stort barnvänligt resorthotell direkt på den lugna stranden Kata Noi.',
    },
    'rayavadee': {
      desc: 'Paviljonger i kokospalmlundar ända ner till Phra Nang-stranden.',
    },
    'zeavola': {
      desc: 'Teaksviter på den lugna stranden Laem Tong, långt från festandet.',
    },
    'six-senses-yao-noi': {
      desc: 'Poolvillor i sluttningen med utsikt över Phang Nga Bay.',
    },
    'four-seasons-samui': {
      desc: 'Villor i sluttningen på Samuis lugna nordvästra udde.',
    },
    'centara-hua-hin': {
      desc: 'Historiskt järnvägshotell från 1923 med berömda formklippta trädgårdar.',
    },

    // ───────────── RESTAURANGER ─────────────
    'jay-fai': {
      desc: 'Gatumat med Michelinstjärna – krabbomelett lagad över träkol av legenden med skyddsglasögonen.',
      tip: 'Köa eller boka långt i förväg. Stängt vissa vardagar.',
    },
    'thipsamai': {
      desc: 'Bangkoks mest berömda pad thai, inlindad i en tunn äggomelett.',
      tip: 'Öppet på kvällarna; den färskpressade apelsinjuicen är ett måste.',
    },
    'krua-apsorn': {
      desc: 'Kungafamiljens favorit för hemlagad thaimat: krabbcurry och omelett.',
      tip: 'Bara lunch; stänger tidigt på kvällen.',
    },
    'supanniga': {
      desc: 'Recept från östra Thailand med takterrassutsikt över Wat Arun.',
      tip: 'Perfekt lunch mellan Wat Pho och Wat Arun.',
    },
    'le-du': {
      desc: 'Prisbelönt modern thailändsk avsmakningsmeny i Silom.',
      tip: 'Boka flera veckor i förväg.',
    },
    'sorn': {
      desc: 'Sydthailändsk fine dining – bland Asiens bästa restauranger.',
      tip: 'Bokningen öppnar flera månader i förväg.',
    },
    'jay-kee': {
      desc: 'Krispig vitlöksfriterad kyckling med som tam – granne med Lumphini Park.',
    },
    'khao-soi-khun-yai': {
      desc: 'Litet lunchställe som serverar en av Chiang Mais bästa khao soi.',
      tip: 'Bara lunch, stänger när maten är slut.',
    },
    'khao-soi-mae-sai': {
      desc: 'Lokal institution nära Nimman för currynudelsoppa.',
    },
    'huen-phen': {
      desc: 'Nordthailändska klassiker som sai oua och nam prik noom.',
    },
    'raya': {
      desc: 'Herrgård i Phuket Old Town, känd för sin krabbcurry med risnudlar.',
    },
    'one-chun': {
      desc: 'Phuketmat med Michelin Bib Gourmand i ett retro butikshus.',
    },
    'krabi-night-market': {
      desc: 'Gågatumarknad på helgerna med matstånd och livemusik.',
    },
    'fishermans-village': {
      desc: 'Restauranger vid stranden plus en stor gågatumarknad på fredagskvällar.',
    },
    'hua-hin-night-market': {
      desc: 'Grillade skaldjur och tilltugg varje kväll.',
    },

    // ───────────── FLYGPLATSER ─────────────
    'BKK': {
      desc: 'Bangkoks största internationella flygplats.',
      tip: 'Airport Rail Link till Phaya Thai på ~30 min.',
    },
    'DMK': {
      desc: 'Bangkoks nav för lågprisbolag (AirAsia, Nok Air, Thai Lion).',
      tip: 'SRT Red Line går till Bang Sue.',
    },
    'HKT': { desc: 'Porten till Phuket, Phang Nga och Phi Phi.' },
    'KBV': { desc: 'För Ao Nang, Railay och Koh Lanta.' },
    'USM': { desc: 'Charmig flygplats under bar himmel; mest Bangkok Airways – dyrare.' },
    'URT': { desc: 'Billigt alternativ för Samui/Phangan/Tao – kombibiljetter med buss + färja.' },
    'CNX': { desc: 'Bara 15 min från gamla stan.' },
    'CEI': { desc: 'För Vita templet och Gyllene triangeln.' },
    'HGN': { desc: 'Slipp vägen med 1 864 kurvor.' },
    'THS': { desc: 'Bangkok Airways egen flygplats.' },
    'UTP': { desc: 'För Pattaya och Koh Samet.' },
    'TDX': { desc: 'Närmaste flygplats till Koh Chang och Koh Kood.' },
    'CJM': { desc: 'Snabb väg till Koh Tao med färja.' },
    'UNN': { desc: 'För Koh Phayam och Koh Chang (Ranong).' },
    'TST': { desc: 'För Koh Kradan, Koh Mook och Koh Ngai.' },
    'HDY': { desc: 'Närmaste större flygplats till Koh Lipe (via Pak Bara).' },
    'LOE': { desc: 'För Phu Kradueng och Chiang Khan.' },
    'BFV': { desc: 'För Khmertemplet Phanom Rung.' },
  },

  templates: {
    'bkk-temples': {
      name: 'Bangkok: tempel & floden',
      blurb: 'Den klassiska rundan i gamla stan till fots och med flodfärja – som avslutas med gatumat i Chinatown.',
      notes: [
        'Kom när det öppnar. Tänk på klädkoden!',
        'Liggande Buddha + massage om du vill',
        'Lunch med utsikt över Wat Arun',
        'Färja över från Tha Tien-bryggan',
        'Gatumatsrunda på Yaowarat',
        'Bara om du har bokat!',
      ],
    },
    'bkk-markets': {
      name: 'Bangkok: marknader & skyline',
      blurb: 'Helgmarknad, sidenhus, en paus i parken och solnedgång högt över staden.',
      notes: [
        'Bara helger',
        'BTS till National Stadium',
        'Spana efter varaner',
        'Tidig middag med friterad kyckling',
        'Tid vid solnedgången',
      ],
    },
    'krabi-4-islands': {
      name: 'Krabi: 4-östur',
      blurb: 'Longtail eller snabbbåt från Ao Nang – Krabis populäraste ö-dag.',
      notes: [
        'Båtdisken på stranden',
        'Bad & grotthelgedom',
        'Snorkling, sandbanken till Tup vid lågvatten',
        'Lunch på stranden',
        'Stanna till solnedgången, longtail tillbaka',
      ],
    },
    'phiphi-hop': {
      name: 'Phi Phi: ö-hopping',
      blurb: 'Tidig longtail runt Phi Phi Leh och Bamboo Island, sedan utsiktsplatsen i solnedgången.',
      notes: [
        'Åk tidigt före dagsturisterna',
        'Titta, men inget bad',
        'Bada i lagunen',
        'Snorkling + lunch',
        'Snorkling vid Shark Point',
        'Vandring till solnedgången',
      ],
    },
    'gulf-hop': {
      name: 'Gulfens öar: Samui → Phangan → Tao',
      blurb: 'Hoppa norrut med Lomprayahs katamaran. Funkar som en lång dag eller 3–5 nätter.',
      notes: [
        'Katamaran från Maenam/Nathon',
        'Stanna några nätter om du vill',
        'Mae Haad-bryggan',
        'Taxibåt från Sairee',
        'Vandring till utsiktsplatsen',
        'Solnedgång på stranden',
      ],
    },
    'cm-hike': {
      name: 'Chiang Mai: vandring på Monk’s Trail',
      blurb: 'Djungelstig till ett vattenfallstempel och upp till Doi Suthep, sedan khao soi och nattmarknader.',
      notes: [
        'Starta före värmen',
        'Songthaew ner igen',
        'Innan det tar slut',
        'Wat Chedi Luang',
        'Middag & shopping',
      ],
    },
    'inthanon': {
      name: 'Doi Inthanon: toppdag',
      blurb: 'Thailands tak: åsled, kungliga pagoder och vattenfall. Bil eller tur från Chiang Mai.',
      notes: [
        'Spången vid toppen först',
        'Guide obligatorisk, nov–maj',
      ],
    },
    'krabi-hike': {
      name: 'Krabi: trappor & klippor',
      blurb: 'Trappklättring till Tiger Cave Temple på morgonen, klättring till Railays utsiktsplats på eftermiddagen.',
      notes: [
        'Ta med 1,5 L vatten per person',
        'Brunch i stan',
        'Longtail från Ao Nang',
        'Svalka dig med ett dopp',
      ],
    },
    'kanchanaburi': {
      name: 'Kanchanaburi: vattenfall & historia',
      blurb: 'Bada i Erawans sju nivåer och se sedan bron över River Kwai i gyllene timmen.',
      notes: [
        'Kom när det öppnar',
        'Gå över bron',
      ],
    },
  },

  destinations: {
    'bangkok': { transfer: 'Nav för tåg och bussar till hela landet' },
    'ayutthaya': { transfer: 'Tåg från Bangkok ~1,5 tim, 20–350 ฿ · taxi ~1,5 tim, 1 200–1 500 ฿' },
    'kanchanaburi': { transfer: 'Minibuss/tåg från Bangkok ~2,5–3 tim, 100–200 ฿ · taxi ~2,5 tim, 2 000–2 500 ฿' },
    'sukhothai': { transfer: 'Buss från Bangkok ~7 tim, 300–450 ฿ · från Chiang Mai ~5 tim' },
    'chiang-mai': { transfer: 'Nattåg från Bangkok ~12 tim, 800–1 500 ฿ (sovvagn)' },
    'chiang-rai': { transfer: 'Buss från Chiang Mai ~3 tim, 150–300 ฿' },
    'pai': { transfer: 'Minibuss från Chiang Mai ~3 tim (762 kurvor!), 150–250 ฿' },
    'hua-hin': { transfer: 'Tåg/buss från Bangkok ~3,5–4,5 tim, 200–600 ฿ · taxi ~3 tim, 2 500–3 000 ฿' },
    'koh-chang': { transfer: 'Buss + färja från Bangkok ~6 tim, 350–600 ฿ · färja från Laem Ngop ~30 min' },
    'koh-samui': { transfer: 'Buss/tåg + färja från Bangkok ~12 tim, 800–1 500 ฿ · flyg till Surat Thani + färja' },
    'koh-phangan': { transfer: 'Färja från Samui ~30 min, 300–400 ฿ · från Surat Thani ~3 tim' },
    'koh-tao': { transfer: 'Lomprayahs katamaran från Samui/Phangan ~1,5–2 tim, 600–700 ฿ · från Chumphon ~1,5 tim' },
    'khao-sok': { transfer: 'Minibuss från Krabi, Phuket eller Surat Thani ~2–3 tim, 250–400 ฿' },
    'khao-lak': { transfer: 'Taxi från Phukets flygplats ~1,5 tim, 1 200–1 800 ฿' },
    'phuket': { transfer: 'Färja från Krabi/Phi Phi ~2 tim, 400–700 ฿' },
    'krabi': { transfer: 'Färja från Phuket/Phi Phi ~1,5–2 tim, 400–700 ฿ · minibuss från Phuket ~3 tim' },
    'koh-phi-phi': { transfer: 'Färja från Phuket eller Krabi ~1,5–2 tim, 400–700 ฿' },
    'koh-lanta': { transfer: 'Minibuss + bilfärja från Krabi ~2,5 tim, 300–500 ฿ · båt från Phi Phi ~1,5 tim' },
    'koh-lipe': { transfer: 'Snabbbåt från Pak Bara ~1,5 tim, 650–800 ฿ (flyg till Hat Yai/Trang) · nov–maj även från Lanta' },
  },
};
