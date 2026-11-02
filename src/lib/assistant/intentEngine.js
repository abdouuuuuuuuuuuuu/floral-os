const PRODUCT_SHORTCUTS = {
  roses: 'rose', tulips: 'tulip', carnations: 'carnation', lilies: 'lily', orchids: 'orchid',
  mums: 'chrysanthemum', mum: 'chrysanthemum', chrysanths: 'chrysanthemum',
  chrysanthemums: 'chrysanthemum', hydrangeas: 'hydrangea', peonies: 'peony',
  alstro: 'alstroemeria', alstroemerias: 'alstroemeria',
}

const INTENT_LANGUAGE_ALIASES = [
  // French phrases
  ['cmmande', 'order'], ['comande', 'order'], ['commands', 'orders'], ['cete', 'this'], ['rtard', 'late'], ['reard', 'late'], ['retrad', 'late'], ['wste', 'waste'], ['wate', 'waste'], ['wase', 'waste'], ['waset', 'waste'], ['upaid', 'unpaid'],
  ['quel est le statut de la cmmande', 'what is the order status'], ['quel est le statut de la comande', 'what is the order status'],
  ['imprime le recu', 'print the receipt'], ['imprimer le recu', 'print the receipt'], ['reimprime le recu', 'reprint the receipt'],
  ['combien d argent avons nous gagne', 'how much money did we make'],
  ['que peux tu faire', 'what can you do'], ['comment creer une commande', 'how to create an order'],
  ['en cours', 'in progress'],
  ['transactions de caisse', 'cash register transactions'], ['transactions du coffre', 'cash register transactions'],
  ['quelles commandes ont ete creees', 'which orders were created'], ['commandes creees', 'orders created'], ['commandes en cours', 'orders in progress'],
  ['commandes impayees', 'unpaid orders'], ['pertes de fleurs', 'flower waste'],
  ['ont ete creees', 'were created'],
  ['ouvre la page des commandes', 'open the orders page'], ['donne moi un apercu', 'give me an overview'],
  ['combien coutent', 'how much do'], ['trouve le fournisseur', 'find the supplier'],
  ['la premiere', 'the first'], ['la deuxieme', 'the second'], ['la troisieme', 'the third'], ['la quatrieme', 'the fourth'],
  ["s'il vous plait", 'please'], ['s il vous plait', 'please'], ["s'il te plait", 'please'], ['s il te plait', 'please'],
  ['qui a cree', 'who created'], ['qui a commande', 'who ordered'], ['nom du client', 'customer name'],
  ['par nom du client', 'by customer name'], ['selon le nom du client', 'by customer name'],
  ['statut de paiement', 'payment status'], ['statut du paiement', 'payment status'], ['statut de la commande', 'order status'], ['quel est le statut de la commande', 'what is the order status'],
  ['date de livraison', 'delivery date'], ['heure de livraison', 'delivery time'], ['en retard', 'overdue'],
  ['cette semaine', 'this week'], ['la semaine prochaine', 'next week'], ['la semaine derniere', 'last week'], ['ce mois ci', 'this month'],
  ['aujourd hui', 'today'], ["aujourd'hui", 'today'], ['combien de', 'how many'], ['combien reste', 'how many left'],
  // Arabic phrases, with common hamza and article variants handled below too.
  ['رقم العمل', 'customer phone for'], ['رقم العميل', 'customer phone for'], ['كيف', 'how'], ['صباح الخر', 'good morning'], ['صباح اخير', 'good morning'],
  ['قيد امعالجة', 'processing'], ['قيد العالجة', 'processing'], ['قيد المالجة', 'processing'], ['قيد المعلاجة', 'processing'], ['قيد المعاجلة', 'processing'], ['قيد المعاجة', 'processing'], ['قيد المعالة', 'processing'], ['قيد الممعالجة', 'processing'],
  ['اطبع الايصال', 'print the receipt'], ['طباعة الايصال', 'print the receipt'], ['اطبع الإيصال', 'print the receipt'],
  ['ماذا يمكنك ان تفعل', 'what can you do'], ['ما هي المبيعات', 'what are sales'], ['اعرض معاملات الصندوق', 'show cash register transactions'],
  ['معاملات الصندوق', 'cash register transactions'], ['افتح صفحة الطلبات', 'open the orders page'],
  ['الطلبات المتأخرة', 'overdue orders'], ['الطلبات غير المدفوعة', 'unpaid orders'], ['هدر الزهور', 'flower waste'],
  ['أرني طلب', 'show me order for'], ['ارني طلب', 'show me order for'], ['سجل دفع', 'record payment'], ['للطلب', 'for order'],
  ['اعطني ملخص', 'give me a business overview'], ['أعطني ملخصا عن العمل', 'give me a business overview'], ['ما الطلبات التي أُنشئت اليوم', 'which orders were created today'], ['كيف أنشئ طلبا جديدا', 'how do i create a new order'], ['اعرض مبيعات', 'show sales'], ['كم حققنا من المال', 'how much money did we make'], ['قيد المعالجة', 'processing'], ['معاملات الصندوق', 'cash register transactions'],
  ['هل يمكنك', 'can you'],
  ['الثاني', 'second'], ['الثالث', 'third'], ['الأول', 'first'], ['الاول', 'first'],
  ['السلام عليكم', 'hello'], ['صباح الخير', 'good morning'], ['مساء الخير', 'good evening'], ['من فضلك', 'please'], ['لو سمحت', 'please'], ['الأمس', 'yesterday'], ['العمل', 'business'], ['ملخصا', 'overview'], ['ملخص', 'overview'], ['الخير', ''], ['معاملات', 'transactions'], ['الصندوق', 'cash register'], ['يمكنك', 'can you'], ['أن', 'you'], ['تفعل', 'do'],
  ['من انشأ', 'who created'], ['من أنشأ', 'who created'], ['من أنشئ', 'who created'],
  ['حسب اسم العميل', 'by customer name'], ['اسم العميل', 'customer name'], ['حالة الدفع', 'payment status'], ['حالة الطلب', 'order status'],
  ['الميل', 'customer'], ['العيل', 'customer'], ['الطلبت', 'orders'],
  ['تاريخ التسليم', 'delivery date'], ['موعد التسليم', 'delivery date'], ['كم تبقى', 'how many left'], ['كم عدد', 'how many'],
  ['الأسبوع القادم', 'next week'], ['الاسبوع القادم', 'next week'], ['هذا الأسبوع', 'this week'], ['هذا الاسبوع', 'this week'],
  ['ابحث عن', 'find'], ['اعثر على', 'find'], ['أرني', 'show'], ['ارني', 'show'],
  // French words
  ['bonjour', 'hello'], ['bonsoir', 'good evening'], ['salut', 'hey'],
  ['imprime', 'print'], ['imprimer', 'print'], ['recu', 'receipt'], ['reçu', 'receipt'],
  ['peux', 'can'], ['faire', 'do'], ['comment', 'how'], ['ouvre', 'open'], ['ouvrir', 'open'], ['page', 'page'],
  ['coutent', 'cost'], ['coutent', 'cost'], ['impayees', 'unpaid'], ['impayee', 'unpaid'], ['pertes', 'waste'],
  ['fournisseurs', 'suppliers'], ['fournisseur', 'supplier'], ['apercu', 'overview'], ['activite', 'business'], ['donne', 'give'],
  ['transaction', 'transaction'], ['transactions', 'transactions'], ['caisse', 'cash register'], ['que', 'what'], ['quel', 'what'], ['quelle', 'which'], ['est', 'is'], ['tu', 'you'], ['dans', 'in'], ['argent', 'money'], ['avons', 'have'], ['nous', 'we'], ['gagne', 'earned'], ['cette', 'this'], ['ctte', 'this'], ['semaine', 'week'], ['cours', 'progress'], ['plait', 'please'], ['ont', 'have been'], ['ete', ''], ['creees', 'created'], ['aujourd', 'today'], ['creatd', 'created'], ['ordes', 'orders'], ['ordesr', 'orders'], ['cmmandes', 'orders'], ['comandes', 'orders'],
  ['premiere', 'first'], ['deuxieme', 'second'], ['troisieme', 'third'], ['quatrieme', 'fourth'],
  ['commandes', 'orders'], ['commande', 'order'], ['clients', 'customers'], ['client', 'customer'],
  ['fleurs', 'flowers'], ['fleur', 'flower'], ['rouges', 'red'], ['rouge', 'red'], ['blanches', 'white'], ['blanche', 'white'],
  ['livraisons', 'deliveries'], ['livraison', 'delivery'], ['trouve', 'find'], ['trouvez', 'find'], ['cherche', 'find'], ['chercher', 'find'], ['recherche', 'search'],
  ['montre', 'show'], ['montrer', 'show'], ['affiche', 'show'], ['afficher', 'show'], ['liste', 'list'], ['lister', 'list'],
  ['cree', 'create'], ['creer', 'create'], ['annule', 'cancel'], ['annuler', 'cancel'], ['supprime', 'delete'], ['supprimer', 'delete'],
  ['modifie', 'edit'], ['modifier', 'edit'], ['ajoute', 'add'], ['ajouter', 'add'], ['paiement', 'payment'], ['statut', 'status'],
  ['numero', 'number'], ['telephone', 'phone'], ['prix', 'price'], ['combien', 'how many'], ['reste', 'left'], ['restent', 'left'],
  ['derniere', 'last'], ['dernieres', 'last'], ['dernier', 'last'], ['derniers', 'last'], ['demain', 'tomorrow'], ['hier', 'yesterday'], ['semaine', 'week'], ['mois', 'month'],
  ['par', 'by'], ['pour', 'for'], ['avec', 'with'], ['les', 'the'], ['des', 'the'], ['une', 'a'], ['un', 'a'], ['du', 'of'], ['de', 'of'], ['la', 'the'], ['le', 'the'], ['en', 'in'], ['et', 'and'],
  // Arabic words
  ['مرحبا', 'hello'], ['صباح', 'morning'], ['مساء', 'evening'], ['الطلبات', 'orders'], ['طلبات', 'orders'], ['الطلب', 'order'], ['طلب', 'order'], ['طلبا', 'order'], ['جديدا', 'new'], ['لأمل', 'for amal'], ['لامل', 'for amal'],
  ['يمكنك', 'can'], ['ماذا', 'what'], ['تفعل', 'do'], ['افتح', 'open'], ['صفحة', 'page'], ['غير', 'unpaid'], ['المدفوعة', 'paid'], ['المبيعات', 'sales'],
  ['اطبع', 'print'], ['طباعة', 'print'], ['الإيصال', 'receipt'], ['الايصال', 'receipt'],
  ['المتأخرة', 'overdue'], ['الموردين', 'suppliers'], ['المورد', 'supplier'], ['هدر', 'waste'], ['المال', 'money'], ['حققنا', 'earned'],
  ['العميل', 'customer'], ['العملاء', 'customers'], ['عميل', 'customer'], ['الزبون', 'customer'], ['زهور', 'flowers'], ['الزهور', 'flowers'], ['ورود', 'flowers'], ['الورد', 'flowers'],
  ['الحمراء', 'red'], ['حمراء', 'red'], ['احمر', 'red'], ['أحمر', 'red'], ['المخزون', 'stock'], ['مخزون', 'stock'], ['التوصيلات', 'deliveries'], ['توصيلات', 'deliveries'], ['التوصيل', 'delivery'], ['توصيل', 'delivery'],
  ['اليوم', 'today'], ['غداً', 'tomorrow'], ['غدا', 'tomorrow'], ['أمس', 'yesterday'], ['امس', 'yesterday'], ['آخر', 'last'], ['اخر', 'last'], ['أنشأ', 'created'], ['انشأ', 'created'], ['أنشئت', 'created'], ['انشئت', 'created'], ['أنشئ', 'create'], ['انشئ', 'create'],
  ['اعرض', 'show'], ['أعرض', 'show'], ['ابحث', 'find'], ['كم', 'how many'], ['تبقى', 'left'], ['بقي', 'left'], ['حالة', 'status'], ['الدفع', 'payment'], ['رقم', 'number'], ['هاتف', 'phone'], ['اسم', 'name'], ['سعر', 'price'], ['أسعار', 'prices'], ['اسعار', 'prices'], ['أضف', 'add'], ['اضف', 'add'], ['احذف', 'delete'], ['حذف', 'delete'], ['الغاء', 'cancel'], ['ألغ', 'cancel'], ['عدل', 'edit'], ['عدّل', 'edit'], ['الأسبوع', 'week'], ['الاسبوع', 'week'], ['هذا', 'this'], ['شهر', 'month'], ['الأسبوعي', 'weekly'], ['يا', ''], ['من', 'of'], ['في', 'in'],
].sort((left, right) => right[0].length - left[0].length)

const INTENT_ALIAS_PATTERNS = INTENT_LANGUAGE_ALIASES.map(([source, target]) => ({
  pattern: new RegExp(`(^|[^\\p{L}\\p{N}])${normalize(source).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'gu'),
  target,
}))
const INTENT_WORD_TARGETS = new Map(INTENT_LANGUAGE_ALIASES
  .filter(([source]) => !/\s/.test(source))
  .map(([source, target]) => [normalize(source), target]))
const CANONICAL_INTENT_WORDS = new Set([
  'blossom', 'order', 'orders', 'ordered', 'customer', 'customers', 'client', 'clients', 'flower', 'flowers', 'stock', 'inventory', 'delivery', 'deliveries',
  'create', 'created', 'creating', 'edit', 'edited', 'delete', 'deleted', 'cancel', 'cancelled', 'canceled', 'payment', 'payments', 'paid', 'unpaid', 'status', 'number', 'phone', 'price', 'today', 'tomorrow', 'yesterday',
  'week', 'month', 'show', 'find', 'search', 'list', 'who', 'what', 'how', 'many', 'left', 'red', 'white', 'last', 'overdue', 'done',
  'processing', 'good', 'morning', 'please', 'supplier', 'suppliers', 'vendor', 'vendors', 'overview', 'report', 'reports', 'sales', 'revenue', 'cash', 'receipt', 'refund', 'rose', 'roses', 'tulip', 'tulips', 'bouquet',
])

function oneEditApart(left, right) {
  const a = [...left]; const b = [...right]
  if (Math.abs(a.length - b.length) > 1 || left === right) return false
  let i = 0; let j = 0; let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue }
    edits += 1
    if (edits > 1) return false
    if (a.length === b.length) {
      if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; continue }
      i += 1; j += 1
    } else if (a.length > b.length) i += 1
    else j += 1
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) === 1
}

function correctIntentKeywordTypos(text) {
  const candidates = [...new Set([...INTENT_WORD_TARGETS.keys(), ...CANONICAL_INTENT_WORDS])]
  return text.replace(/[\p{L}\p{M}\p{N}]+/gu, (token) => {
    if ([...token].length < 4) return token
    if (INTENT_WORD_TARGETS.has(token) || CANONICAL_INTENT_WORDS.has(token)) return token
    const matches = candidates.filter((candidate) => oneEditApart(token, candidate))
    const canonicalMatches = matches.filter((candidate) => CANONICAL_INTENT_WORDS.has(candidate))
    if (canonicalMatches.length === 1) return canonicalMatches[0]
    const targets = new Set(matches.map((candidate) => INTENT_WORD_TARGETS.get(candidate) ?? candidate))
    return targets.size === 1 ? [...targets][0] : token
  })
}

const ALGIERS_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
})
const REPORT_PERIOD_CACHE = new Map()
let cachedAlgiersDate = ''
let cachedAlgiersParts = null

export function productMatchesTerms(product, terms) {
  if (!terms.length) return false
  const searchable = normalize([product.item_name, product.color, product.flower_type, product.category].filter(Boolean).join(' '))
  const words = searchable.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return terms.every((term) => words.some((word) => word === term || word.startsWith(term) || (term.endsWith('s') && word.startsWith(term.slice(0, -1)))))
}

export function reportPeriodFromText(text) {
  const source = normalize(text)
  const todayStamp = ALGIERS_DATE_FORMATTER.format(new Date())
  const cacheKey = `${todayStamp}|${source}`
  if (REPORT_PERIOD_CACHE.has(cacheKey)) return REPORT_PERIOD_CACHE.get(cacheKey)
  const result = computeReportPeriod(source, todayStamp)
  if (REPORT_PERIOD_CACHE.size >= 1000) REPORT_PERIOD_CACHE.clear()
  REPORT_PERIOD_CACHE.set(cacheKey, result)
  return result
}

function computeReportPeriod(source, todayStamp) {
  if (todayStamp !== cachedAlgiersDate || !cachedAlgiersParts) {
    cachedAlgiersDate = todayStamp
    cachedAlgiersParts = Object.fromEntries(ALGIERS_DATE_FORMATTER.formatToParts(new Date())
      .filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  }
  const todayParts = cachedAlgiersParts
  const todayKey = `${todayParts.year}-${todayParts.month}-${todayParts.day}`
  const startOfDay = new Date(`${todayKey}T00:00:00Z`)
  const addDays = (date, amount) => {
    const next = new Date(date)
    next.setUTCDate(next.getUTCDate() + amount)
    return next
  }
  const dateKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  const dayLabel = (date, options) => date.toLocaleDateString('en', { ...options, timeZone: 'UTC' })
  const iso = source.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  let start
  let end
  let label
  if (iso) {
    start = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(start.getTime()) || dateKey(start) !== iso) return null
    end = addDays(start, 1)
    label = dayLabel(start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  } else if (/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(source)) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const monthToken = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
    const monthFirst = source.match(new RegExp(`\\b${monthToken}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`))
    const dayFirst = source.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${monthToken}(?:,?\\s+(20\\d{2}))?\\b`))
    const month = monthFirst?.[1] || dayFirst?.[2]
    const day = Number(monthFirst?.[2] || dayFirst?.[1])
    const year = Number(monthFirst?.[3] || dayFirst?.[3] || startOfDay.getUTCFullYear())
    const monthIndex = monthNames.findIndex((name) => name.startsWith(month.toLowerCase().slice(0, 3)))
    if (monthIndex < 0 || day < 1 || day > 31) return null
    start = new Date(Date.UTC(year, monthIndex, day))
    if (start.getUTCMonth() !== monthIndex || start.getUTCDate() !== day) return null
    end = addDays(start, 1)
    label = dayLabel(start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  } else if (/\byesterday\b/.test(source)) {
    start = addDays(startOfDay, -1); end = startOfDay; label = 'yesterday'
  } else if (/\btomorrow\b/.test(source)) {
    start = addDays(startOfDay, 1); end = addDays(start, 1); label = 'tomorrow'
  } else if (/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(source)) {
    const weekday = source.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)[1]
    const targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday)
    const prefix = source.match(/\b(last|previous|next|this)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)?.[1]
    let offset = (targetDay - startOfDay.getUTCDay() + 7) % 7
    if (prefix === 'last' || prefix === 'previous') offset = offset === 0 ? -7 : offset - 7
    else if (prefix === 'next') offset = offset === 0 ? 7 : offset + 7
    else if (prefix === 'this' && offset === 0) offset = 0
    start = addDays(startOfDay, offset); end = addDays(start, 1)
    label = dayLabel(start, { weekday: 'long', month: 'long', day: 'numeric' })
  } else if (/\b(last|previous)\s+week\b|\bpast\s+7\s+days\b/.test(source)) {
    const monday = addDays(startOfDay, -((startOfDay.getUTCDay() + 6) % 7))
    if (/past\s+7\s+days/.test(source)) { start = addDays(startOfDay, -6); end = addDays(startOfDay, 1); label = 'the last 7 days' }
    else { end = monday; start = addDays(end, -7); label = 'last week' }
  } else if (/\bnext\s+week\b/.test(source)) {
    const monday = addDays(startOfDay, -((startOfDay.getUTCDay() + 6) % 7))
    start = addDays(monday, 7); end = addDays(start, 7); label = 'next week'
  } else if (/\bthis\s+week\b|\bweek\s+to\s+date\b|\bweekly\b/.test(source)) {
    start = addDays(startOfDay, -((startOfDay.getUTCDay() + 6) % 7)); end = addDays(startOfDay, 1); label = 'this week to date'
  } else if (/\b(last|previous)\s+month\b/.test(source)) {
    end = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1))
    start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1)); label = 'last month'
  } else if (/\bthis\s+month\b|\bmonth\s+to\s+date\b|\bmonthly\b/.test(source)) {
    start = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1))
    end = addDays(startOfDay, 1); label = 'this month to date'
  } else if (/\btoday\b|\bdaily\b/.test(source)) {
    start = startOfDay; end = addDays(start, 1); label = 'today'
  } else return null

  const duration = Math.max(1, Math.round((end - start) / 86400000))
  const previousEnd = new Date(start)
  const previousStart = addDays(previousEnd, -duration)
  return {
    startDate: dateKey(start), endDate: dateKey(end), label,
    previousStartDate: dateKey(previousStart), previousEndDate: dateKey(previousEnd),
  }
}

export function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670]/g, '').toLowerCase().replace(/(?<=\p{L})[-–—](?=\p{L})/gu, ' ').trim()
}

export function normalizeIntentText(value = '') {
  let text = correctIntentKeywordTypos(normalize(value))
  for (const { pattern, target } of INTENT_ALIAS_PATTERNS) text = text.replace(pattern, (_match, prefix) => `${prefix}${target}`)
  return text.replace(/\s+/g, ' ').trim()
}

export function isGreetingMessage(value = '') {
  const text = normalizeIntentText(value).replace(/[,.!?؟،]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:please|can you|could you|s il te (?:plait|please)|s il vous (?:plait|please)|stp|svp|peux tu|pouvez vous)\s+|من فضلك\s+|هل يمكنك\s+)/u, '')
    .replace(/(?:\s+please){1,4}$/u, '')
  if (/^(?:bonjour|bonsoir|salut|coucou|bonne matinée|bonne soiree)(?:\s+[\p{L}]{2,24})?(?:\s+(?:comment allez vous|ca va|comment vas tu))?$/u.test(text)) return true
  if (/^(?:صباح الخير|مساء الخير|السلام عليكم|مرحبا|مرحباً|أهلا|اهلا)(?:\s+(?:يا\s+)?[\p{L}]{2,24})?$/u.test(text)) return true
  const name = '(?:\\s+[\\p{L}]{2,24})?'
  const greet = new RegExp(`^(?:(?:hey|hi|hello|hiya|howdy)\\s+)?(?:good morning|morning|good afternoon|afternoon|good evening|evening|good night|hey|hi|hello|hiya|howdy)${name}(?:\\s+(?:how are you|how is it going|what is up))?$`, 'u')
  const social = new RegExp(`^(?:(?:hey|hi|hello|hiya|howdy)\\s+)?(?:how are you(?: doing)?|how is it going|what is up|are you (?:good|okay|ok|well|doing well)|you good|what about you|how(?:'s| is) your day)${name}$`, 'u')
  return greet.test(text) || social.test(text)
}

export function cleanCustomerSearchTerm(value = '') {
  return String(value)
    .replace(/[?.!,]+$/g, '')
    .replace(/^(?:(?:please|can you|could you)\s+)?(?:the\s+)?(?:(?:client|customer)\s+)?(?:name\s+of\s+)?(?:the\s+)?/i, '')
    .replace(/^(?:name\s+)/i, '')
    .trim()
}

export function productSearchTerms(value) {
  return normalizeIntentText(value).replace(/baby'?s? breath/g, 'gypsophila').replace(/baby-breath/g, 'gypsophila')
    .split(/\s+/).map((term) => term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean)
    .map((term) => PRODUCT_SHORTCUTS[term] || term)
    .filter((term) => !/^\d+$/.test(term) && !['add', 'with', 'please', 'of', 'the', 'a', 'an', 'i', 'my', 'our', 'product', 'products', 'item', 'items', 'flower', 'flowers', 'stem', 'stems', 'in', 'on', 'stock', 'inventory', 'left', 'remain', 'remaining', 'available', 'availability', 'is', 'are', 'any', 'do', 'does', 'we', 'you', 'have', 'how', 'many', 'much', 'there', 'ones', 'which', 'what', 'show', 'me', 'quantity', 'count', 'low', 'out', 'no', 'zero', 'sold', 'almost', 'nearly', 'running', 'run', 'restock', 'restocking', 'replenish', 'threshold', 'below', 'under', 'all', 'total', 'overall', 'summary', 'overview', 'levels', 'across', 'information', 'info', 'stocktaking', 'informations', 'healthy', 'enough', 'well', 'medium', 'moderate', 'plenty', 'good', 'value', 'worth', 'valuation', 'cost', 'purchase', 'wholesale', 'retail', 'check', 'tell', 'get'].includes(term))
}

export function isClearInventoryQuestion(text) {
  if (/\b(order|orders|commande|commandes|ordered|sold)\b/.test(text)) return false
  const inventoryEntity = /\b(stock|inventory|products?|flowers?|stems?|roses?|tulips?|carnations?|lilies|orchids?|plants?)\b/.test(text)
  const inventoryRequest = /\b(how many|quantity|count|left|remaining|available|in stock|stock|inventory|restock|price|cost)\b/.test(text)
  return inventoryEntity && inventoryRequest
}

export function isLikelyCustomerNameCandidate(value = '') {
  const tokens = normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean)
  const intentWords = new Set(['and', 'about', 'what', 'who', 'how', 'many', 'much', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'it', 'its', 'that', 'this', 'order', 'orders', 'customer', 'client', 'name', 'status', 'state', 'new', 'processing', 'ready', 'done', 'completed', 'cancelled', 'canceled', 'payment', 'paid', 'unpaid', 'number', 'phone', 'date', 'time', 'delivery', 'delivered', 'due', 'total', 'balance', 'items', 'item', 'products', 'product', 'flowers', 'flower', 'stems', 'rose', 'roses', 'tulip', 'tulips', 'carnation', 'carnations', 'lily', 'lilies', 'orchid', 'orchids', 'chrysanthemum', 'hydrangea', 'bouquet', 'red', 'white', 'pink', 'stock', 'inventory', 'left', 'remaining', 'available', 'today', 'tomorrow', 'yesterday', 'week', 'month', 'in', 'on', 'for', 'from', 'of', 'have', 'has', 'do', 'does', 'i', 'we', 'my', 'our'])
  return tokens.length > 0 && tokens.length <= 4 && tokens.every((token) => !intentWords.has(token))
}

export function orderFactsRequested(text) {
  if (/\b(?:whole|full|entire|complete)\s+order\b|\bfull details\b|\ball (?:the )?(?:order )?details\b|\beverything about (?:the )?order\b|\bdetails (?:of|for) (?:the )?order\b|\border\s+(?:full\s+)?details\b/.test(text)) return ['full']
  const facts = []
  // Ask for the staff creator before the generic “who/name” rule, which is
  // intended to identify the customer on the order.
  const asksCreator = /\b(?:who|which staff|which team member)\b.*\b(?:created|made|entered|placed)\b|\b(?:creator|created by|staff member)\b/.test(text)
  if (asksCreator) facts.push('created_by')
  if (!asksCreator && (((/\b(name|who)\b/.test(text) && /\b(client|customer|for|order)\b/.test(text)) || (/\bwho\b/.test(text) && /\border\b/.test(text))))) facts.push('client_name')
  if (/\b(phone|telephone|contact number|mobile)\b/.test(text)
    || (/\b(number|contact)\b/.test(text) && /\b(client|customer|their|his|her)\b/.test(text))) facts.push('client_phone')
  if (/\bpayment status\b/.test(text)) facts.push('payment_status')
  else if (/\b(status|state)\b/.test(text)) facts.push('status')
  if (/\b(order number|order no\.?|number of (?:the )?order|what(?:'s| is) (?:its |the )?number)\b/.test(text)) facts.push('order_number')
  if (/\b(delivery date|date of (?:the )?delivery|scheduled date|date .* delivered|when .* (?:due|deliver|arrive)|what day .* delivery)\b/.test(text)) facts.push('delivery_date')
  else if (/\b(delivery time|what time .* (?:deliver|due)|time of .* delivery)\b/.test(text)) facts.push('delivery_time')
  if (/\b(delivery method|delivery type|how .* delivered)\b/.test(text)) facts.push('delivery_method')
  if (/\b(payment method|paid by|payment type)\b/.test(text)) facts.push('payment_method')
  if (/\b(amount paid|how much .* paid|how much .* pay(?:ment)? .* received)\b/.test(text)) facts.push('amount_paid')
  else if (/\b(amount due|balance due|still owe|remaining balance|how much .* owe|how much .* left to pay)\b/.test(text)) facts.push('amount_due')
  else if (/\b(total|price|cost|value)\b/.test(text) && /\b(order|it|this)\b/.test(text)) facts.push('total_amount')
  if (/\b(products?|items?|flowers?|what did .* order|what .* ordered|contain|include)\b/.test(text)) facts.push('items')
  if (/\b(notes?|instructions?|card message)\b/.test(text)) facts.push('notes')
  if (/\b(created|placed|creation date|when was .* made|when was .* created)\b/.test(text)) facts.push('created_at')
  // A bare order-number lookup means “show me the order”, so include the
  // useful record instead of returning a heading with no meaningful answer.
  return facts.length ? [...new Set(facts)] : ['full']
}

export function classifyQuestion(question, previousIntent = null, conversationContext = null) {
  const permanentDeleteCommand = String(question).trim().match(/^pepepeace\s+#(\d{1,20})$/i)
  if (permanentDeleteCommand) {
    return {
      type: 'order_delete',
      orderNumber: permanentDeleteCommand[1],
      deleteCommand: `pepepeace #${permanentDeleteCommand[1]}`,
      prompt: question,
    }
  }
  const text = normalizeIntentText(question)
  if (isGreetingMessage(question)) return { type: 'greeting', prompt: question }
  if (/^(?:(?:(?:please|can you|could you|and|also|what about|et pour|et|and for|وماذا عن|وكذلك|من فضلك)\s+)*)(?:(?:what(?:'s| is)|tell me|show me)\s+)?(?:the\s+)?(?:payment status|order status|status|order number|client name|customer name|phone number|delivery date|delivery time|delivery method|order details|order items|items in the order)[?.!\s]*(?:please|s il te plait|s il vous plait)?$/u.test(text)) {
    return { type: 'order_clarification', prompt: question }
  }
  const selectionText = text.replace(/^(?:(?:and|what about|please|et pour|et|and for|وماذا عن|وكذلك|من فضلك)\s+)+/u, '').replace(/\s+(?:please|s il te plait|s il vous plait)$/u, '').trim()
  const selectionPhrase = selectionText.match(/^(?:(?:please|can you|could you|s il te please|s il vous please)\s+)?(?:open|show|view)?\s*(?:the\s+)?([\p{L}\d]+)(?:\s+one)?(?:\s+please){0,4}$/u)
  const ordinalNames = { first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2 }
  const atMostOneEdit = (left, right) => {
    if (Math.abs(left.length - right.length) > 1) return false
    let a = 0; let b = 0; let edits = 0
    while (a < left.length && b < right.length) {
      if (left[a] === right[b]) { a += 1; b += 1; continue }
      edits += 1
      if (edits > 1) return false
      if (left.length === right.length) {
        if (left[a + 1] === right[b] && left[a] === right[b + 1]) { a += 2; b += 2; continue }
        a += 1; b += 1
      } else if (left.length > right.length) a += 1
      else b += 1
    }
    return edits + (a < left.length || b < right.length ? 1 : 0) <= 1
  }
  const selectionToken = selectionPhrase?.[1]
  const selectionIndex = selectionToken == null ? null : ordinalNames[selectionToken]
    ?? Object.entries(ordinalNames).find(([word]) => word.length >= 4 && atMostOneEdit(selectionToken, word))?.[1]
  const canSelectPriorResult = ['order_lookup', 'order_search', 'order_customer_fact', 'orders_list', 'orders_status', 'orders_due', 'orders_period', 'deliveries', 'deliveries_period', 'overdue'].includes(previousIntent?.type)
  if (selectionIndex != null && canSelectPriorResult) {
    return { type: 'select_result', index: selectionIndex, prompt: question }
  }
  // Continue a delivery result set when the operator asks for its next page.
  // Keep the original date/status filters so short follow-ups stay on topic.
  if (['deliveries', 'deliveries_period', 'overdue'].includes(previousIntent?.type)
    && /^(?:(?:show|give me)\s+)?(?:more|next|the next page|next page|remaining)(?:\s+(?:deliveries|orders|ones|results|page))?[?.!]*$/.test(text)) {
    return { ...previousIntent, page: Number(previousIntent.page || 0) + 1, prompt: question }
  }
  const supplierFact = /\b(payment|payments|paid|pay|sent)\b/.test(text)
    ? 'payment_history'
    : /\b(purchases?|bought|received|purchase history|transactions?)\b/.test(text) ? 'purchase_history' : null
  const supplierPaymentQuestion = text.match(/\b(?:how much|what|show|list|when|tell me).{0,50}\b(?:paid|payment|payments|sent)\b.{0,30}\b(?:to|for|with)\s+(?:the\s+)?(?:supplier\s+)?(.+?)[?.!]*$/)
    || text.match(/\b(?:payments?|payment history)\s+(?:to|for|with)\s+(?:the\s+)?(?:supplier\s+)?(.+?)[?.!]*$/)
    || text.match(/\b(?:how much|what amount)\b.{0,35}\b(?:did we pay|have we paid|we paid|we have paid)\s+(?:the\s+)?(?:supplier\s+)?(.+?)[?.!]*$/)
  if (supplierPaymentQuestion?.[1]) return { type: 'supplier_lookup', name: supplierPaymentQuestion[1].trim(), requestedFact: 'payment_history', prompt: question }
  const supplierPurchaseQuestion = text.match(/\bwhat (?:did|have) we (?:buy|bought|purchase|purchased|receive|received) from (?:the )?(?:supplier )?(.+?)[?.!]*$/)
  if (supplierPurchaseQuestion?.[1]) return { type: 'supplier_lookup', name: supplierPurchaseQuestion[1].trim(), requestedFact: 'purchase_history', prompt: question }
  if (previousIntent?.type === 'supplier_lookup' && previousIntent.name && supplierFact) {
    return { ...previousIntent, requestedFact: supplierFact, prompt: question }
  }
  const supplierQuery = text.match(/\b(?:find|search|look up|show|tell me about|who is)\s+(?:the\s+)?supplier\s+(.+?)[?.!]*$/)
  if (supplierQuery?.[1]) return { type: 'supplier_lookup', name: supplierQuery[1].replace(/\s+(?:purchase|purchases|payment|payments|paid|history|transactions?)\b.*$/, '').trim(), requestedFact: supplierFact, prompt: question }
  if (/\b(suppliers?|vendors?)\b/.test(text) && /\b(list|show|find|search| owe|balance|purchase|bought|payment|paid|contact|phone|email)\b/.test(text)) {
    const name = text.match(/\b(?:for|named?|called|owe(?:d)? to|balance (?:with|for|of)|due to)\s+(?:the\s+)?(?:supplier\s+)?(.+?)[?.!]*$/)?.[1]?.trim()
    return name ? { type: 'supplier_lookup', name: name.replace(/\s+(?:purchase|purchases|payment|payments|paid|history|transactions?)\b.*$/, '').trim(), requestedFact: supplierFact, prompt: question } : { type: 'supplier_lookup', name: '', requestedFact: supplierFact, prompt: question }
  }
  const customerOrderHistory = text.match(/\b(?:what did|what has|what products did|what items did)\s+(?:customer\s+)?(.+?)\s+(?:order|buy|purchase|pick up)\b/)
    || text.match(/\b(?:show|list)\s+(?:me\s+)?(?:the\s+)?(?:order|purchase)\s+history\s+(?:for|of)\s+(.+?)[?.!]*$/)
    || text.match(/\borders?\s+(?:history|purchased|ordered)\s+(?:for|by|from)\s+(.+?)[?.!]*$/)
  const customerHistoryName = customerOrderHistory?.[1]?.trim()
  if (customerHistoryName && isLikelyCustomerNameCandidate(customerHistoryName)) return { type: 'customer_lookup', name: customerHistoryName, requestedFact: 'order_history', prompt: question }
  if ((/\b(cash register|cash drawer|cash balance|cash in|cash out|register closed|register open|cash transactions?)\b|\bcash.{0,24}\bregister\b|\bregister.{0,24}\bcash\b/.test(text)
    || /\b(?:how much|what(?: is|'s)|do we have|show|list|total)\b.{0,35}\bcash\b/.test(text))
    && /\b(show|list|how much|what|total|transactions?|balance|in|out|do we have|today|yesterday|week|month|\d{4}-\d{2}-\d{2})\b/.test(text)) {
    const targetDate = text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || null
    return { type: 'cash_register', targetDate, period: reportPeriodFromText(text), offset: /\byesterday\b/.test(text) ? -1 : 0, detail: /\b(list|show|transactions?|entries|each)\b/.test(text), prompt: question }
  }
  if (/^(?:كيف|أين|اين)\b.*(?:طلب|الطلب|الطلبات|طلبات)/u.test(text)) return { type: 'how_to', topic: text, prompt: question }
  const directCreateRequest = /\b(?:create|make|place|start|build|prepare)\b.*\borders?\b/.test(text)
    || /\b(?:new|another)\s+order\b/.test(text)
  const instructionalCreate = /\b(?:how|where|help)\b.{0,35}\b(?:create|make|place|start|build|prepare)\b.*\border\b/.test(text)
  if (directCreateRequest && !instructionalCreate) return { type: 'order_create', prompt: question }
  const explicitDelayAction = /\b(delay|postpone|reschedule|push back|move)\b/.test(text)
    && /\b(order|orders|commande|commandes)\b/.test(text)
    && !/^\s*(?:how|where|help)\b/.test(text)
  if (explicitDelayAction) {
    const delayedOrderNumber = text.match(/\b(?:order|commande)(?:\s+(?:number|no\.?|id))?\s*#?\s*(\d{2,})/)?.[1]
      || text.match(/#\s*(\d{2,})/)?.[1]
      || null
    const requestedDate = reportPeriodFromText(text)?.startDate || text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || null
    const reason = text.match(/\b(?:because|reason is|reason:)\s+(.+?)[?.!]*$/)?.[1]?.trim() || ''
    return { type: 'order_delay', orderNumber: delayedOrderNumber, deliveryDate: requestedDate, reason, prompt: question }
  }
  if (/\b(delivery|deliveries|deliver|drop.?offs)\b/.test(text) && (reportPeriodFromText(text) || /\b(overdue|late|today|tomorrow|yesterday)\b/.test(text))) {
    const period = reportPeriodFromText(text)
    if (period && !['today', 'tomorrow', 'yesterday'].includes(period.label)) return { type: 'deliveries_period', period, prompt: question }
    return { type: 'deliveries', offset: /\b(tomorrow|next day)\b/.test(text) ? 1 : /\byesterday\b/.test(text) ? -1 : 0, targetDate: period?.startDate || null, prompt: question }
  }
  const clearInventorySwitch = isClearInventoryQuestion(text)
  // Keep the subject of a customer/order lookup through short conversational
  // replies such as “try Djabali Wasila” or simply “Djabali Wasila”.
  if (!clearInventorySwitch && previousIntent?.type === 'order_customer_fact' && /^(?:(?:try|maybe|search|look for|i mean|the name is)\s+)?[\p{L}][\p{L}\s'-]{1,60}[?.!]*$/u.test(text)) {
    const candidate = cleanCustomerSearchTerm(text.replace(/^(?:try|maybe|search|look for|i mean|the name is)\s+/i, ''))
    if (isLikelyCustomerNameCandidate(candidate)) {
      return { type: 'order_customer_fact', term: candidate, field: previousIntent.field || 'full', prompt: question }
    }
  }
  const period = reportPeriodFromText(text)
  if (/\b(how|where|help)\b/.test(text) && /\b(delay|postpone|edit|change)\b/.test(text) && /\border\b/.test(text)) return { type: 'how_to', topic: text }
  if (/\b(?:how|where|help)\b/.test(text) && /\b(?:create|make|place|start|build)\b/.test(text) && /\border\b/.test(text)) return { type: 'how_to', topic: text }
  if (/\b(how|where|help)\b/.test(text) && /\b(close|opening|closing|cash register|cash drawer)\b/.test(text)) return { type: 'how_to', topic: text }
  const numberedOrder = text.match(/(?:order|commande|receipt|ticket)(?:\s+(?:payment\s+status|delivery\s+date|details?|information|info|status|payment|delivery))?(?:\s+(?:of|for))?(?:\s+(?:number|no\.?|id))?\s*#?\s*(\d{2,})/i)?.[1]
    || text.match(/\b(?:details?|information|info)\s+(?:of|for)\s+(?:the\s+)?order\s*(?:number\s*)?#?\s*(\d{2,})/i)?.[1]
  const bareOrderNumber = !/\b(customer|client)\b/.test(text) ? text.match(/#\s*(\d{2,})/)?.[1] : null
  const orderNumber = numberedOrder || bareOrderNumber

  const pendingOrderAction = conversationContext?.intent || previousIntent
  const orderNumberReply = text.match(/^(?:(?:and|what about|please|et pour|et|and for|وماذا عن|وكذلك|من فضلك)\s+)?#?(\d{2,})(?:\s+(?:please|s il te plait|s il vous plait))?$/u)?.[1]
  if (orderNumberReply && ['order_cancel', 'order_payment', 'order_edit', 'order_delay'].includes(pendingOrderAction?.type)) {
    return { ...pendingOrderAction, orderNumber: orderNumberReply, prompt: question }
  }

  const asksToPrintOrder = /\b(?:print|reprint|receipt|ticket)\b/.test(text)
  if (asksToPrintOrder && orderNumber) return { type: 'order_lookup', orderNumber, facts: ['full'], printRequested: true, prompt: question }
  if (asksToPrintOrder && previousIntent?.orderNumber && /^(?:please\s+)?(?:print|reprint)(?:\s+(?:it|this|that|this order|that order|the receipt|the order))?[?.!]*$/.test(text)) {
    return { type: 'order_lookup', orderNumber: String(previousIntent.orderNumber), facts: ['full'], printRequested: true, prompt: question }
  }

  if (previousIntent?.type === 'order_delay' && !previousIntent.orderNumber && orderNumber) return { ...previousIntent, orderNumber, prompt: question }
  if (previousIntent?.type === 'order_delay' && !previousIntent.orderNumber && /^#?\d{2,}$/.test(text)) return { ...previousIntent, orderNumber: text.replace('#', ''), prompt: question }
  const asksRecentOrderCreator = /\b(?:who|which\s+(?:staff|team\s+member|employee|person))\b/.test(text)
    && /\b(?:created|made|entered|placed|added)\b/.test(text)
    && /\b(?:last|latest|most recent)\b/.test(text)
    && /\borders?\b/.test(text)
  if (asksRecentOrderCreator) {
    const countToken = text.match(/\b(?:last|latest|most recent)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+orders?\b/)?.[1]
    const countWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
    const count = countToken ? Number(countToken) || countWords[countToken] : 3
    return { type: 'orders_created_by', limit: Math.min(10, Math.max(1, count)), prompt: question }
  }

  if (previousIntent?.type === 'order_delay' && previousIntent.orderNumber && !previousIntent.deliveryDate) {
    const followupDate = reportPeriodFromText(text)?.startDate || text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0]
    if (followupDate) return { ...previousIntent, deliveryDate: followupDate, prompt: question }
  }

  const orderMutationRequested = /\b(edit|update|modify|adjust|change|delete|remove|cancel|void|refund|pay|payment|mark|set|move|delay|reschedule|add)\b/.test(text)
  if (orderNumber && !orderMutationRequested) {
    return { type: 'order_lookup', orderNumber, facts: orderFactsRequested(text) }
  }

  // “What about Hedade?” changes the customer being discussed. Keep it in
  // the order-search flow; “what about its status?” remains a fact follow-up.
  const customerSwitch = text.match(/^(?:(?:and|what about|how about|try|maybe|search for|look for)\s+)?([\p{L}][\p{L}\s'-]{1,60})[?.!]*$/u)
  if (!clearInventorySwitch && !orderNumber && customerSwitch && ['order_lookup', 'order_customer_fact', 'order_search', 'order_clarification', 'orders_list', 'orders_period', 'orders_status', 'orders_due', 'product_stock', 'product_price', 'low_stock'].includes(previousIntent?.type)) {
    const candidate = cleanCustomerSearchTerm(customerSwitch[1])
    const followupWords = /\b(?:it|its|this|that|order|orders|find|search|show|status|state|number|phone|date|time|total|balance|payment|paid|delivery|method|items?|products?|details|tomorrow|today|yesterday|next|week|month)\b/i
    if (isLikelyCustomerNameCandidate(candidate) && !followupWords.test(candidate)) {
      return { type: 'order_customer_fact', term: candidate, field: 'full', prompt: question }
    }
  }
  if (previousIntent?.type === 'customer_lookup' && customerSwitch) {
    const candidate = cleanCustomerSearchTerm(customerSwitch[1])
    if (isLikelyCustomerNameCandidate(candidate)) return { type: 'customer_lookup', name: candidate, prompt: question }
  }

  if (!orderNumber) {
    const customerCreator = text.match(/\b(?:who|which staff(?: member)?|which team member)\s+(?:created|made|entered|placed)\s+(?:the\s+)?order\s+(?:for|by)\s+(.+?)[?.!]*$/)
      || text.match(/\b(?:who|which staff(?: member)?|which team member)\s+(?:created|made|entered|placed)\s+(.+?)'s\s+order\b/)
    if (customerCreator?.[1]) {
      const term = customerCreator[1].replace(/^(?:the\s+)?(?:client|customer)\s+/i, '').trim()
      if (term && isLikelyCustomerNameCandidate(term)) return { type: 'order_customer_fact', term, field: 'created_by', prompt: question }
    }
    const customerOrderContents = text.match(/\bwhat\s+(?:does\s+)?(.+?)\s+(?:has|have)\s+in\s+(?:(?:his|her|their|its|the)\s+)?orders?\b/)
      || text.match(/\bwhat\s+did\s+(.+?)\s+order\b/)
      || text.match(/\bwhat(?:'s| is)\s+in\s+(.+?)'s\s+order\b/)
      || text.match(/\b(?:items|products)\s+(?:in|for)\s+(.+?)'s\s+order\b/)
    if (customerOrderContents?.[1]) {
      const term = customerOrderContents[1].replace(/^(?:the )?(?:client|customer)\s+/, '').replace(/'s$/, '').trim()
      if (term) return { type: 'order_customer_fact', term, field: 'items', prompt: question }
    }
    const possessiveFact = text.match(/(?:what(?:'s| is)\s+)?(.+?)'s\s+order\s+(payment status|status|payment method|amount due|balance|total|delivery date|phone)\b/)
    if (possessiveFact) {
      const term = possessiveFact[1].replace(/^(?:what is|what's)\s+/, '').trim()
      const field = orderFactsRequested(text)[0] || 'summary'
      if (term) return { type: 'order_customer_fact', term, field, prompt: question }
    }
    const namedOrderFact = text.match(/\b(?:payment status|order status|order number|order no\.?|status|payment method|amount due|balance|total|phone|customer name|client name|delivery date)\s+(?:of|for)\s+(?:the\s+)?(?:order\s+)?(.+?)\s+orders?\b/)
      || text.match(/\b(?:what(?:'s| is)\s+)?(.+?)\s+(?:order|customer)\s+(payment status|order number|status|payment method|amount due|balance|total|phone|delivery date)\b/)
    if (namedOrderFact && /\border\b/.test(text)) {
      const term = namedOrderFact[1].replace(/^(?:the )?(?:client|customer)\s+/, '').replace(/'s$/, '').trim()
      if (term && !/^(?:the|an?|this|that|my|our|their)$/.test(term)) {
        return { type: 'order_customer_fact', term, field: orderFactsRequested(text)[0] || 'summary', prompt: question }
      }
    }
    const paidOrder = text.match(/\b(?:is|was|has)\s+(.+?)\s+(?:order\s+)?(paid|unpaid|settled)\b/)
    if (paidOrder) {
      const term = paidOrder[1].replace(/(?:'s)?\s+order$/, '').replace(/'s$/, '').trim()
      if (term) return { type: 'order_customer_fact', term, field: 'payment_status', prompt: question }
    }
  }

  const refersToPreviousOrder = /\b(it|its|it'?s|that order|this order|same order|that one|this one|their|them)\b/.test(text)
  const shortOrderFollowup = /^(?:(?:and|what about)\s+)?(?:(?:what(?:'s| is)|how much|when|where|tell me|show me)\s+)?(?:(?:the|its|their|customer'?s|client'?s)\s+)?(?:payment\s+status|status|state|date|time|balance|amount due|total|phone|phone number|customer number|client number|order number|number|items?|products?|delivery method|payment method|details|everything|whole order|full order|more)[?.!\s]*$/.test(text)
  const requestsMoreOrderDetails = /\b(?:tell me more|show me (?:the )?(?:full )?details|give me (?:the )?(?:full )?details|show me everything|tell me everything|the whole order|full order details|all order details)\b/.test(text)
  if (requestsMoreOrderDetails && previousIntent?.type === 'order_lookup' && previousIntent.orderNumber) {
    return { ...previousIntent, facts: ['full'], prompt: question }
  }
  if (requestsMoreOrderDetails && previousIntent?.type === 'order_customer_fact' && previousIntent.term) {
    return { ...previousIntent, field: 'summary', prompt: question }
  }
  if (shortOrderFollowup && previousIntent?.type === 'order_customer_fact' && previousIntent.term) {
    const field = /\bpayment status\b/.test(text) ? 'payment_status'
      : /\b(payment method)\b/.test(text) ? 'payment_method'
        : /\b(status|state)\b/.test(text) ? 'status'
          : /\b(phone|number)\b/.test(text) ? 'client_phone'
            : /\b(date|when)\b/.test(text) ? 'delivery_date'
              : /\btime\b/.test(text) ? 'delivery_time'
                : /\b(balance|amount due)\b/.test(text) ? 'amount_due'
                  : /\btotal\b/.test(text) ? 'total_amount' : previousIntent.field
    return { ...previousIntent, field, prompt: question }
  }
  if (!orderNumber && (refersToPreviousOrder || shortOrderFollowup) && previousIntent?.type === 'order_lookup' && previousIntent.orderNumber) {
    const followupField = /\border\s+(?:number|no\.?|#)\b/.test(text) ? 'order_number'
      : /\b(number|phone|telephone|mobile|contact|reach|call)\b/.test(text) ? 'client_phone'
      : /\bpayment status\b/.test(text) ? 'payment_status'
        : /\b(status|state)\b/.test(text) ? 'status'
        : /\b(when|date|day|due|scheduled)\b/.test(text) ? 'delivery_date'
          : /\b(time|hour)\b/.test(text) ? 'delivery_time'
            : /\b(payment method|paid by)\b/.test(text) ? 'payment_method'
              : /\b(delivery method|pickup|motorcycle|dhd)\b/.test(text) ? 'delivery_method'
                : /\b(balance|owe|left to pay|amount due)\b/.test(text) ? 'amount_due'
                  : /\b(total|cost|price|value)\b/.test(text) ? 'total_amount'
                    : /\b(products?|items?|flowers?|what did .* order|what .* ordered|contain)\b/.test(text) ? 'items'
                      : /\b(notes?|instructions?|message)\b/.test(text) ? 'notes'
                        : /\b(name|who|customer|client)\b/.test(text) ? 'client_name' : null
    if (followupField) return { ...previousIntent, facts: [followupField], prompt: question }
    if (/\b(whole|full|entire|complete)\s+order\b|\b(all (?:the )?(?:order )?details|everything about (?:the )?order)\b/.test(text)) {
      return { ...previousIntent, facts: ['full'], prompt: question }
    }
  }

  const conversationalPeriod = reportPeriodFromText(text)
  if (!clearInventorySwitch && conversationalPeriod && previousIntent?.type === 'report_period') {
    return { ...previousIntent, period: conversationalPeriod, prompt: question }
  }
  if (!clearInventorySwitch && conversationalPeriod && previousIntent?.type === 'orders_period') {
    return { ...previousIntent, period: conversationalPeriod, prompt: question }
  }

  if (previousIntent?.type === 'orders_period' && /\b(edit|update|modify|change)\b/.test(text)) {
    const position = text.match(/\b(first|1st|one|second|2nd|two|third|3rd|three)\b/)
    if (position) {
      const index = { first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2 }[position[1]]
      return { type: 'order_edit', resultIndex: index, prompt: question }
    }
  }
  if (['order_lookup', 'order_search', 'orders_period', 'orders_list'].includes(previousIntent?.type)
    && /\b(edit|update|modify|change|add|remove|reschedule|delay)\b/.test(text)
    && /\b(this order|that order|it|the first|the second|the third|first one|second one|third one)\b/.test(text)) {
    const position = text.match(/\b(first|1st|one|second|2nd|two|third|3rd|three)\b/)
    const index = position ? ({ first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2 })[position[1]] : 0
    return previousIntent.type === 'order_lookup' && previousIntent.orderNumber
      ? { type: 'order_edit', orderNumber: previousIntent.orderNumber, prompt: question }
      : { type: 'order_edit', resultIndex: index, prompt: question }
  }

  const asksReportAnalysis = /\b(revenue|sales|turnover|order value|average order|business performance|how did we do|how is business|best day|worst day|compare|compared|profit|sold|how many orders|how much(?:\s+[\p{L}]+)? did we make|earned|ventes|chiffre d affaires|recettes|combien d argent avons nous gagne)\b/u.test(text)
  if (period && asksReportAnalysis) {
    const productMatch = text.match(/\b(?:how many|how much|sales of|revenue from)\s+(.+?)\s+(?:did we sell|did i sell|sold|sell)\b/)
    const productAnalysis = /\b(products?|flowers?|roses?|tulips?|carnations?|lilies|orchids?)\b/.test(text)
      && /\b(sold|sell|most|top|best|popular|quantity|units)\b/.test(text)
    return { type: 'report_period', period, prompt: question, productAnalysis, productQuery: productMatch?.[1]?.trim() || null }
  }
  if (asksReportAnalysis) {
    return { type: 'sales', prompt: question }
  }
  if (period && /\b(orders?|deliveries)\b/.test(text) && !/\b(revenue|sales|turnover|order value|performance|profit|earned)\b/.test(text)) {
    const created = /\b(created|made|placed|received|came in|entered)\b/.test(text)
    const status = /\b(completed|complete|done)\b/.test(text) ? ['done']
      : /\b(processing|in progress)\b/.test(text) ? ['processing']
        : /\b(new|pending|open)\b/.test(text) ? ['new', 'processing'] : null
    const named = text.match(/\b(?:for|from|customer|client)\s+([a-z][a-z\s'-]{1,40}?)(?=\s+(?:on|in|this|last|next|today|yesterday|tomorrow|created|placed|due|scheduled)\b|\s+20\d{2}-|[?.!,]|$)/)?.[1]?.trim()
    if (created && ['today', 'yesterday'].includes(period.label)) return { type: 'created_today', offset: period.label === 'yesterday' ? -1 : 0, prompt: question }
    if (created && period.label === 'tomorrow') return { type: 'created_today', offset: 1, prompt: question }
    if (!created && ['today', 'tomorrow', 'yesterday'].includes(period.label) && /\bdeliveries\b/.test(text)) return { type: 'deliveries', offset: period.label === 'tomorrow' ? 1 : period.label === 'yesterday' ? -1 : 0, targetDate: period.startDate, prompt: question }
    return { type: 'orders_period', period, dateField: created ? 'created_at' : 'delivery_date', statuses: status, term: named || null }
  }

  const amountRange = text.match(/\bbetween\s+(\d[\d\s,.]*)\s*(?:da|dzd)?\s+and\s+(\d[\d\s,.]*)\s*(?:da|dzd)\b/)
  const amountMatch = text.match(/\b(\d[\d\s,.]*)\s*(?:da|dzd|dinars?)\b/)
  if (!orderNumber && (amountRange || (amountMatch && /\b(order|orders|find|search|show|which)\b/.test(text)))
    && !/\b(payment|refund|paid|pay|stock|cash|spent)\b/.test(text)) {
    const parseAmount = (value) => Number(String(value).replace(/[\s,.]/g, ''))
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null
    const low = amountRange ? parseAmount(amountRange[1]) : null
    const high = amountRange ? parseAmount(amountRange[2]) : null
    const comparator = /\b(over|above|more than|greater than)\b/.test(text) ? 'above'
      : /\b(under|below|less than)\b/.test(text) ? 'below'
        : /\b(around|about|approximately|approx)\b/.test(text) ? 'around' : 'exact'
    const amountRemoved = text.replace(/\b\d[\d\s,.]*\s*(?:da|dzd|dinars?)\b/g, ' ')
    const named = amountRemoved.match(/\b(?:for|customer|client)\s+([a-z][a-z\s'-]{1,40}?)(?=\s+(?:order|whose|with|today|yesterday|tomorrow|this|last|next)\b|[?.!,]|$)/)?.[1]?.trim()
    return { type: 'order_search', amount, amountRange: amountRange ? [low, high] : null, comparator, term: named || null }
  }

  const requestsCancellation = /\b(cancel|void)\b/.test(text) && /\b(order|commande)\b/.test(text) && !/\b(items?|products?|flowers?|stems?)\b/.test(text)
  if (requestsCancellation) return { type: 'order_cancel', orderNumber }
  if (previousIntent?.type === 'order_cancel' && !previousIntent.orderNumber && orderNumber) return { ...previousIntent, orderNumber }
  if (previousIntent?.type === 'order_cancel' && !previousIntent.orderNumber && /^#?\d{2,}$/.test(text)) return { ...previousIntent, orderNumber: text.replace('#', '') }
  const removingOrderItem = /\b(delete|remove)\b.*\b(items?|products?|flowers?|stems?)\b.*\bfrom\b.*\border\b/.test(text)
  if (!removingOrderItem && ((/\bdelete\b/.test(text) && (/\border\b/.test(text) || /#\s*\d+/.test(text))) || /\bremove\s+(?:the\s+)?order\b/.test(text))) return { type: 'order_delete_forbidden', prompt: question }
  const requestedPaymentStatus = text.match(/\b(?:set|change|update|mark)\b.*\bpayment\s+status\b.*\b(paid|unpaid|partial)\b/)
    || text.match(/\b(?:set|change|update)\b.*\border\s*#?\s*\d+\s+(?:as\s+)?(paid|unpaid)\b/)
    || text.match(/\bmark\b.*\border\s*#?\s*\d+\b.*\b(paid|unpaid)\b/)
  const requestsPaymentAction = Boolean(requestedPaymentStatus)
    || /\b(refund|pay)\b/.test(text)
    || /\bmark\b.*\bpaid\b/.test(text)
    || /\b(collect|receive|record|add|take|accept|make|log)\b.*\b(payment|balance|deposit)\b/.test(text)
  if (previousIntent?.type === 'order_payment' && !previousIntent.orderNumber && orderNumber) {
    return { ...previousIntent, orderNumber }
  }
  if (previousIntent?.type === 'order_payment' && !previousIntent.orderNumber && /^#?\d{2,}$/.test(text)) {
    return { ...previousIntent, orderNumber: text.replace('#', '') }
  }
  if (requestsPaymentAction) {
    const statusTarget = requestedPaymentStatus?.[1]
    const action = /\brefund\b/.test(text) || statusTarget === 'unpaid' ? 'refund' : 'payment'
    const amountText = text.match(/\b(\d[\d\s,.]*)\s*(?:da|dzd|dinars?)\b/)
    const amount = amountText ? Number(amountText[1].replace(/[\s,.]/g, '')) : null
    const full = statusTarget === 'paid' || /\b(full|remaining balance|mark .* paid|fully paid|pay in full)\b/.test(text)
    const method = /\bbaridi ?mob\b/.test(text) ? 'baridimob' : /\b(usdt|usd|dollars?)\b/.test(text) ? 'usd' : /\bcash\b/.test(text) ? 'cash' : null
    return { type: 'order_payment', orderNumber, action, amount: Number.isFinite(amount) ? amount : null, full, method }
  }
  // A generic “find an order” request is a lookup, not an order-creation command.
  // Keep it explicit so it bypasses the language-model fallback and asks for a search key.
  if (/^(?:(?:please|can you)\s+)?(?:find|search for|look up)\s+(?:(?:an?|the)\s+)?orders?[?.!]*$/.test(text)) {
    return { type: 'order_search', term: null, prompt: question }
  }
  const explicitCreateOrder = /\b(?:create|make|place|start|build|prepare|put together)\b.*\border\b/.test(text)
    || /\b(?:new|another)\s+order\b/.test(text)
    || /\b(?:new|another)\s+order\s+(?:for|to)\s+[\p{L}\d]/u.test(text)
    || /\b(?:let(?:'|’)s|i(?:'|’)d like to|i want to|i need to|can you|could you|please)\s+(?:create|make|place|start|build|prepare)\b.*\border\b/.test(text)
  const createOrderRequest = explicitCreateOrder
    || (!orderNumber && /\b(?:need|want)\s+(?:to\s+)?(?:create\s+)?(?:an?\s+)?order\b/.test(text))
    || /^order\s+new\b/.test(text)
  if (createOrderRequest) return { type: 'order_create', prompt: question }
  const asksToDelayOrder = /\b(delay|postpone|reschedule|push back)\b/.test(text) && /\b(order|orders|commande|commandes)\b/.test(text)
  if (asksToDelayOrder) {
    const requestedDate = reportPeriodFromText(text)?.startDate || text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || null
    const reason = text.match(/\b(?:because|reason is|reason:)\s+(.+?)[?.!]*$/)?.[1]?.trim() || ''
    return { type: 'order_delay', orderNumber, deliveryDate: requestedDate, reason, prompt: question }
  }
  const activeOrderNumber = conversationContext?.activeOrder?.orderNumber || (conversationContext?.activeEntity?.type === 'order' ? conversationContext.activeEntity.orderNumber : null)
  const itemReplacement = text.match(/\b(?:replace|change|edit|swap)\s+(?:the\s+)?(?:(\d+)\s*[x×]\s*)?(.+?)\s+(?:with|into|to)\s+(.+?)[?.!]*$/)
  const itemChange = itemReplacement && itemReplacement[2].trim() && itemReplacement[3].trim()
    ? { kind: 'replace', sourceTerm: itemReplacement[2].trim(), targetTerm: itemReplacement[3].trim(), quantity: itemReplacement[1] ? Number(itemReplacement[1]) : null }
    : null
  const orderEditRequest = /\b(edit|update|modify|adjust|change|replace|swap)\b/.test(text)
    && (/\border\b/.test(text) || Boolean(orderNumber) || Boolean(activeOrderNumber))
  const statusChangeRequest = /\b(mark|set|move)\b.*(?:\border\b|#\s*\d+).*\b(new|processing|ready|completed|complete|done)\b/.test(text)
    || /\b(complete|finish)\s+(?:the\s+)?order\b/.test(text)
  const addToOrderRequest = /\badd\b.*\bto\s+(?:(?:the|this|that|same)\s+)?order\b/.test(text)
  const removeFromOrderRequest = /\b(remove|delete)\b.*\bfrom\s+(?:(?:the|this|that|same)\s+)?order\b/.test(text)
  if (orderEditRequest || statusChangeRequest || addToOrderRequest || removeFromOrderRequest || removingOrderItem) {
    const targetOrderNumber = orderNumber || (activeOrderNumber ? String(activeOrderNumber) : null)
    return { type: 'order_edit', ...(targetOrderNumber ? { orderNumber: targetOrderNumber } : {}), ...(itemChange ? { itemChange } : {}), prompt: question }
  }

  if (orderNumber) return { type: 'order_lookup', orderNumber, facts: orderFactsRequested(text) }
  const explicitCustomerOrderSearch = text.match(/\b(?:find|search|look up|show|list)(?:\s+me)?\s+(?:the\s+)?orders?\s+(?:by|using|with)\s+(?:the\s+)?(?:client|customer)(?:'s)?\s+name\s*(?::|is)?\s*(.*)$/)
  if (explicitCustomerOrderSearch) {
    const term = explicitCustomerOrderSearch[1].replace(/\s+(?:please|pls|thanks|thank you)\??$/i, '').replace(/[?.!]+$/g, '').trim()
    return term ? { type: 'order_search', term, searchField: 'client_name', prompt: question } : { type: 'order_clarification', prompt: question }
  }
  const namedOrderDetails = text.match(/\b(?:show|find|search|look up|display|open)(?:\s+me)?\s+(?:the\s+)?orders?\s+(?:with|for|under|by)\s+(.+?)[?.!]*$/)
    || text.match(/\b(?:show|find|search|look up|display|open)(?:\s+me)?\s+(?:the\s+)?orders?\s+(?:of|belonging to)\s+(.+?)[?.!]*$/)
  if (namedOrderDetails?.[1]) {
    const term = cleanCustomerSearchTerm(namedOrderDetails[1])
      .replace(/^(?:(?:client|customer)\s+)?(?:named|called)\s+/i, '')
    if (term && !/^(?:the|a|an|my|our|customer|client)$/i.test(term)) return { type: 'order_customer_fact', term, field: 'full', prompt: question }
  }
  const printNamedOrder = text.match(/^(?:please\s+)?(?:print|reprint)\s+(?:the\s+)?(?:receipt|order)\s+(?:for|of|by)\s+(.+?)[?.!]*$/)
  if (printNamedOrder?.[1]) return { type: 'order_customer_fact', term: cleanCustomerSearchTerm(printNamedOrder[1]), field: 'full', printRequested: true, prompt: question }
  const asksForOrderRecords = /\b(show|list|find|search|see|what|which|tell|pending|processing|completed|cancelled|due|payment|items?|products?)\b/.test(text) && /\borders?\b/.test(text)
  const asksForProductRecords = /\b(show|list|display|see|find|search|how many|stock|inventory|price|cost|low|out of stock)\b/.test(text) && /\b(products?|items?|flowers?|stock|inventory)\b/.test(text)
  const explicitlyNavigatesToPage = /\b(go to|open (?:the )?(?:orders? page|customers? page|products? page|reports? page))\b/.test(text)
  if (/\b(open|show me|go to)\b/.test(text) && /\b(orders?|customers?|products?|quick sale|deliver(y|ies)|suppliers?|reports?|team|settings|cash register|coffre)\b/.test(text) && !/\b(today|tomorrow|due|overdue|late|delivery run|low stock|restock|inventory|stock)\b/.test(text) && (!asksForOrderRecords || explicitlyNavigatesToPage) && (!asksForProductRecords || explicitlyNavigatesToPage)) return { type: 'navigate', topic: text }
  if (/\b(overview|business pulse|how.?s business|anything i should know|what needs attention|full picture|summari[sz]e the shop)\b/.test(text)) return { type: 'overview' }
  if (/\b(cash register|cash drawer|cash balance|cash in|cash out|register closed|register open)\b/.test(text)) return { type: 'cash_register', offset: 0, detail: false, prompt: question }
  if (/\b(what can you do|what else can you do|what do you know|all features|all modules|how does this software work)\b/.test(text)) return { type: 'capabilities' }
  if (/^(?:(?:and|what about|same for)\s+)?(tomorrow|next day|today|tonight)\??$/.test(text)) {
    const offset = /tomorrow|next day/.test(text) ? 1 : 0
    return ['deliveries', 'orders_due'].includes(previousIntent?.type) ? { ...previousIntent, offset } : { type: 'orders_due', offset }
  }
  if (/^(and\s+)?how many\??$/.test(text) && previousIntent) return previousIntent
  const productFollowUp = text.match(/^(?:and|what about|same for|how about)\s+(.+?)[?.!]*$/)
  if (productFollowUp && !/\b(orders?|commande|commandes)\b/.test(text) && ['product_stock', 'product_price'].includes(previousIntent?.type)) {
    const search = productSearchTerms(productFollowUp[1]).join(' ')
    if (search) return { ...previousIntent, search, scope: null }
  }
  if (selectionIndex != null) {
    return { type: 'select_result', index: selectionIndex }
  }
  if (/^(open|show|view)\s+(it|that|this one)$/.test(text)) return { type: 'select_result', index: 0 }
  const phoneOrderSearch = text.match(/\b(?:find|search|look up|show|list)(?:\s+me)?\s+(?:the\s+)?orders?\s+(?:by|for|with)\s+(?:(?:client|customer)\s+)?(?:phone(?:\s+number)?|contact(?:\s+number)?)\s*(?:is|:)?\s*([\d+()\s-]{5,})/)
  if (phoneOrderSearch?.[1]) return { type: 'order_search', term: phoneOrderSearch[1].replace(/\D/g, ''), searchField: 'client_phone' }
  const customerOrderSearch = text.match(/\b(?:find|search|look up|show|list)(?:\s+me)?\s+(?:the\s+)?orders?\s+(?:for|from|belonging to|with client name|by client name|by customer name)\s*:?[\s]*(.*)$/)
    || text.match(/\b(?:find|search|look up|show|list)(?:\s+me)?\s+(?:the\s+)?orders?\s+(?:for|from)\s+(?:client|customer)\s+(?:named?\s+)?(.+)$/)
    || text.match(/\b(?:find|search|look up|show|list)(?:\s+me)?\s+(.+?)'s\s+orders?\b/)
    || text.match(/\b(?:find|search|look up)\s+(?:orders?\s+)?(?:by|using|with)\s+(?:the\s+)?(?:client|customer)(?:'s)?\s+name\s*(?::|is)?\s*(.*)$/)
  if (customerOrderSearch) {
    const term = (customerOrderSearch[1] || '').replace(/^(?:the )?(?:client|customer)(?:'s)?\s+(?:(?:named?|name)\s+)?(?:is\s+)?/, '')
      .replace(/\s+(?:please|pls|thanks|thank you)\??$/i, '').replace(/[?.!]+$/g, '').trim()
    return term
      ? { type: 'order_search', term, searchField: 'client_name' }
      : { type: 'order_clarification', prompt: question }
  }
  const orderSearch = text.match(/(?:find|search|look up|show me|list)\s+(?:(?:the|an?)\s+)?orders?\s+(?:for|from|by)\s+(.+)|orders?\s+(?:for|from|by)\s+(.+)/)
  if (orderSearch) {
    const term = (orderSearch[1] || orderSearch[2] || '').replace(/^(?:customer|client)\s+/i, '').replace(/^(?:name|phone|number)\s+/i, '').replace(/\s+(?:today|tomorrow|this week|next week|please|pls|thanks|thank you)\??$/i, '').replace(/[?.!]+$/g, '').trim()
    if (term && !/^(today|tomorrow|this week|the week)$/.test(term)) return { type: 'order_search', term }
  }
  const creationDateQuery = /\b(created|placed|received|came in|added|entered)\b/.test(text)
    && /\b(today|yesterday|this morning)\b/.test(text) && /\borders?\b/.test(text)
  if (creationDateQuery) return { type: 'created_today', offset: /\byesterday\b/.test(text) ? -1 : 0 }
  const statusTerms = [
    { pattern: /\b(?:pending|open) orders?\b|\borders?\s+(?:with\s+)?(?:status\s+)?(?:pending|open)\b/, statuses: ['new', 'processing'], label: 'open' },
    { pattern: /\bnew orders?\b|\borders?\s+(?:with\s+)?(?:status\s+)?new\b/, statuses: ['new'], label: 'new' },
    { pattern: /\b(?:processing|in progress) orders?\b|\borders?\s+(?:with\s+)?(?:status\s+)?(?:processing|in progress)\b/, statuses: ['processing'], label: 'processing' },
    { pattern: /\b(?:completed|complete|done) orders?\b|\borders?\s+(?:with\s+)?(?:status\s+)?(?:completed|complete|done)\b/, statuses: ['done'], label: 'completed' },
    { pattern: /\b(?:cancelled|canceled) orders?\b|\borders?\s+(?:with\s+)?(?:status\s+)?(?:cancelled|canceled)\b/, statuses: ['cancelled'], label: 'cancelled' },
  ]
  const statusIntent = statusTerms.find((item) => item.pattern.test(text))
  const asksDeliveryDate = /\b(due|scheduled|delivery|deliver|delivery run|tomorrow|today.?s deliveries)\b/.test(text)
  if (statusIntent && !asksDeliveryDate) return {
    type: 'orders_status', statuses: statusIntent.statuses, label: statusIntent.label,
    createdOffset: /\byesterday\b/.test(text) ? -1 : /\btoday\b/.test(text) ? 0 : null,
  }
  if (previousIntent?.type === 'overdue' && /\b(?:late|overdue|past due|missed|ones|them|those)\b/.test(text)) return { ...previousIntent, prompt: question }
  if (/\b(overdue|late|past due|missed)\b/.test(text) && /\b(order|orders|delivery|deliveries|shipment)\b/.test(text)) return { type: 'overdue' }
  if (/\b(order|orders|commande|commandes)\b/.test(text) && /\b(today|tomorrow|due|scheduled|deliver|delivery|late)\b/.test(text)) {
    return {
      type: 'orders_due', offset: /\b(tomorrow|next day)\b/.test(text) ? 1 : 0,
      statuses: statusIntent?.statuses || null,
      statusLabel: statusIntent?.label || null,
    }
  }
  if (statusIntent) return { type: 'orders_status', statuses: statusIntent.statuses, label: statusIntent.label }
  const specificCustomerContact = text.match(/\b(?:find|search|look up)\s+(?:the\s+)?customer\s+(phone|phone number|number|email|contact)\s+(?:for|of)\s+(.+?)[?.!]*$/)
  if (specificCustomerContact?.[2]) return { type: 'customer_lookup', name: cleanCustomerSearchTerm(specificCustomerContact[2]), requestedFact: specificCustomerContact[1].startsWith('phone') || specificCustomerContact[1] === 'contact' ? 'phone' : specificCustomerContact[1], prompt: question }
  if (/\b(customer|client)\b/.test(text)) {
    const name = text.match(/(?:customer|client)\s+(?:named?\s+)?(.+)$/)?.[1]?.replace(/^(?:name|phone|number)\s+/i, '').replace(/\s+(?:phone|phone number|number|email|contact)$/i, '').replace(/[?.!]+$/g, '').trim()
    if (name && !['', 'history', 'list', 'details', 'information'].includes(name) && /\b(find|search|look up|customer|client)\b/.test(text)) return { type: 'customer_lookup', name, requestedFact: /\b(phone|number|contact)\b/.test(text) ? 'phone' : /\bemail\b/.test(text) ? 'email' : null }
  }
  if (/\b(waste|wasted|damaged|spoiled|wilted|shrinkage)\b/.test(text) && /\b(flower|flowers|stock|inventory|waste|wasted|damaged|spoiled|wilted)\b/.test(text)) {
    if (/\b(record|remove|discard|log|mark)\b/.test(text)) return { type: 'how_to', topic: 'record flower waste' }
    const detailRequested = /\b(?:by|per|each|breakdown|break down|which|specific|individual|daily|per-day|weekly|per-week)\b.*\b(?:product|flower|item|date|day|week)\b/.test(text)
      || /\b(?:red|pink|white|yellow|orange|purple|blue|green|black|rose|roses|tulip|tulips|chrysanthemum|chrysanthemums)\b/.test(text)
    return { type: 'stock_waste', period: reportPeriodFromText(text) || reportPeriodFromText('this month'), detailRequested }
  }
  const outOfStockRequest = /\b(out of stock|no stock|zero stock|sold out|not available)\b/.test(text)
  const lowStockRequest = /\b(low stock|low on stock|stock is low|low inventory|inventory is low|running low|run low|running out|almost out|nearly out|restock|restocking|replenish|below (?:the )?(?:stock )?threshold|under (?:the )?threshold)\b/.test(text)
  const mediumStockRequest = /\b(medium stock|moderate stock|stock is medium)\b/.test(text)
  const healthyStockRequest = /\b(healthy stock|well stocked|enough stock|plenty of stock|good stock|stock is healthy)\b/.test(text)
  const stockValueRequest = /\b(stock|inventory)\b/.test(text) && /\b(value|worth|valuation)\b/.test(text)
  if (stockValueRequest) {
    const search = productSearchTerms(text).join(' ')
    const stockValueMode = /\b(purchase|wholesale|cost|buying)\b/.test(text) ? 'purchase_cost_unavailable' : 'retail_value'
    const flowerScope = /\b(flowers?|stems?|roses?|tulips?|bouquets?|carnations?|lilies|orchids?|plants?)\b/.test(text)
    return { type: 'product_stock', search, scope: flowerScope ? 'flowers' : search ? null : 'all', stockValueMode }
  }
  if (outOfStockRequest || lowStockRequest || mediumStockRequest || healthyStockRequest) {
    const flowerScope = /\b(flowers?|stems?|roses?|tulips?|bouquets?|carnations?|lilies|orchids?|plants?)\b/.test(text)
    const availability = outOfStockRequest ? 'out' : lowStockRequest ? 'low' : mediumStockRequest ? 'medium' : 'healthy'
    return { type: 'product_stock', search: productSearchTerms(text).join(' '), scope: flowerScope ? 'flowers' : null, availability }
  }
  const stockPatterns = [
    /(?:how\s+many|quantity of|count of)\s+(.+?)(?:\?|$)/,
    /how\s+much\s+(?:stock|inventory)(?:\s+(?:of|for))?(?:\s+(?:do we have|does (?:the )?))?\s*(.*?)(?:\s+have)?(?:\?|$)/,
    /how\s+much\s+(?:is\s+)?left\s+(?:of|for)\s+(.+?)(?:\?|$)/,
    /what(?:'s| is) left\s+(?:of|in|for)\s+(.+?)(?:\?|$)/,
    /what\s+stock\s+(?:do we have\s+)?(?:of|for)\s+(.+?)(?:\?|$)/,
    /(?:stock|inventory)(?: level)?\s+(?:of|for)\s+(.+?)(?:\?|$)/,
    /(?:stock|inventory)\s+(?:of|for)\s+(.+?)(?:\?|$)/,
    /(.+?)\s+(?:stock|inventory)(?: level)?(?:\?|$)/,
    /do (?:we|you|i) have\s+(?:any\s+)?(.+?)(?:\?|$)/,
    /(?:is|are) there\s+(?:any\s+)?(.+?)(?:\?|$)/,
    /(?:which|what)\s+(.+?)\s+(?:(?:is|are)\s+)?(?:left|remaining|remain|available|in stock)(?:\?|$)/,
    /any\s+(.+?)\s+(?:left|remaining|remain|available|in stock)(?:\?|$)/,
    /(.+?)\s+(?:(?:is|are)\s+)?(?:left|remaining|remain|available|in stock)(?:\?|$)/,
  ]
  const stockSubject = stockPatterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean)
  if (stockSubject) {
    const terms = productSearchTerms(stockSubject)
    const flowerScope = /\b(flowers?|stems?|roses?|tulips?|bouquets?|carnations?|lilies|orchids?|plants?)\b/.test(stockSubject)
    const allProductsScope = terms.length === 0 && /\b(products?|items?)\b/.test(stockSubject)
    const inventoryWords = /\b(stock|inventory|flowers?|stems?|roses?|tulips?|bouquets?|carnations?|lilies|orchids?|plants?|products?|items?|red|white|pink|yellow|orange|purple|blue|green|cream)\b/
    if (!/\b(orders?|sales?|customers?|clients?)\b/.test(text) && (inventoryWords.test(text) || flowerScope || allProductsScope)) {
      return { type: 'product_stock', search: terms.join(' '), scope: terms.length === 0 || allProductsScope ? 'all' : flowerScope ? 'flowers' : null }
    }
  }
  const asksStockOverview = /\b(stock|inventory)\b/.test(text)
    && /\b(all|total|overall|summary|overview|levels|information|info|how much|what do we have|what have we got)\b/.test(text)
    && !/\b(low|out of stock|restock|restocking|red|white|pink|yellow|orange|purple|blue|green|cream|rose|roses|tulip|tulips|carnation|carnations|lily|lilies|orchid|orchids)\b/.test(text)
  if (asksStockOverview) return { type: 'product_stock', search: '', scope: 'all' }
  const asksForProductList = /\b(show|list|display|see|find|search)\b/.test(text) && /\b(products?|items?|inventory|stock|flowers?)\b/.test(text)
    && !/\b(low|out|restock|restocking|red|white|pink|yellow|orange|purple|blue|green|cream|rose|roses|tulip|tulips|carnation|carnations|lily|lilies|orchid|orchids)\b/.test(text)
  if (asksForProductList) return { type: 'product_stock', search: '', scope: /\bflowers?\b/.test(text) ? 'flowers' : 'all' }
  const priceQuestion = text.match(/(?:price|cost)\s+(?:of|for)\s+(.+)|how much\s+(?:is|are|does|do)\s+(.+?)(?:\s+cost)?(?:\?|$)|how much\s+(.+?)\s+cost(?:\?|$)|what does\s+(.+?)\s+cost(?:\?|$)/)
  if (priceQuestion) {
    const search = (priceQuestion[1] || priceQuestion[2] || priceQuestion[3] || priceQuestion[4] || '').replace(/^(the|a|an)\s+/, '').replace(/[?.!]+$/g, '').trim()
    const normalizedSearch = productSearchTerms(search).join(' ')
    if (normalizedSearch && !/\b(sales|revenue|money|cash|today)\b/.test(normalizedSearch)) return { type: 'product_price', search: normalizedSearch }
  }
  if (/\b(quick sale|receive stock|staff roles|permissions|finish an order|from the cart)\b/.test(text)) return { type: 'how_to', topic: text }
  if (/\b(stock|inventory)\b/.test(text)) return { type: 'product_stock', search: '', scope: 'all' }
  if (/\b(unpaid|owe|owing|balance due|payment follow.?up|not paid)\b/.test(text)) return { type: 'unpaid' }
  if (/\b(sales|revenue|turnover|sold today|money today|order value)\b/.test(text)) return { type: 'sales' }
  if (/\b(overdue|late|past due|missed)\b/.test(text)) return { type: 'overdue' }
  if (/\b(delivery|deliveries|deliver|going out|run|driver|drop.?offs)\b/.test(text)) {
    return { type: 'deliveries', offset: /\b(tomorrow|next day)\b/.test(text) ? 1 : 0 }
  }
  if (/\b(tomorrow|next day)\b/.test(text)) return { type: 'orders_due', offset: 1 }
  if (/\b(order|orders)\b/.test(text) && /\b(today|due|delivery|deliveries|what do we have|what.?s happening|my day)\b/.test(text)) return { type: 'orders_due', offset: 0 }
  const asksForUnfilteredOrderList = /\b(show|list|display|find|search|see)\b/.test(text) && /\borders?\b/.test(text)
    && (!/\border\b/.test(text) || /\b(list|all|recent|latest)\b/.test(text))
    && !/\b(name|customer|client|phone|status|processing|pending|completed|cancelled|due|delivery|delivered|created|placed|date|today|tomorrow|yesterday|week|month|overdue|late|amount|total|between|under|over|above|below|by|for|with)\b/.test(text)
  if (asksForUnfilteredOrderList) return { type: 'orders_list' }
  if (/^(?:(?:what(?:'s| is)|tell me|show me)\s+)?(?:the\s+)?(?:payment status|order status|status|order number|delivery date|delivery time|delivery method|client name|customer name|phone number|order details|order items|items in the order)[?.!\s]*$/.test(text)) {
    return { type: 'order_clarification', prompt: question }
  }
  if (/\b(orders?|commande|commandes)\b/.test(text) && /\b(what|which|show|find|search|tell|list|have|has|contains|include|status|paid|payment|items?|products?)\b/.test(text)) {
    return { type: 'order_clarification', prompt: question }
  }
  if (/^(?:help(?: me)?|please help)[?.!\s]*$/.test(text)) return { type: 'help' }
  if (/\b(how|where|help|create|new order|quick sale|add order)\b/.test(text)) return { type: 'how_to', topic: text }
  return { type: 'help' }
}







export function contextualOrderFollowup(question, context) {
  const orderNumber = context?.activeOrder?.orderNumber
  if (!orderNumber) return null
  const text = normalizeIntentText(question)
  if (/\b(?:add|remove|replace|change|edit|update|modify|increase|decrease)\b/.test(text)) return null
  const factText = text.replace(/^(?:(?:and|also|please|what about|et pour|et|and for|وماذا عن|وكذلك|من فضلك)\s*)+/u, '').replace(/\s+(?:please|s il te plait|s il vous plait)$/u, '').trim()
  const refersToActiveOrder = /\b(it|its|that order|this order|same order|that one|this one|their|them)\b/.test(text)
    || /^(?:status|payment status|phone|phone number|customer|client|total|items|delivery date|delivery time)[?.!\s]*$/.test(factText)
  if (!refersToActiveOrder) return null
  const field = /\b(full|whole|entire|complete|everything|all details)\b/.test(factText) ? 'full'
    : /\b(client number|customer number|client phone|customer phone|phone|telephone|mobile|contact)\b/.test(factText) ? 'client_phone'
      : /\b(order number|number of (?:the )?order|its number|their number|what number)\b/.test(factText) ? 'order_number'
        : /\b(payment|paid|unpaid|owe|settled)\b/.test(factText) ? 'payment_status'
          : /\b(status|state|done|complete|processing|pending)\b/.test(factText) ? 'status'
            : /\b(when|date|day|due|scheduled|deliver)\b/.test(factText) ? 'delivery_date'
              : /\b(time|hour)\b/.test(factText) ? 'delivery_time'
                : /\bdelivery method\b/.test(factText) ? 'delivery_method'
                  : /\b(balance|amount due|left to pay|how much.*owe)\b/.test(factText) ? 'amount_due'
                    : /\b(total|cost|price|value)\b/.test(factText) ? 'total_amount'
                      : /\b(items?|products?|flowers?|ordered|contain)\b/.test(factText) ? 'items'
                        : /\b(notes?|instructions?|message)\b/.test(factText) ? 'notes'
                          : /\b(name|who|customer|client)\b/.test(factText) ? 'client_name' : null
  return field ? { type: 'order_lookup', orderNumber, facts: [field], prompt: question } : null
}

export function contextualTaskFollowup(question, context, previousIntent = null) {
  const prior = context?.intent || previousIntent
  if (!prior?.type) return null
  const text = normalizeIntentText(question).replace(/[?.!]+$/g, '').trim()
  if (prior.type === 'order_create' && context?.currentTask?.type === 'order_create') return { ...prior, prompt: question }
  if (prior.type === 'capabilities' && /\b(?:what else|anything else|more)\b/.test(text)) return { ...prior, prompt: question }
  if (prior.type === 'greeting' && /\bhow are you(?: doing)?\b/.test(text)) return { type: 'greeting', prompt: question }
  if (prior.type === 'help' && /\bhelp me\b/.test(text) && !/\b(?:create|make|place|edit|change|find|search|open|record|pay|cancel|delete)\b/.test(text)) return { type: 'help', prompt: question }
  const datePeriod = reportPeriodFromText(text)
  if (['created_today', 'orders_period'].includes(prior.type) && datePeriod) {
    if (prior.type === 'created_today' && ['today', 'yesterday', 'tomorrow'].includes(datePeriod.label)) {
      return { ...prior, offset: datePeriod.label === 'yesterday' ? -1 : datePeriod.label === 'tomorrow' ? 1 : 0, prompt: question }
    }
    if (prior.type === 'orders_period') return { ...prior, period: datePeriod, prompt: question }
  }
  if (['deliveries', 'deliveries_period', 'orders_due', 'overdue'].includes(prior.type)) {
    if (datePeriod && ['today', 'tomorrow', 'yesterday'].includes(datePeriod.label)) {
      return { ...prior, type: prior.type === 'deliveries_period' ? 'deliveries' : prior.type, offset: datePeriod.label === 'tomorrow' ? 1 : datePeriod.label === 'yesterday' ? -1 : 0, targetDate: datePeriod.startDate, prompt: question }
    }
    if (datePeriod && ['deliveries', 'deliveries_period'].includes(prior.type)) return { ...prior, type: 'deliveries_period', period: datePeriod, prompt: question }
  }
  if (prior.type === 'cash_register' && /\b(transactions?|entries|activity|list|show)\b/.test(text)) return { ...prior, detail: true, prompt: question }
  if (prior.type === 'orders_status' && /\b(done|completed|complete|finished)\b/.test(text)) return { ...prior, statuses: ['done'], label: 'completed', prompt: question }
  if (prior.type === 'orders_created_by' && /\b(who|made|created|entered|them|those)\b/.test(text)) return { ...prior, prompt: question }
  if (prior.type === 'stock_waste' && /\b(details?|breakdown|which|what)\b/.test(text)) return { ...prior, detailRequested: true, prompt: question }
  if (prior.type === 'unpaid' && /\b(owe|owed|owing|balance|left to pay|still owed)\b/.test(text)) return { ...prior, prompt: question }
  if (prior.type === 'supplier_lookup' && prior.name && /\b(their|his|her|phone|number|email|contact)\b/.test(text)) {
    return { ...prior, requestedFact: /\b(email)\b/.test(text) ? 'email' : 'phone', prompt: question }
  }
  if (prior.type === 'overview' && /\b(anything else|what else|more)\b/.test(text)) return { ...prior, prompt: question }
  return null
}

export function contextualCustomerFollowup(question, context) {
  if (context?.topic !== 'customers' && context?.activeEntity?.type !== 'customer') return null
  const customer = context?.activeEntity?.type === 'customer' ? context.activeEntity.name : context?.activeCustomer
  if (!customer) return null
  const text = normalizeIntentText(question)
  const factText = text.replace(/^(?:(?:and|also|please|what about|et pour|et|and for|s il te plait|s il vous plait)\s+|(?:وماذا عن|وكذلك|من فضلك)\s*)+/u, '').replace(/\s+(?:please|s il te plait|s il vous plait)$/u, '').trim()
  const refersToCustomer = /\b(their|his|her|them|that customer|this customer|that client|this client)\b/.test(text)
  const bareFact = /^(?:phone|number|email|orders?|history|spent|total spent|last order|when did they last order)[?.!\s]*$/.test(factText)
  if (!refersToCustomer && !bareFact) return null
  return { type: 'customer_lookup', name: customer, requestedFact: /\b(phone|number|contact)\b/.test(factText) ? 'phone' : /\b(email)\b/.test(factText) ? 'email' : /\b(last order|when)\b/.test(factText) ? 'last_order' : /\b(spent|total spent)\b/.test(factText) ? 'total_spent' : /\b(orders?|history)\b/.test(factText) ? 'order_history' : null, prompt: question }
}

export function contextualProductFollowup(question, context) {
  if (context?.topic !== 'stock' && context?.activeEntity?.type !== 'product') return null
  const product = context?.activeEntity?.type === 'product' ? context.activeEntity.name : context?.activeProduct
  if (!product) return null
  const text = normalizeIntentText(question)
  const refersToProduct = /\b(it|its|that product|this product|that flower|this flower)\b/.test(text)
  const asksPrice = /\b(price|cost|how much)\b/.test(text)
  const asksStock = /\b(stock|quantity|left|remaining|available|in stock|inventory)\b/.test(text)
  if (!refersToProduct && !(asksPrice || asksStock)) return null
  if (asksPrice) return { type: 'product_price', search: productSearchTerms(product).join(' '), prompt: question }
  if (asksStock) return { type: 'product_stock', search: productSearchTerms(product).join(' '), prompt: question }
  return null
}

export function guardIntent(question, intent, previousIntent) {
  const text = normalizeIntentText(question)
  const explicitDateScope = /\b(today|tonight|tomorrow|yesterday|this week|next week|last week|this month|last month|\d{4}-\d{2}-\d{2}|due today|due tomorrow)\b/.test(text)
  const explicitOrderScope = /\b(?:order|orders|commande|commandes)\b/.test(text)
  const customerRelation = /\b(?:client|customer)\b/.test(text)
    || /\b(?:his|her|their|its)\s+orders?\b/.test(text)
    || /\borders?\s+(?:for|from|of|belonging to)\s+[a-z\p{L}]/u.test(text)

  if (intent.type === 'orders_due' && !explicitDateScope && !['orders_due', 'deliveries'].includes(previousIntent?.type)) {
    return { type: 'order_clarification', prompt: question }
  }
  if (intent.type === 'orders_due' && customerRelation && !explicitDateScope) {
    return { type: 'order_clarification', prompt: question }
  }
  if (intent.type === 'help' && explicitOrderScope && /\b(what|which|show|find|search|tell|list|have|has|contains|include|status|paid|payment|items?|products?)\b/.test(text)) {
    return { type: 'order_clarification', prompt: question }
  }
  return intent
}
