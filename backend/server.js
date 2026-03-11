const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
// ========== NOVOS REQUIRES PARA RECUPERAÇÃO DE SENHA ==========
const crypto = require('crypto');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

console.log('✅ Backend iniciado');

// ========== CONFIGURAÇÃO DO SQLITE ==========
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Criar tabelas se não existirem
db.serialize(() => {
    // Tabela de usuários - Criar ou atualizar
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      email TEXT UNIQUE,
      ip TEXT,
      reset_token TEXT,
      reset_expira INTEGER,
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

        // Verificar se a coluna frase_hash existe, se não, adicionar (sem UNIQUE constraint)
  db.all("PRAGMA table_info(usuarios)", (err, columns) => {
    if (err) {
      console.error('Erro ao verificar colunas:', err);
      return;
    }
    
    const temFraseHash = columns.some(col => col.name === 'frase_hash');
    if (!temFraseHash) {
      console.log('🔄 Adicionando coluna frase_hash...');
      db.run(`ALTER TABLE usuarios ADD COLUMN frase_hash TEXT`, (err) => {
        if (err) {
          console.error('❌ Erro ao adicionar frase_hash:', err);
        } else {
          console.log('✅ Coluna frase_hash adicionada com sucesso!');
        }
      });
    } else {
      console.log('✅ Coluna frase_hash já existe');
    }
  });

  // Tabela de créditos diários
  db.run(`
    CREATE TABLE IF NOT EXISTS creditos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      usado INTEGER DEFAULT 0,
      limite INTEGER DEFAULT 10,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE(usuario_id, data)
    )
  `);

  // ========== NOVA TABELA DE CÓDIGOS DE ATIVAÇÃO ==========
  db.run(`
    CREATE TABLE IF NOT EXISTS codigos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      usado INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      usado_em DATETIME,
      usuario_id INTEGER,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);
});

console.log(`💾 Banco de dados SQLite atualizado: ${dbPath}`);

// ========== LISTA DE PALAVRAS BIP39 PARA FRASE DE RECUPERAÇÃO ==========
const PALAVRAS_BIP39 = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse",
  "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act",
  "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust", "admit",
  "adult", "advance", "advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent",
  "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol", "alert",
  "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also", "alter",
  "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient", "anger",
  "angle", "angry", "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique",
  "anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april", "arch", "arctic",
  "area", "arena", "argue", "arm", "armed", "armor", "army", "around", "arrange", "arrest",
  "arrive", "arrow", "art", "artefact", "artist", "artwork", "ask", "aspect", "assault", "asset",
  "assist", "assume", "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction",
  "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid", "awake",
  "aware", "away", "awesome", "awful", "awkward", "axis", "baby", "bachelor", "bacon", "badge",
  "bag", "balance", "balcony", "ball", "bamboo", "banana", "banner", "bar", "barely", "bargain",
  "barrel", "base", "basic", "basket", "battle", "beach", "bean", "beauty", "because", "become",
  "beef", "before", "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit",
  "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike", "bind", "biology",
  "bird", "birth", "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless",
  "blind", "blood", "blossom", "blouse", "blue", "blur", "blush", "board", "boat", "body",
  "boil", "bomb", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss",
  "bottom", "bounce", "box", "boy", "bracket", "brain", "brand", "brass", "brave", "bread",
  "breeze", "brick", "bridge", "brief", "bright", "bring", "brisk", "broccoli", "broken", "bronze",
  "broom", "brother", "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb",
  "bulk", "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus", "business", "busy",
  "butter", "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage", "cake", "call",
  "calm", "camera", "camp", "can", "canal", "cancel", "candy", "cannon", "canoe", "canvas",
  "canyon", "capable", "capital", "captain", "car", "carbon", "card", "cargo", "carpet", "carry",
  "cart", "case", "cash", "casino", "castle", "casual", "cat", "catalog", "catch", "category",
  "cattle", "caught", "cause", "caution", "cave", "ceiling", "celery", "cement", "census", "century",
  "cereal", "certain", "chair", "chalk", "champion", "change", "chaos", "chapter", "charge", "chase",
  "chat", "cheap", "check", "cheese", "chef", "cherry", "chest", "chicken", "chief", "child",
  "chimney", "choice", "choose", "chronic", "chuckle", "chunk", "churn", "cigar", "cinnamon", "circle",
  "citizen", "city", "civil", "claim", "clap", "clarify", "claw", "clay", "clean", "clerk",
  "clever", "click", "client", "cliff", "climb", "clinic", "clip", "clock", "clog", "close",
  "cloth", "cloud", "clown", "club", "clump", "cluster", "clutch", "coach", "coast", "coconut",
  "code", "coffee", "coil", "coin", "collect", "color", "column", "combine", "come", "comfort",
  "comic", "common", "company", "concert", "conduct", "confirm", "congress", "connect", "consider", "control",
  "convince", "cook", "cool", "copper", "copy", "coral", "core", "corn", "correct", "cost",
  "cotton", "couch", "country", "couple", "course", "cousin", "cover", "coyote", "crack", "cradle",
  "craft", "cram", "crane", "crash", "crater", "crawl", "crazy", "cream", "credit", "creek",
  "crew", "cricket", "crime", "crisp", "critic", "crop", "cross", "crouch", "crowd", "crucial",
  "cruel", "cruise", "crumble", "crunch", "crush", "cry", "crystal", "cube", "culture", "cup",
  "cupboard", "curious", "current", "curtain", "curve", "cushion", "custom", "cute", "cycle", "dad",
  "damage", "damp", "dance", "danger", "daring", "dash", "daughter", "dawn", "day", "deal",
  "debate", "debris", "decade", "december", "decide", "decline", "decorate", "decrease", "deer", "defense",
  "define", "defy", "degree", "delay", "deliver", "demand", "demise", "denial", "dentist", "deny",
  "depart", "depend", "deposit", "depth", "deputy", "derive", "describe", "desert", "design", "desk",
  "despair", "destroy", "detail", "detect", "develop", "device", "devote", "diagram", "dial", "diamond",
  "diary", "dice", "diesel", "diet", "differ", "digital", "dignity", "dilemma", "dinner", "dinosaur",
  "direct", "dirt", "disagree", "discover", "disease", "dish", "dismiss", "disorder", "display", "distance",
  "divert", "divide", "divorce", "dizzy", "doctor", "document", "dog", "doll", "dolphin", "domain",
  "donate", "donkey", "donor", "door", "dose", "double", "dove", "draft", "dragon", "drama",
  "drastic", "draw", "dream", "dress", "drift", "drill", "drink", "drip", "drive", "drop",
  "drum", "dry", "duck", "dumb", "dune", "during", "dust", "dutch", "duty", "dwarf",
  "dynamic", "eager", "eagle", "early", "earn", "earth", "easily", "east", "easy", "echo",
  "ecology", "economy", "edge", "edit", "educate", "effort", "egg", "eight", "either", "elbow",
  "elder", "electric", "elegant", "element", "elephant", "elevator", "elite", "else", "embark", "embody",
  "embrace", "emerge", "emotion", "employ", "empower", "empty", "enable", "enact", "end", "endless",
  "endorse", "enemy", "energy", "enforce", "engage", "engine", "enhance", "enjoy", "enlist", "enough",
  "enrich", "enroll", "ensure", "enter", "entire", "entry", "envelope", "episode", "equal", "equip",
  "era", "erase", "erode", "erosion", "error", "erupt", "escape", "essay", "essence", "estate",
  "eternal", "ethics", "evidence", "evil", "evoke", "evolve", "exact", "example", "excess", "exchange",
  "excite", "exclude", "excuse", "execute", "exercise", "exhaust", "exhibit", "exile", "exist", "exit",
  "exotic", "expand", "expect", "expire", "explain", "expose", "express", "extend", "extra", "eye",
  "eyebrow", "fabric", "face", "faculty", "fade", "faint", "faith", "fall", "false", "fame",
  "family", "famous", "fan", "fancy", "fantasy", "farm", "fashion", "fat", "fatal", "father",
  "fatigue", "fault", "favorite", "feature", "february", "federal", "fee", "feed", "feel", "female",
  "fence", "festival", "fetch", "fever", "few", "fiber", "fiction", "field", "figure", "file",
  "film", "filter", "final", "find", "fine", "finger", "finish", "fire", "firm", "first",
  "fiscal", "fish", "fit", "fitness", "fix", "flag", "flame", "flash", "flat", "flavor",
  "flee", "flight", "flip", "float", "flock", "floor", "flower", "fluid", "flush", "fly",
  "foam", "focus", "fog", "foil", "fold", "follow", "food", "foot", "force", "forest",
  "forget", "fork", "fortune", "forum", "forward", "fossil", "foster", "found", "fox", "fragile",
  "frame", "frequent", "fresh", "friend", "fringe", "frog", "front", "frost", "frown", "frozen",
  "fruit", "fuel", "fun", "funny", "furnace", "fury", "future", "gadget", "gain", "galaxy",
  "gallery", "game", "gap", "garage", "garbage", "garden", "garlic", "garment", "gas", "gasp",
  "gate", "gather", "gauge", "gaze", "general", "genius", "genre", "gentle", "genuine", "gesture",
  "ghost", "giant", "gift", "giggle", "ginger", "giraffe", "girl", "give", "glad", "glance",
  "glare", "glass", "glide", "glimpse", "globe", "gloom", "glory", "glove", "glow", "glue",
  "goat", "goddess", "gold", "good", "goose", "gorilla", "gospel", "gossip", "govern", "gown",
  "grab", "grace", "grain", "grant", "grape", "grass", "gravity", "great", "green", "grid",
  "grief", "grit", "grocery", "group", "grow", "grunt", "guard", "guess", "guide", "guilt",
  "guitar", "gun", "gym", "habit", "hair", "half", "hammer", "hamster", "hand", "happy",
  "harbor", "hard", "harsh", "harvest", "hat", "have", "hawk", "hazard", "head", "health",
  "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen", "hero", "hidden",
  "high", "hill", "hint", "hip", "hire", "history", "hobby", "hockey", "hold", "hole",
  "holiday", "hollow", "home", "honey", "hood", "hope", "horn", "horror", "horse", "hospital",
  "host", "hotel", "hour", "hover", "hub", "huge", "human", "humble", "humor", "hundred",
  "hungry", "hunt", "hurdle", "hurry", "hurt", "husband", "hybrid", "ice", "icon", "idea",
  "identify", "idle", "ignore", "ill", "illegal", "illness", "image", "imitate", "immense", "immune",
  "impact", "impose", "improve", "impulse", "inch", "include", "income", "increase", "index", "indicate",
  "indoor", "industry", "infant", "inflict", "inform", "inhale", "inherit", "initial", "inject", "injury",
  "inmate", "inner", "innocent", "input", "inquiry", "insane", "insect", "inside", "inspire", "install",
  "intact", "interest", "into", "invest", "invite", "involve", "iron", "island", "isolate", "issue",
  "item", "ivory", "jacket", "jaguar", "jar", "jazz", "jealous", "jeans", "jelly", "jewel",
  "job", "join", "joke", "journey", "joy", "judge", "juice", "jump", "jungle", "junior",
  "junk", "just", "kangaroo", "keen", "keep", "ketchup", "key", "kick", "kid", "kidney",
  "kind", "kingdom", "kiss", "kit", "kitchen", "kite", "kitten", "kiwi", "knee", "knife",
  "knock", "know", "lab", "label", "labor", "ladder", "lady", "lake", "lamp", "language",
  "laptop", "large", "later", "latin", "laugh", "laundry", "lava", "law", "lawn", "lawsuit",
  "layer", "lazy", "leader", "leaf", "learn", "leave", "lecture", "left", "leg", "legal",
  "legend", "leisure", "lemon", "lend", "length", "lens", "leopard", "lesson", "letter", "level",
  "liar", "liberty", "library", "license", "life", "lift", "light", "like", "limb", "limit",
  "link", "lion", "liquid", "list", "little", "live", "lizard", "load", "loan", "lobster",
  "local", "lock", "logic", "lonely", "long", "loop", "lottery", "loud", "lounge", "love",
  "loyal", "lucky", "luggage", "lumber", "lunar", "lunch", "luxury", "lyrics", "machine", "mad",
  "magic", "magnet", "maid", "mail", "main", "major", "make", "mammal", "man", "manage",
  "mandate", "mango", "mansion", "manual", "maple", "marble", "march", "margin", "marine", "market",
  "marriage", "mask", "mass", "master", "match", "material", "math", "matrix", "matter", "maximum",
  "maze", "meadow", "mean", "measure", "meat", "mechanic", "medal", "media", "melody", "melt",
  "member", "memory", "mention", "menu", "mercy", "merge", "merit", "merry", "mesh", "message",
  "metal", "method", "middle", "midnight", "milk", "million", "mimic", "mind", "minimum", "minor",
  "minute", "miracle", "mirror", "misery", "miss", "mistake", "mix", "mixed", "mixture", "mobile",
  "model", "modify", "mom", "moment", "monitor", "monkey", "monster", "month", "moon", "moral",
  "more", "morning", "mosquito", "mother", "motion", "motor", "mountain", "mouse", "move", "movie",
  "much", "muffin", "mule", "multiply", "muscle", "museum", "mushroom", "music", "must", "mutual",
  "myself", "mystery", "myth", "naive", "name", "napkin", "narrow", "nasty", "nation", "nature",
  "near", "neck", "need", "negative", "neglect", "neither", "nephew", "nerve", "nest", "net",
  "network", "neutral", "never", "news", "next", "nice", "night", "noble", "noise", "nominee",
  "noodle", "normal", "north", "nose", "notable", "note", "nothing", "notice", "novel", "now",
  "nuclear", "number", "nurse", "nut", "oak", "obey", "object", "oblige", "obscure", "observe",
  "obtain", "obvious", "occur", "ocean", "october", "odor", "off", "offer", "office", "often",
  "oil", "okay", "old", "olive", "olympic", "omit", "once", "one", "onion", "online",
  "only", "open", "opera", "opinion", "oppose", "option", "orange", "orbit", "orchard", "order",
  "ordinary", "organ", "orient", "original", "orphan", "ostrich", "other", "outdoor", "outer", "output",
  "outside", "oval", "oven", "over", "own", "owner", "oxygen", "oyster", "ozone", "pact",
  "paddle", "page", "pair", "palace", "palm", "panda", "panel", "panic", "panther", "paper",
  "parade", "parent", "park", "parrot", "party", "pass", "patch", "path", "patient", "patrol",
  "pattern", "pause", "pave", "payment", "peace", "peanut", "pear", "peasant", "pelican", "pen",
  "penalty", "pencil", "people", "pepper", "perfect", "permit", "person", "pet", "phone", "photo",
  "phrase", "physical", "piano", "picnic", "picture", "piece", "pig", "pigeon", "pill", "pilot",
  "pink", "pioneer", "pipe", "pistol", "pitch", "pizza", "place", "planet", "plastic", "plate",
  "play", "please", "pledge", "pluck", "plug", "plunge", "poem", "poet", "point", "polar",
  "pole", "police", "pond", "pony", "pool", "popular", "portion", "position", "possible", "post",
  "potato", "pottery", "poverty", "powder", "power", "practice", "praise", "predict", "prefer", "prepare",
  "present", "pretty", "prevent", "price", "pride", "primary", "print", "priority", "prison", "private",
  "prize", "problem", "process", "produce", "profit", "program", "project", "promote", "proof", "property",
  "prosper", "protect", "proud", "provide", "public", "pudding", "pull", "pulp", "pulse", "pumpkin",
  "punch", "pupil", "puppy", "purchase", "purity", "purpose", "purse", "push", "put", "puzzle",
  "pyramid", "quality", "quantum", "quarter", "question", "quick", "quit", "quiz", "quote", "rabbit",
  "raccoon", "race", "rack", "radar", "radio", "rail", "rain", "raise", "rally", "ramp",
  "ranch", "random", "range", "rapid", "rare", "rate", "rather", "raven", "raw", "razor",
  "ready", "real", "reason", "rebel", "rebuild", "recall", "receive", "recipe", "record", "recycle",
  "reduce", "reflect", "reform", "refuse", "region", "regret", "regular", "reject", "relax", "release",
  "relief", "rely", "remain", "remember", "remind", "remove", "render", "renew", "rent", "reopen",
  "repair", "repeat", "replace", "report", "require", "rescue", "resemble", "resist", "resource", "response",
  "result", "retire", "retreat", "return", "reunion", "reveal", "review", "reward", "rhythm", "rib",
  "ribbon", "rice", "rich", "ride", "ridge", "rifle", "right", "rigid", "ring", "riot",
  "rip", "ripe", "rise", "risk", "rival", "river", "road", "roast", "robot", "robust",
  "rocket", "romance", "roof", "rookie", "room", "rose", "rotate", "rough", "round", "route",
  "royal", "rubber", "rude", "rug", "rule", "run", "runway", "rural", "sad", "saddle",
  "sadness", "safe", "sail", "salad", "salmon", "salon", "salt", "salute", "same", "sample",
  "sand", "satisfy", "satoshi", "sauce", "sausage", "save", "say", "scale", "scan", "scare",
  "scatter", "scene", "scheme", "school", "science", "scissors", "scorpion", "scout", "scrap", "screen",
  "script", "scrub", "sea", "search", "season", "seat", "second", "secret", "section", "security",
  "seed", "seek", "segment", "select", "sell", "seminar", "senior", "sense", "sentence", "series",
  "service", "session", "settle", "setup", "seven", "shadow", "shaft", "shallow", "share", "shed",
  "shell", "sheriff", "shield", "shift", "shine", "ship", "shiver", "shock", "shoe", "shoot",
  "shop", "short", "shoulder", "shove", "shrimp", "shrug", "shuffle", "shy", "sibling", "sick",
  "side", "siege", "sight", "sign", "silent", "silk", "silly", "silver", "similar", "simple",
  "since", "sing", "siren", "sister", "situate", "six", "size", "skate", "sketch", "ski",
  "skill", "skin", "skirt", "skull", "slab", "slam", "sleep", "slender", "slice", "slide",
  "slight", "slim", "slogan", "slot", "slow", "slush", "small", "smart", "smile", "smoke",
  "smooth", "snack", "snake", "snap", "sniff", "snow", "soap", "soccer", "social", "sock",
  "soda", "soft", "solar", "soldier", "solid", "solution", "solve", "someone", "song", "soon",
  "sorry", "sort", "soul", "sound", "soup", "source", "south", "space", "spare", "spatial",
  "spawn", "speak", "special", "speed", "spell", "spend", "sphere", "spice", "spider", "spike",
  "spin", "spirit", "split", "spoil", "sponsor", "spoon", "sport", "spot", "spray", "spread",
  "spring", "spy", "square", "squeeze", "squirrel", "stable", "stadium", "staff", "stage", "stairs",
  "stamp", "stand", "start", "state", "stay", "steak", "steel", "stem", "step", "stereo",
  "stick", "still", "sting", "stock", "stomach", "stone", "stool", "story", "stove", "strategy",
  "street", "strike", "strong", "struggle", "student", "stuff", "stumble", "style", "subject", "submit",
  "subway", "success", "such", "sudden", "suffer", "sugar", "suggest", "suit", "summer", "sun",
  "sunny", "sunset", "super", "supply", "supreme", "sure", "surface", "surge", "surprise", "surround",
  "survey", "suspect", "sustain", "swallow", "swamp", "swap", "swarm", "swear", "sweet", "swift",
  "swim", "swing", "switch", "sword", "symbol", "symptom", "syrup", "system", "table", "tackle",
  "tag", "tail", "talent", "talk", "tank", "tape", "target", "task", "taste", "tattoo",
  "taxi", "teach", "team", "tell", "ten", "tenant", "tennis", "tent", "term", "test",
  "text", "thank", "that", "theme", "then", "theory", "there", "they", "thing", "this",
  "thought", "three", "thrive", "throw", "thumb", "thunder", "ticket", "tide", "tiger", "tilt",
  "timber", "time", "tiny", "tip", "tired", "tissue", "title", "toast", "tobacco", "today",
  "toddler", "toe", "together", "toilet", "token", "tomato", "tomorrow", "tone", "tongue", "tonight",
  "tool", "tooth", "top", "topic", "topple", "torch", "tornado", "tortoise", "toss", "total",
  "tourist", "toward", "tower", "town", "toy", "track", "trade", "traffic", "tragic", "train",
  "transfer", "trap", "trash", "travel", "tray", "treat", "tree", "trend", "trial", "tribe",
  "trick", "trigger", "trim", "trip", "trophy", "trouble", "truck", "true", "truly", "trumpet",
  "trust", "truth", "try", "tube", "tuition", "tumble", "tuna", "tunnel", "turkey", "turn",
  "turtle", "twelve", "twenty", "twice", "twin", "twist", "two", "type", "typical", "ugly",
  "umbrella", "unable", "unaware", "uncle", "uncover", "under", "undo", "unfair", "unfold", "unhappy",
  "uniform", "unique", "unit", "universe", "unknown", "unlock", "until", "unusual", "unveil", "update",
  "upgrade", "uphold", "upon", "upper", "upset", "urban", "urge", "usage", "use", "used",
  "useful", "useless", "usual", "utility", "vacant", "vacuum", "vague", "valid", "valley", "valve",
  "van", "vanish", "vapor", "various", "vast", "vault", "vehicle", "velvet", "vendor", "venture",
  "venue", "verb", "verify", "version", "very", "vessel", "veteran", "viable", "vibrant", "vicious",
  "victory", "video", "view", "village", "vintage", "violin", "virtual", "virus", "visa", "visit",
  "visual", "vital", "vivid", "vocal", "voice", "void", "volcano", "volume", "vote", "voyage",
  "wage", "wagon", "wait", "walk", "wall", "walnut", "want", "warfare", "warm", "warrior",
  "wash", "wasp", "waste", "water", "wave", "way", "wealth", "weapon", "wear", "weasel",
  "weather", "web", "wedding", "weekend", "weird", "welcome", "west", "wet", "whale", "what",
  "wheat", "wheel", "when", "where", "whip", "whisper", "wide", "width", "wife", "wild",
  "will", "win", "window", "wine", "wing", "wink", "winner", "winter", "wire", "wisdom",
  "wise", "wish", "witness", "wolf", "woman", "wonder", "wood", "wool", "word", "work",
  "world", "worry", "worth", "wrap", "wreck", "wrestle", "wrist", "write", "wrong", "yard",
  "year", "yellow", "you", "young", "youth", "zebra", "zero", "zone", "zoo"
];

// ========== FUNÇÃO PARA GERAR FRASE DE RECUPERAÇÃO ==========
function gerarFraseRecuperacao() {
  let frase = [];
  for (let i = 0; i < 12; i++) {
    const randomIndex = crypto.randomInt(0, PALAVRAS_BIP39.length);
    frase.push(PALAVRAS_BIP39[randomIndex]);
  }
  return frase.join(' ');
}

// ========== CONFIGURAÇÃO DAS CHAVES GROQ ==========
const apiKeys = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2
].filter(key => key);

console.log(`🔑 ${apiKeys.length} chave(s) Groq carregada(s)`);

// Inicializar cliente Groq (se disponível)
let groqAvailable = false;
let groq;
if (apiKeys.length > 0) {
  try {
    const Groq = require('groq-sdk');
    groq = new Groq({ apiKey: apiKeys[0] });
    groqAvailable = true;
    console.log('✅ Cliente Groq inicializado');
  } catch (error) {
    console.log('⚠️ Cliente Groq não disponível (use npm install groq-sdk)');
  }
}

// Sistema de rodízio de chaves
let currentKeyIndex = 0;
const getNextClient = () => {
  if (!groqAvailable) return null;
  const client = new (require('groq-sdk'))({ apiKey: apiKeys[currentKeyIndex] });
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return client;
};

// ========== ROTAS DE ADMIN (GERAR CÓDIGOS) ==========
// Use esta rota para gerar códigos para seus clientes
app.post('/api/admin/gerar-codigos', (req, res) => {
  const { quantidade } = req.body;
  
  if (!quantidade || quantidade < 1) {
    return res.status(400).json({ erro: 'Quantidade inválida' });
  }
  
  const codigos = [];
  const placeholders = [];
  const values = [];
  
  for (let i = 0; i < quantidade; i++) {
    // Gerar código no formato ROTEIROS-ABC123-XYZ789
    const parte1 = Math.random().toString(36).substring(2, 8).toUpperCase();
    const parte2 = Math.random().toString(36).substring(2, 8).toUpperCase();
    const codigo = `ROTEIROS-${parte1}-${parte2}`;
    
    codigos.push(codigo);
    placeholders.push('(?)');
    values.push(codigo);
  }
  
  const sql = `INSERT INTO codigos (codigo) VALUES ${placeholders.join(',')}`;
  
  db.run(sql, values, function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao gerar códigos' });
    }
    
    res.json({ 
      sucesso: true, 
      quantidade: quantidade,
      codigos: codigos 
    });
  });
});

// Rota para listar códigos (útil para ver quais já foram usados)
app.get('/api/admin/listar-codigos', (req, res) => {
  db.all('SELECT * FROM codigos ORDER BY criado_em DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao listar códigos' });
    }
    res.json(rows);
  });
});

// ========== ROTAS DE AUTENTICAÇÃO ==========

// Rota de login (igual)
app.post('/api/login', (req, res) => {
  const { usuario, senha } = req.body;
  
  db.get('SELECT * FROM usuarios WHERE nome = ? AND senha = ?', [usuario, senha], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    
    if (row) {
      res.json({ sucesso: true, usuario: row.nome, usuarioId: row.id });
    } else {
      res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    }
  });
});

// ========== ROTA DE CADASTRO COM CÓDIGO E FRASE DE RECUPERAÇÃO ==========
app.post('/api/cadastro', (req, res) => {
  const { usuario, senha, email, codigo } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  // Validar campos
  if (!usuario || !senha || !codigo) {
    return res.status(400).json({ erro: 'Preencha todos os campos' });
  }
  
  // Verificar se o código existe e não foi usado
  db.get('SELECT * FROM codigos WHERE codigo = ? AND usado = 0', [codigo], (err, codigoRow) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    
    if (!codigoRow) {
      return res.status(400).json({ erro: '❌ Código de ativação inválido ou já utilizado' });
    }
    
    // Verificar se nome de usuário já existe
    db.get('SELECT id FROM usuarios WHERE nome = ?', [usuario], (err, usuarioRow) => {
      if (usuarioRow) {
        return res.status(400).json({ erro: 'Nome de usuário já existe' });
      }
      
      // Se email foi fornecido, verificar se já existe
      if (email) {
        db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, emailRow) => {
          if (emailRow) {
            return res.status(400).json({ erro: 'Email já cadastrado' });
          }
        });
      }
      
      // Gerar frase de recuperação
      const fraseRecuperacao = gerarFraseRecuperacao();
      const fraseHash = crypto.createHash('sha256').update(fraseRecuperacao).digest('hex');
      
      // Criar usuário com frase_hash
      db.run(
        'INSERT INTO usuarios (nome, senha, email, ip, frase_hash) VALUES (?, ?, ?, ?, ?)',
        [usuario, senha, email || null, ip, fraseHash],
        function(err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ erro: 'Erro ao criar usuário' });
          }
          
          const usuarioId = this.lastID;
          
          // Marcar código como usado
          db.run(
            'UPDATE codigos SET usado = 1, usado_em = CURRENT_TIMESTAMP, usuario_id = ? WHERE id = ?',
            [usuarioId, codigoRow.id],
            function(err) {
              if (err) {
                console.error(err);
              }
            }
          );
          
          // Criar registro de créditos para hoje
          const hoje = new Date().toISOString().split('T')[0];
          db.run(
            'INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 0, 10)',
            [usuarioId, hoje]
          );
          
          res.json({ 
            sucesso: true, 
            usuario, 
            usuarioId,
            fraseRecuperacao: fraseRecuperacao,
            mensagem: '✅ Conta criada! GUARDE ESTA FRASE EM LOCAL SEGURO.' 
          });
        }
      );
    });
  });
});

// ========== ROTA DE RECUPERAÇÃO POR FRASE ==========
app.post('/api/recuperar-frase', (req, res) => {
  const { frase, novaSenha } = req.body;
  
  if (!frase || !novaSenha) {
    return res.status(400).json({ erro: 'Frase e nova senha são obrigatórios' });
  }
  
  // Gerar hash da frase fornecida
  const fraseHash = crypto.createHash('sha256').update(frase.trim().toLowerCase()).digest('hex');
  
  // Buscar usuário com essa frase
  db.get(
    'SELECT id, nome FROM usuarios WHERE frase_hash = ?',
    [fraseHash],
    (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro no servidor' });
      }
      
      if (!user) {
        return res.status(400).json({ erro: 'Frase de recuperação inválida' });
      }
      
      // Atualizar senha
      db.run(
        'UPDATE usuarios SET senha = ? WHERE id = ?',
        [novaSenha, user.id],
        function(err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ erro: 'Erro ao atualizar senha' });
          }
          
          res.json({ 
            sucesso: true, 
            mensagem: '✅ Senha alterada com sucesso!',
            usuario: user.nome
          });
        }
      );
    }
  );
});

// ========== ROTAS DE CRÉDITOS ==========

// Rota para consultar créditos
app.get('/api/creditos', (req, res) => {
  const { usuarioId } = req.query;
  const hoje = new Date().toISOString().split('T')[0];
  
  if (!usuarioId) {
    return res.status(400).json({ erro: 'usuarioId é obrigatório' });
  }
  
  db.get(
    'SELECT usado, limite FROM creditos WHERE usuario_id = ? AND data = ?',
    [usuarioId, hoje],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro no servidor' });
      }
      
      if (row) {
        res.json({
          usado: row.usado,
          limite: row.limite,
          restante: row.limite - row.usado
        });
      } else {
        // Primeiro acesso do dia
        db.run(
          'INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 0, 10)',
          [usuarioId, hoje],
          function(err) {
            if (err) {
              console.error(err);
              return res.status(500).json({ erro: 'Erro no servidor' });
            }
            res.json({ usado: 0, limite: 10, restante: 10 });
          }
        );
      }
    }
  );
});

// Rota para incrementar créditos
app.post('/api/incrementar-creditos', (req, res) => {
  const { usuarioId } = req.body;
  const hoje = new Date().toISOString().split('T')[0];
  
  db.get(
    'SELECT usado, limite FROM creditos WHERE usuario_id = ? AND data = ?',
    [usuarioId, hoje],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro no servidor' });
      }
      
      if (row) {
        const novoUsado = row.usado + 1;
        if (novoUsado > row.limite) {
          return res.status(429).json({ erro: 'Limite diário excedido' });
        }
        
        db.run(
          'UPDATE creditos SET usado = ? WHERE usuario_id = ? AND data = ?',
          [novoUsado, usuarioId, hoje],
          function(err) {
            if (err) {
              console.error(err);
              return res.status(500).json({ erro: 'Erro no servidor' });
            }
            res.json({ usado: novoUsado, limite: row.limite, restante: row.limite - novoUsado });
          }
        );
      } else {
        // Primeiro acesso do dia
        db.run(
          'INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 1, 10)',
          [usuarioId, hoje],
          function(err) {
            if (err) {
              console.error(err);
              return res.status(500).json({ erro: 'Erro no servidor' });
            }
            res.json({ usado: 1, limite: 10, restante: 9 });
          }
        );
      }
    }
  );
});

// ========== ROTA DE TESTE ==========
app.get('/api/teste', (req, res) => {
  res.json({ 
    mensagem: '✅ API funcionando!',
    chavesAtivas: apiKeys.length,
    groqDisponivel: groqAvailable,
    banco: 'SQLite com códigos e frases de recuperação'
  });
});

// ========== ROTA PRINCIPAL DE GERAÇÃO ==========
app.post('/api/gerar-roteiro', async (req, res) => {
  try {
    const { ideia, tipoVideo, tom, idioma, usuarioId } = req.body;
    
    if (!usuarioId) {
      return res.status(400).json({ erro: 'Usuário não identificado' });
    }
    
    console.log(`📥 Usuário ${usuarioId} - ${ideia}`);

    if (!groqAvailable) {
      return res.status(503).json({ erro: 'Serviço de IA indisponível' });
    }

    let instrucaoTom = '';
    switch(tom) {
      case 'engracado': instrucaoTom = 'Use tom engraçado e divertido.'; break;
      case 'serio': instrucaoTom = 'Use tom sério e profissional.'; break;
      case 'motivacional': instrucaoTom = 'Use tom motivacional e inspirador.'; break;
      default: instrucaoTom = 'Use tom normal e equilibrado.';
    }

    let instrucaoIdioma = '';
    switch(idioma) {
      case 'ingles': instrucaoIdioma = 'Write in ENGLISH.'; break;
      case 'espanhol': instrucaoIdioma = 'Escribe en ESPAÑOL.'; break;
      case 'frances': instrucaoIdioma = 'Écrivez en FRANÇAIS.'; break;
      case 'alemao': instrucaoIdioma = 'Schreiben Sie auf DEUTSCH.'; break;
      case 'italiano': instrucaoIdioma = 'Scrivi in ITALIANO.'; break;
      default: instrucaoIdioma = 'Escreva em PORTUGUÊS.';
    }

    const prompt = tipoVideo === 'curto'
      ? `Crie um roteiro CURTO (máximo 60 segundos) sobre: "${ideia}".
         ${instrucaoIdioma}
         ${instrucaoTom}
         Formato obrigatório:
         TÍTULO: [título]
         ROTEIRO: [roteiro completo]`
      : `Crie um roteiro LONGO (mínimo 5 minutos) sobre: "${ideia}".
         ${instrucaoIdioma}
         ${instrucaoTom}
         Formato obrigatório:
         TÍTULO: [título]
         ROTEIRO: [roteiro completo]`;

    let lastError = null;
    let tentativas = 0;
    
    while (tentativas < apiKeys.length * 2) {
      tentativas++;
      const client = getNextClient();
      
      if (!client) {
        return res.status(503).json({ erro: 'Serviço de IA indisponível' });
      }
      
      try {
        console.log(`📤 Tentando com chave ${(currentKeyIndex % apiKeys.length) + 1}...`);
        
        const completion = await client.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          max_tokens: 1024
        });

        const texto = completion.choices[0].message.content;
        console.log('✅ Roteiro gerado com sucesso!');
        
        return res.json({ resultado: texto });

      } catch (error) {
        console.error(`❌ Erro com chave:`, error.message);
        lastError = error;
        
        if (error.status === 429) {
          console.log('⚠️ Rate limit, tentando próxima chave...');
          continue;
        }
      }
    }

    return res.status(500).json({ 
      erro: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.'
    });

  } catch (error) {
    console.error('❌ Erro no servidor:', error);
    res.status(500).json({ erro: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`💾 Banco SQLite: ${dbPath}`);
  console.log(`📊 Plano: 10 roteiros/dia por usuário (com códigos de ativação)`);
  console.log(`🔑 ${apiKeys.length} chave(s) Groq disponível(eis)`);
  console.log(`🔗 http://localhost:${PORT}/api/teste`);
  console.log(`🆕 Rota admin: http://localhost:${PORT}/api/admin/gerar-codigos (use POST)`);
  console.log(`🔐 Sistema de recuperação por frase de 12 palavras ativo\n`);
});